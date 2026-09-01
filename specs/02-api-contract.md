# 02 — API Contract

**Purpose.** This document is the wire contract between the Next.js Route Handlers and every
client that calls them (the React app, the Vitest integration suite, and a reviewer with `curl`).
It expands §7 of `00-foundation.md` into an unambiguous, buildable specification: for every route,
the exact file it lives in, its auth requirement, its Zod request schema, its success status and
TypeScript response type, and an exhaustive list of its failure modes. It also fixes the shared
plumbing every handler uses — the error envelope, the `ApiErrorCode` union, `lib/api.ts`, the
403-vs-404 rule, and the optimistic-concurrency protocol on `PATCH /api/documents/:id`. Frontend
and backend are built in parallel against this file; if the two disagree at integration time, this
file wins and the loser changes.

Related specs: `00-foundation.md` (canonical decisions — never contradicted here, and the tie-breaker
for everything in §2a, §5a, §6a, §7a and §7b), `03-auth-and-permissions.md` (session issuance and
verification, the permission core), `05-import-spec.md` (`.md`/`.txt`/`.docx` → ProseMirror JSON),
`04-ui-spec.md` (the client that consumes this), and `06-test-plan.md` (the suite that asserts it).

---

## 1. Global invariants

These hold for **every** route. An implementer who breaks one has broken the contract.

| # | Invariant |
|---|---|
| I1 | Every response — success and failure — has a JSON body. **There are no `204`s.** A client may always call `await res.json()`. |
| I2 | Every response carries `Cache-Control: no-store`. Set once, in `ok()` / `fail()`. |
| I3 | Every failure body is exactly `{ error: { code, message, details? } }`. Nothing else. Never a bare string, never `{ message }`. |
| I4 | Every `code` is a member of the `ApiErrorCode` union in §2. No route invents a code. |
| I5 | All timestamps on the wire are ISO 8601 UTC with milliseconds — `Date.prototype.toISOString()`, e.g. `2026-09-01T14:32:07.913Z`. `JSON.stringify` of a Prisma `DateTime` already produces this. |
| I6 | All ids are **opaque strings** — validate as `z.string().min(1).max(64)`, **never `z.string().cuid()`**. The seed uses human-readable ids (`seed-doc-roadmap`), so a cuid check would `400` every seeded document. Client code never parses or constructs them. |
| I7 | Unknown keys in a JSON request body are **stripped**, not rejected (Zod's default object behaviour in v4 as in v3). Adding a field to a request is therefore never a breaking change. |
| I8 | Mutating routes (`POST`/`PATCH`/`DELETE`) require `Content-Type: application/json`, except `POST /api/documents/import` (multipart). A body that is not parseable JSON is `400 VALIDATION_FAILED`. |
| I9 | Same-origin only. **No CORS headers are emitted.** The API is not a public API. |
| I10 | No rate limiting, no CSRF token. Explicit non-goals — see §11. |
| I11 | Every route file exports `runtime = 'nodejs'` and every `GET` route file also exports `dynamic = 'force-dynamic'` (§10). |
| I12 | `message` is user-presentable English. `code` is what the client branches on. The client must **never** branch on `message`. |

### 1.1 Status codes in use

| Status | Used for |
|---|---|
| `200` | successful read, update, delete, upsert |
| `201` | resource created (`POST /api/documents`, `POST /api/documents/import`) |
| `400` | malformed/invalid request (`VALIDATION_FAILED`, `FILE_MISSING`, `CANNOT_SHARE_WITH_SELF`) |
| `401` | no/invalid session (`UNAUTHENTICATED`) or bad login (`INVALID_CREDENTIALS`) |
| `403` | authenticated, can see the resource, not allowed this operation |
| `404` | resource does not exist **or** caller has no access at all |
| `409` | optimistic-concurrency conflict |
| `413` | payload over a hard limit |
| `415` | unsupported uploaded file type |
| `422` | well-formed upload we could not parse |
| `500` | unhandled server error |

`405` is produced by the Next.js framework itself when a method has no exported handler in the
route file. We do not hand-roll it and it does not use our envelope. That is accepted.

---

## 2. Error envelope and the `ApiErrorCode` union

`lib/api-types.ts` — imported by both server and client, so a typo in a code is a compile error.

```ts
// lib/api-types.ts

/** The ONLY machine-readable failure codes this API emits. */
export type ApiErrorCode =
  // 400
  | 'VALIDATION_FAILED'      // body/query failed Zod, or was not valid JSON
  | 'FILE_MISSING'           // multipart upload with no usable `file` part, or a 0-byte file
  | 'CANNOT_SHARE_WITH_SELF' // owner tried to share a document with themselves
  // 401
  | 'UNAUTHENTICATED'        // no session cookie, or it failed jose verification
  | 'INVALID_CREDENTIALS'    // login: unknown email OR wrong password (never distinguished)
  // 403
  | 'FORBIDDEN'              // caller can see the document but lacks this capability
  // 404
  | 'NOT_FOUND'              // document absent, or caller's access is NONE (see §5)
  | 'USER_NOT_FOUND'         // share target email matches no seeded user
  | 'SHARE_NOT_FOUND'        // no share row for (documentId, userId)
  // 409
  | 'CONFLICT'               // lastKnownUpdatedAt did not match the row (see §6)
  // 413
  | 'FILE_TOO_LARGE'         // uploaded file over MAX_FILE_BYTES
  | 'CONTENT_TOO_LARGE'      // serialised PM content over MAX_CONTENT_BYTES
  // 415
  | 'UNSUPPORTED_FILE_TYPE'  // upload extension not in {.md, .txt, .docx}
  // 422
  | 'PARSE_FAILED'           // file accepted but not convertible; details: { reason: string }
  // 500
  | 'INTERNAL_ERROR';        // anything unhandled; details are never leaked

export type ApiErrorBody = {
  error: {
    code: ApiErrorCode;
    message: string;
    /** Present only where this document says so. Shape is per-code, see §4 and §6. */
    details?: unknown;
  };
};
```

Canonical code → status mapping. A code always maps to the same status:

| Code | Status | Fires when |
|---|---|---|
| `VALIDATION_FAILED` | 400 | Zod rejected the body/query, or the body was not JSON |
| `FILE_MISSING` | 400 | import request was not multipart, had no `file` field, or the file was 0 bytes |
| `CANNOT_SHARE_WITH_SELF` | 400 | `POST .../shares` where target email == session user's email |
| `UNAUTHENTICATED` | 401 | `withSession` found no valid session |
| `INVALID_CREDENTIALS` | 401 | login email unknown **or** bcrypt compare failed |
| `FORBIDDEN` | 403 | `resolveAccess` returned a real role, but `can(role, cap)` is false |
| `NOT_FOUND` | 404 | `resolveAccess` returned `NONE` (includes "document does not exist") |
| `USER_NOT_FOUND` | 404 | share target email not in `User` |
| `SHARE_NOT_FOUND` | 404 | **`PATCH`** on a share row that does not exist. `DELETE` of a share is idempotent and never emits this. |
| `CONFLICT` | 409 | conditional update matched 0 rows and the document still exists |
| `FILE_TOO_LARGE` | 413 | uploaded file over `MAX_FILE_BYTES` (`lib/import/constants.ts`) |
| `CONTENT_TOO_LARGE` | 413 | `contentByteSize(content) > MAX_CONTENT_BYTES` — on `PATCH` **and** on an import result |
| `UNSUPPORTED_FILE_TYPE` | 415 | filename extension not `.md` / `.txt` / `.docx` |
| `PARSE_FAILED` | 422 | mammoth/markdown parse threw, produced no document node, or produced content the editor schema cannot load. `details.reason` is one of `'not-text'`, `'corrupt-docx'`, `'empty-result'`, `'unsupported-content'` — the discriminator that lets `05-import-spec.md` keep nine distinct user-facing sentences without nine codes. |
| `INTERNAL_ERROR` | 500 | anything else; logged server-side, opaque to the client |

---

## 3. Shared types

`lib/api-types.ts` (continued). These are the DTOs. They are **not** Prisma models — `passwordHash`
never leaves the server, and list endpoints never ship `content`.

```ts
// lib/api-types.ts

/** Role of the *calling* user on a document. Superset of Prisma's ShareRole. */
export type MyRole = 'OWNER' | 'EDITOR' | 'VIEWER';

/** Role that can be *granted*. Mirrors the Prisma enum exactly. */
export type ShareRole = 'VIEWER' | 'EDITOR';

/** Access resolution result, including the negative case. See 03-auth-and-permissions.md. */
export type AccessRole = MyRole | 'NONE';

/** The only user shape ever sent to a client. No passwordHash, no createdAt. */
export type UserSummary = {
  id: string;
  name: string;
  email: string;
};

/** Loose ProseMirror document node. Structural validation only — see §3.1. */
export type ProseMirrorDoc = {
  type: 'doc';
  content?: unknown[];
  [k: string]: unknown;
};

/** Dashboard row. Deliberately has NO `content` — the list endpoint stays small. */
export type DocumentSummary = {
  id: string;
  title: string;
  owner: UserSummary;
  myRole: MyRole;
  sourceFilename: string | null;
  /** _count.shares — same query, no second round trip. 0 on rows shared WITH you.
   *  The dashboard renders "Shared with N people", which is one of the four signals
   *  C11 is graded on (04-ui-spec.md §5.2). */
  shareCount: number;
  updatedAt: string;  // ISO — this is the optimistic-concurrency token
};

export type ShareEntry = {
  userId: string;
  user: UserSummary;
  role: ShareRole;
  grantedAt: string;  // ISO (DocumentShare.createdAt)
};

/** Editor payload. `shares` is non-null ONLY when myRole === 'OWNER'. */
export type DocumentDetail = DocumentSummary & {
  content: ProseMirrorDoc;
  shares: ShareEntry[] | null;
};
```

### 3.1 ProseMirror content validation

We do **not** validate against the TipTap schema on the server — that would mean instantiating an
editor per request for no security benefit (content is stored as JSON and rendered by TipTap, never
as `dangerouslySetInnerHTML`; see `00-foundation.md` §2, "sidesteps HTML-sanitization footguns").
We validate the outer shape and the size, and nothing else.

**This schema is not defined here.** `lib/documents/content.ts` (owned by
`01-data-and-persistence.md` §5) is the single definition of the content guard, `EMPTY_DOC`,
`MAX_CONTENT_BYTES` and `contentByteSize`; `lib/import/constants.ts` (owned by `05-import-spec.md`)
is the single definition of `MAX_FILE_BYTES`. `lib/schemas.ts` holds **request** schemas only and
imports both — it re-exports nothing. Four modules defining `EMPTY_DOC` is how the editor and the
importer end up disagreeing about what a document is.

```ts
// lib/documents/content.ts — restated here for reference, owned by 01
export const MAX_CONTENT_BYTES = 1_000_000;                 // 1 MB of serialised PM JSON

export const documentContentSchema = z.looseObject({        // Zod 4
  type: z.literal('doc'),
  content: z.array(z.looseObject({ type: z.string().min(1) })).max(10_000),
});
```

The guard asserts the **root shape only** — `type: 'doc'` plus an array of typed children. It does
*not* walk the tree. `01-data-and-persistence.md` §5.2 gives five reasons, the load-bearing one
being that the authoritative schema already exists in the TipTap extension list and a Zod copy of it
is a second source of truth that drifts the first time the toolbar changes. A recursive `z.lazy`
node schema with a depth cap was specified, priced at ~30 minutes, and cut.

The size ceiling is **not** inside the schema — it is a separate check in the handler, because a
size failure is `413 CONTENT_TOO_LARGE` and a shape failure is `400 VALIDATION_FAILED`, and
re-mapping one to the other through a Zod issue message was a string-matching hack. See §7.8.

### 3.2 Empty-document content

Every new document (both `POST /api/documents` and a `.txt` import that yields nothing) starts as:

```json
{ "type": "doc", "content": [{ "type": "paragraph" }] }
```

Exported as `EMPTY_DOC` from **`lib/documents/content.ts`** — the only definition in the repo. An
empty `content: []` array makes TipTap unhappy on mount; a single empty paragraph does not.

---

## 4. `lib/api.ts` — the shared plumbing

Every route handler is a thin body wrapped by these. Write this file **first**; nothing else in the
backend compiles cleanly without it.

```ts
// lib/api.ts
import { NextResponse, type NextRequest } from 'next/server';
import { z, ZodError, type ZodType } from 'zod';
// 03-auth-and-permissions.md. NOT `lib/session.ts` — that module imports `next/headers`,
// whose `cookies()` throws outside a request scope and would make every handler
// untestable (00-foundation.md §7c).
import { getSessionFromRequest, type SessionUser } from '@/lib/session-token';
import type { ApiErrorCode } from '@/lib/api-types';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

/** Success. Always JSON, always no-store. */
export function ok<T>(data: T, status = 200): NextResponse<T> {
  return NextResponse.json(data, { status, headers: NO_STORE });
}

/** Failure. The ONLY way an error body is ever produced. */
export function fail(
  code: ApiErrorCode,
  message: string,
  status: number,
  details?: unknown,
): NextResponse {
  return NextResponse.json(
    { error: { code, message, ...(details !== undefined ? { details } : {}) } },
    { status, headers: NO_STORE },
  );
}

/** Throwable equivalent of `fail`, so helpers deep in lib/ can abort a request. */
export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Single funnel from thrown values to responses. */
export function toResponse(err: unknown): NextResponse {
  if (err instanceof ApiError) return fail(err.code, err.message, err.status, err.details);
  if (err instanceof ZodError) {
    // Zod 4: z.flattenError(err), not err.flatten() (00-foundation.md §2a).
    return fail('VALIDATION_FAILED', 'Request validation failed.', 400, z.flattenError(err));
  }
  console.error('[api] unhandled error:', err);
  return fail('INTERNAL_ERROR', 'Something went wrong on our side.', 500);
}

/** Parse + validate a JSON body. Throws ApiError(400) on bad JSON or Zod failure. */
export async function parseJson<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError('VALIDATION_FAILED', 'Request body must be valid JSON.', 400, {
      formErrors: ['Request body must be valid JSON.'],
      fieldErrors: {},
    });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError('VALIDATION_FAILED', 'Request validation failed.', 400, z.flattenError(parsed.error));
  }
  return parsed.data;
}

/** Validate URLSearchParams the same way. */
export function parseQuery<T>(req: NextRequest, schema: ZodType<T>): T {
  const parsed = schema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    throw new ApiError('VALIDATION_FAILED', 'Invalid query parameters.', 400, z.flattenError(parsed.error));
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------
// withSession
// ---------------------------------------------------------------------------

/** Next.js 16 (as 15): dynamic route params arrive as a Promise. */
export type RouteContext<P> = { params: Promise<P> };

export type SessionHandler<P> = (
  req: NextRequest,
  ctx: { params: Promise<P>; session: SessionUser },
) => Promise<Response>;

/**
 * Wraps a handler so it (a) 401s without a valid session, (b) receives the session,
 * (c) never leaks a thrown error. Use on EVERY non-public route.
 */
export function withSession<P = Record<string, never>>(handler: SessionHandler<P>) {
  return async (req: NextRequest, ctx?: RouteContext<P>): Promise<Response> => {
    try {
      const session = await getSessionFromRequest(req);
      if (!session) return fail('UNAUTHENTICATED', 'You must be signed in.', 401);
      const params = ctx?.params ?? Promise.resolve({} as P);
      return await handler(req, { params, session });
    } catch (err) {
      return toResponse(err);
    }
  };
}

/** Same error funnel, no session requirement. Used only by POST /api/auth/login. */
export function withPublic<P = Record<string, never>>(
  handler: (req: NextRequest, ctx: { params: Promise<P> }) => Promise<Response>,
) {
  return async (req: NextRequest, ctx?: RouteContext<P>): Promise<Response> => {
    try {
      return await handler(req, { params: ctx?.params ?? Promise.resolve({} as P) });
    } catch (err) {
      return toResponse(err);
    }
  };
}
```

`SessionUser` is defined in `03-auth-and-permissions.md`; for this contract it is
`{ id: string; email: string; name: string }` — decoded from the JWT, **not** re-fetched from the DB
on every request. The field is **`session.id`**; `session.userId` does not exist.

### 4.1 Access guard (mechanical use of `resolveAccess`)

Defined in `lib/permissions.ts` (owned by `03-auth-and-permissions.md`) and pinned in
`00-foundation.md` §6a. **This contract does not define its own capability vocabulary** — there are
six keys, they are named there, and no route invents one:

```ts
// lib/permissions.ts  (owned by 03-auth-and-permissions.md — see 00-foundation.md §6a)
export type AccessRole = 'OWNER' | 'EDITOR' | 'VIEWER' | 'NONE';
export type Capability = 'read' | 'update' | 'rename' | 'delete' | 'viewShares' | 'manageShares';

export function can(role: AccessRole, cap: Capability): boolean;                 // pure, total
export function resolveAccess(userId, documentId): Promise<ResolvedAccess>;      // { role, document }

/** Throws ApiError(404 NOT_FOUND) when role is NONE, ApiError(403 FORBIDDEN) otherwise.
 *  Returns the resolved access — with a non-null `document`, so a GET does not re-query. */
export function requireAccess(
  userId: string,
  documentId: string,
  cap: Capability,
): Promise<{ role: MyRole; document: Document }>;
```

The 4 × 6 matrix is `00-foundation.md` §6 / §6a and is asserted cell by cell in
`06-test-plan.md` §3.

### 4.2 Auth-requirement markers used in §7

| Marker | Means | Implemented as |
|---|---|---|
| **public** | anyone | `withPublic(...)` |
| **session** | any signed-in user | `withSession(...)` |
| **read** | signed in + role ≠ `NONE` | `withSession` + `requireAccess(uid, id, 'read')` |
| **write** | signed in + `update` and/or `rename` | `withSession` + `requireAccess` for **each** capability the body exercises (§7.8) |
| **owner** | signed in + role = OWNER | `withSession` + `requireAccess(uid, id, 'delete' \| 'viewShares' \| 'manageShares')` |

### 4.3 `lib/documents/queries.ts` — the shared read layer (owned by this spec)

`04-ui-spec.md` §1 mandates that Server Components read the database directly rather than fetching
their own API. That is correct — a self-fetch costs a network hop, absolute URLs and cookie
forwarding — but it creates a trap: the code path a reviewer exercises by *browsing* would be a
second implementation of "what may this person see", and the only one with no test. That is exactly
the drift `00-foundation.md` §6 rule 2 forbids.

So the read is a module, not a duplicated query, and **both** consumers call it:

```ts
// lib/documents/queries.ts   (owned by 02-api-contract.md, imported by 04's pages)
export function listDocumentsFor(userId: string): Promise<ListDocumentsResponse>;
export function getDocumentFor(userId: string, id: string): Promise<DocumentDetail | null>;
```

- They return the **wire shapes** from §3 — `owner`, `myRole`, `sourceFilename`, `shareCount`
  (via `_count.shares`, one query, not a second round trip), and `shares` non-null only for an
  owner. A Server Component and `GET /api/documents/:id` therefore render from identical data.
- `getDocumentFor` returns `null` for both "no such document" and "no access", so the page calls
  `notFound()` and the route handler returns `404` from the same fact.
- Both go through `resolveAccess`. There is one implementation of the access rule, and
  `06-test-plan.md`'s integration cases cover it through the handlers, which means they also cover
  the pages.

---

## 5. The 403-vs-404 policy, as a mechanical rule

`00-foundation.md` §6 rule 1 says `NONE` gets `404`. Here is the rule an implementer applies
without thinking:

```
For any route that names a :id document:

  1. const { role, document } = await resolveAccess(session.id, id)
  2. if (role === 'NONE')          -> 404 { code: 'NOT_FOUND' }        // STOP
  3. if (!can(role, capability))   -> 403 { code: 'FORBIDDEN' }        // STOP
  4. proceed  (document is non-null here — no second query)

In practice every handler calls `requireAccess(session.id, id, cap)`, which is these
four lines. No handler re-implements them, and no handler compares `ownerId` inline.
```

Consequences the implementer must not "fix":

- **A document that does not exist and a document you cannot see are indistinguishable.**
  `resolveAccess` returns `NONE` for both, so both produce a byte-identical
  `404 {"error":{"code":"NOT_FOUND","message":"Document not found."}}`. There is no timing or
  message oracle. This is deliberate; do not add a `DOCUMENT_DELETED` code.
- **`403` is only ever reachable by someone who can already read the document.** Bob (EDITOR)
  calling `DELETE /api/documents/:id` gets `403` — he already knows the document exists, so the
  `403` leaks nothing new and is far more useful to the UI than a lying `404`.
- **`404` is never used for "wrong role".** If you are about to return `404` for a user whose role
  is `OWNER`/`EDITOR`/`VIEWER`, you have mis-implemented step 3.
- **Sub-resources follow the parent.** `/api/documents/:id/shares/:userId` first resolves access on
  `:id` (404/403 per above). Only after that does a missing share row produce
  `404 SHARE_NOT_FOUND` — a distinct code, because at that point the caller is the proven owner and
  there is nothing left to hide.

The permission matrix in `06-test-plan.md` §3 asserts this table cell by cell.

---

## 6. Optimistic concurrency on `PATCH /api/documents/:id`

This is the project's honest answer to "we did not build real-time collaboration"
(`00-foundation.md` §4). It must work exactly as written.

### 6.1 The token

`updatedAt` **is** the concurrency token. It is returned by every endpoint that returns a document
(`GET /api/documents`, `GET /api/documents/:id`, `POST /api/documents`, `POST /api/documents/import`,
and every successful `PATCH`). The client stores the most recent one it has seen for that document
and sends it back as `lastKnownUpdatedAt` on the next `PATCH`.

**Invariant: every `200` from `PATCH /api/documents/:id` returns the new `updatedAt`.** A client
that fails to advance its token will 409 itself on its next save. This is the whole of R4 in
`00-foundation.md` §9.

### 6.2 The comparison — Date-instant equality, not string equality

**Decision: compare as `Date` instants (epoch milliseconds), never as strings.**

Justification:

- Prisma maps `DateTime` to Postgres `timestamp(3)` — **millisecond** precision. JavaScript `Date`
  is also millisecond precision. The round trip DB → Prisma → `toISOString()` → client → back is
  therefore lossless, so instant equality is exact, not approximate.
- ISO 8601 has multiple correct spellings of the same instant: `2026-09-01T14:32:07.913Z`,
  `2026-09-01T14:32:07.913+00:00`, and `2026-09-01T11:32:07.913-03:00` are the same moment.
  String equality would 409 on all but the first. A client written in another language, or a
  reviewer typing a `curl` by hand, would hit spurious conflicts. That is a bug surface we get for
  free by comparing instants.
- The only thing string equality buys is avoiding a `new Date()` call. Not a trade worth making.

The comparison is performed **by the database**, inside a single conditional `UPDATE`, so there is
no read-then-write race:

```ts
const token = new Date(body.lastKnownUpdatedAt);        // Zod already proved it parses

const result = await prisma.document.updateMany({
  where: { id, updatedAt: token },                       // SQL: ... AND "updatedAt" = $n
  data: {
    ...(body.title   !== undefined ? { title: body.title }     : {}),
    ...(body.content !== undefined ? { content: body.content } : {}),
  },
});

if (result.count === 0) {
  // Either the token is stale, or the row vanished between the access check and here.
  const current = await prisma.document.findUnique({
    where: { id },
    select: { updatedAt: true },
  });
  if (!current) throw new ApiError('NOT_FOUND', 'Document not found.', 404);
  throw new ApiError('CONFLICT', 'This document was changed somewhere else.', 409, {
    currentUpdatedAt: current.updatedAt.toISOString(),
    lastKnownUpdatedAt: body.lastKnownUpdatedAt,
  });
}

const fresh = await prisma.document.findUniqueOrThrow({
  where: { id },
  select: { id: true, title: true, updatedAt: true },
});
return ok<PatchDocumentResponse>({
  id: fresh.id,
  title: fresh.title,
  updatedAt: fresh.updatedAt.toISOString(),
});
```

The JS-level equivalent of the same predicate, used in unit tests, is:

```ts
new Date(lastKnownUpdatedAt).getTime() === row.updatedAt.getTime()   // ✅
lastKnownUpdatedAt === row.updatedAt.toISOString()                    // ❌ never do this
```

`updatedAt` is `@updatedAt` in the Prisma schema, so Prisma sets the new value on every `UPDATE`
even when the written values are identical to the stored ones. A no-op save still advances the
token, which is correct: it means "someone wrote after you read".

### 6.3 The 409 body

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "This document was changed somewhere else.",
    "details": {
      "currentUpdatedAt": "2026-09-01T14:32:09.220Z",
      "lastKnownUpdatedAt": "2026-09-01T14:32:07.913Z"
    }
  }
}
```

`details` for `CONFLICT` is exactly:

```ts
type ConflictDetails = { currentUpdatedAt: string; lastKnownUpdatedAt: string };
```

The 409 deliberately does **not** include the current content. The client's recovery is "Reload" —
a plain `GET /api/documents/:id` — which keeps this response small and keeps one code path for
loading a document. No merge, no diff; see `00-foundation.md` §4.

### 6.4 Sequence: two clients producing a 409

```mermaid
sequenceDiagram
    autonumber
    participant A as Client A (Alice, tab 1)
    participant B as Client B (Bob, editor)
    participant API as PATCH /api/documents/d1
    participant DB as Postgres

    Note over A,B: both opened d1; both hold token T0 = 2026-09-01T14:32:07.913Z

    A->>API: PATCH { content: <A's edit>, lastKnownUpdatedAt: T0 }
    API->>DB: UPDATE "Document" SET content=..., "updatedAt"=now()<br/>WHERE id='d1' AND "updatedAt"=T0
    DB-->>API: rowCount = 1
    API->>DB: SELECT id, title, "updatedAt" WHERE id='d1'
    DB-->>API: updatedAt = T1 (14:32:09.220Z)
    API-->>A: 200 { id:'d1', title:'…', updatedAt: T1 }
    Note over A: A advances its token: T0 → T1

    B->>API: PATCH { content: <B's edit>, lastKnownUpdatedAt: T0 }
    API->>DB: UPDATE "Document" SET content=..., "updatedAt"=now()<br/>WHERE id='d1' AND "updatedAt"=T0
    DB-->>API: rowCount = 0
    API->>DB: SELECT "updatedAt" WHERE id='d1'
    DB-->>API: T1  (row exists → stale token, not a deletion)
    API-->>B: 409 CONFLICT { currentUpdatedAt: T1, lastKnownUpdatedAt: T0 }
    Note over B: UI: "This document changed elsewhere. [Reload]"<br/>B's edit is NOT written. Nothing is lost silently.
```

### 6.5 Client-side rule (binding on the editor spec)

The editor must keep **at most one in-flight `PATCH` per document**. Autosave debounces, and if a
save is already in flight the next one queues and reuses the `updatedAt` returned by the one that
landed. Firing two overlapping `PATCH`es from the same tab produces a self-inflicted 409 — that is
R4, and the fix is serialization on the client, not loosening the check on the server.

---

## 7. Routes

Ten files (nine here plus `app/api/health/route.ts`, owned by `07-deployment-runbook.md` §0 and
wrapped in `withPublic` like any other route). Path collision note: **`app/api/documents/import/route.ts` and
`app/api/documents/[id]/route.ts` coexist** — Next.js App Router resolves the static segment
`import` before the dynamic `[id]`, so `POST /api/documents/import` never reaches the `[id]`
handler. No workaround needed; do not rename the route.

---

### 7.1 `POST /api/auth/login`

| | |
|---|---|
| File | `app/api/auth/login/route.ts` |
| Auth | **public** |
| Runtime | `nodejs` (bcryptjs) |

**Request**

```ts
// lib/schemas.ts
export const loginSchema = z.object({
  email: z.email().trim().toLowerCase(),   // Zod 4: z.email(), not z.string().email()
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

// NOTE for the UI: `min(1)`, not `min(8)`. The client imports THIS schema
// (04-ui-spec.md §4.2) so a wrong-but-short password reaches the server and
// produces the 401 the demo is meant to show, instead of a client-side field error.
```

**Success — `200`**

```ts
export type LoginResponse = { user: UserSummary };
```

Plus `Set-Cookie: shared_docs_session=<jose HS256 JWT>; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`
(`Secure` added when `process.env.NODE_ENV === 'production'`). The name is the exported constant
`SESSION_COOKIE` from `lib/session-token.ts` — **one constant, used by the login route and the
middleware**, because a login that writes one name while middleware reads another produces a login
that appears to succeed and then 401s on every subsequent request. Cookie details are owned by
`03-auth-and-permissions.md`.

**Failures**

| Status | `code` | Fires when |
|---|---|---|
| 400 | `VALIDATION_FAILED` | body not JSON; `email` missing/not an email; `password` empty or > 200 chars |
| 401 | `INVALID_CREDENTIALS` | no user with that email, **or** `bcrypt.compare` returned false |
| 500 | `INTERNAL_ERROR` | DB unreachable (`AUTH_SECRET` missing fails at boot, not here — `lib/env.ts` is fail-fast) |

Unknown-email and wrong-password return the **same** code and the same message
(`"Email or password is incorrect."`). To avoid a timing oracle, when the user lookup misses, still
run `bcrypt.compare(password, DUMMY_HASH)` before failing (see `03-auth-and-permissions.md`).

---

### 7.2 `POST /api/auth/logout`

| | |
|---|---|
| File | `app/api/auth/logout/route.ts` |
| Auth | **public** (`withPublic`) |
| Runtime | `nodejs` |

**Request** — no body. Any body sent is ignored (not parsed, not validated).

**Success — `200`, always**

```ts
export type LogoutResponse = { ok: true };
```

Plus `Set-Cookie: shared_docs_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`.

**Failures**

| Status | `code` | Fires when |
|---|---|---|
| 500 | `INTERNAL_ERROR` | unhandled |

**Logout is idempotent and never `401`s** — with no cookie, an expired one, or a forged one, it
clears the cookie and returns `200`. `00-foundation.md` §7 marks the route `public` for exactly this
reason: a logout that fails because you are already logged out is worse UX for zero security gain,
and it forced the client to treat a `401` as success, which is the kind of special case that hides a
real one later.

---

### 7.3 `GET /api/auth/me`

| | |
|---|---|
| File | `app/api/auth/me/route.ts` |
| Auth | **session** |
| Runtime | `nodejs`, `dynamic = 'force-dynamic'` |

**Request** — none.

**Success — `200`**

```ts
export type MeResponse = { user: UserSummary };
```

Served from the verified JWT claims; **no DB round trip**.

**Failures**

| Status | `code` | Fires when |
|---|---|---|
| 401 | `UNAUTHENTICATED` | no cookie, malformed JWT, bad signature, or `exp` passed |

---

### 7.4 `GET /api/documents`

| | |
|---|---|
| File | `app/api/documents/route.ts` |
| Auth | **session** |
| Runtime | `nodejs`, `dynamic = 'force-dynamic'` |

**Request** — none. No pagination, no filters (`00-foundation.md` §4).

**Success — `200`**

```ts
export type ListDocumentsResponse = {
  owned: DocumentSummary[];        // myRole is always 'OWNER'
  sharedWithMe: DocumentSummary[]; // myRole is 'EDITOR' | 'VIEWER'
};
```

Both arrays sorted by `updatedAt` **descending**. `content` is never included. `owned` is
`Document where ownerId = session.id`; `sharedWithMe` is joined through `DocumentShare where
userId = session.id`. A document appears in exactly one array — the owner cannot hold a share row
on their own document (enforced by `CANNOT_SHARE_WITH_SELF`, §7.10).

**Failures**

| Status | `code` | Fires when |
|---|---|---|
| 401 | `UNAUTHENTICATED` | no session |
| 500 | `INTERNAL_ERROR` | DB error |

---

### 7.5 `POST /api/documents`

| | |
|---|---|
| File | `app/api/documents/route.ts` (same file as 7.4) |
| Auth | **session** |
| Runtime | `nodejs` |

**Request**

```ts
export const createDocumentSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
});
```

An empty body `{}` is valid; so is no body at all — the handler tolerates a missing body by
treating a JSON parse failure on `POST /api/documents` as `{}`:

```ts
const body = await req.text();
const input = createDocumentSchema.parse(body ? JSON.parse(body) : {});
```

(Use this local form here only. Everywhere else, `parseJson`.)

Defaults: `title = 'Untitled document'`, `content = EMPTY_DOC`, `sourceFilename = null`,
`ownerId = session.id`.

**Success — `201`**

```ts
export type CreateDocumentResponse = DocumentSummary;
```

`00-foundation.md` §7 specifies `201 {id}`; returning the full `DocumentSummary` is a superset — the
client reads `.id` to `router.push('/documents/' + id)` and gets the dashboard row for free without
a refetch.

**Failures**

| Status | `code` | Fires when |
|---|---|---|
| 400 | `VALIDATION_FAILED` | `title` present but empty after trim, or > 200 chars |
| 401 | `UNAUTHENTICATED` | no session |
| 500 | `INTERNAL_ERROR` | DB error |

---

### 7.6 `POST /api/documents/import`

| | |
|---|---|
| File | `app/api/documents/import/route.ts` |
| Auth | **session** |
| Runtime | `nodejs` (mammoth, Buffer, possibly jsdom — see R1) |

**Request — `multipart/form-data`**

| Part | Type | Required | Rules |
|---|---|---|---|
| `file` | File | ✅ | extension ∈ `ACCEPTED_EXTENSIONS` (case-insensitive); size ≤ `MAX_FILE_BYTES` (2 MB), both from `lib/import/constants.ts` |
| `title` | string | ✖ | if present: trimmed, 1–200 chars; overrides the filename-derived title |

There is no Zod schema for the file itself — `FormData` is not JSON. The metadata **is** validated:

```ts
export const importMetaSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
});
```

`ACCEPTED_EXTENSIONS` and `MAX_FILE_BYTES` are **not** redeclared here — they live in
`lib/import/constants.ts` beside `IMPORT_LIMITS_COPY`, so the picker, the server and the README can
never advertise three different limits.

Validation order (fail fast, cheapest first):

1. `req.formData()` throws, `form.get('file')` is not a `File`, or `file.size === 0`
   → **400 `FILE_MISSING`**
2. extension not in `ACCEPTED_EXTENSIONS`, or a positively-wrong MIME → **415 `UNSUPPORTED_FILE_TYPE`**
   (the extension is authoritative — MIME is unreliable: `.md` commonly arrives as
   `application/octet-stream` or as `""`)
3. `file.size > MAX_FILE_BYTES` → **413 `FILE_TOO_LARGE`**, checked **before** `arrayBuffer()`
4. `importMetaSchema` on `title` → **400 `VALIDATION_FAILED`**
5. parse throws, yields no `doc` node, or yields content the editor schema cannot load
   → **422 `PARSE_FAILED`** with `details.reason` (§2)
6. the parsed result exceeds `MAX_CONTENT_BYTES` → **413 `CONTENT_TOO_LARGE`**

Title resolution: `title` part → else filename minus extension, trimmed and truncated to 200 →
else `'Untitled document'`. `sourceFilename` is always set to `file.name` (truncated to 255).

**Success — `201`**

```ts
export type ImportDocumentResponse = DocumentSummary;  // sourceFilename is non-null
```

**Failures**

| Status | `code` | Fires when |
|---|---|---|
| 400 | `FILE_MISSING` | not multipart, or no `file` part, or `file` is not a File |
| 400 | `VALIDATION_FAILED` | `title` part present but empty/too long |
| 401 | `UNAUTHENTICATED` | no session |
| 413 | `FILE_TOO_LARGE` | > 2 MB |
| 415 | `UNSUPPORTED_FILE_TYPE` | extension outside the allowlist — `message` names the three accepted types verbatim, because C8 requires the limit be stated in the UI |
| 422 | `PARSE_FAILED` | parser threw, produced no document node, or produced unloadable content — `details.reason` says which |
| 413 | `CONTENT_TOO_LARGE` | the parsed document exceeds `MAX_CONTENT_BYTES` |
| 500 | `INTERNAL_ERROR` | DB error after a successful parse |

---

### 7.7 `GET /api/documents/:id`

| | |
|---|---|
| File | `app/api/documents/[id]/route.ts` |
| Auth | **read** |
| Runtime | `nodejs`, `dynamic = 'force-dynamic'` |

**Request** — none. `id` comes from `await params`.

**Success — `200`**

```ts
export type GetDocumentResponse = DocumentDetail;
```

`shares` is the full `ShareEntry[]` when `myRole === 'OWNER'`, and `null` otherwise. It is `null`,
not `[]` — an editor must be able to tell "I am not allowed to see this" from "there are no
shares". The `shares` query is skipped entirely for non-owners.

**Failures**

| Status | `code` | Fires when |
|---|---|---|
| 401 | `UNAUTHENTICATED` | no session |
| 404 | `NOT_FOUND` | document does not exist, **or** `resolveAccess` = `NONE` (§5) |
| 500 | `INTERNAL_ERROR` | DB error |

No `403` is reachable here — `read` is granted to every non-`NONE` role.

---

### 7.8 `PATCH /api/documents/:id`

| | |
|---|---|
| File | `app/api/documents/[id]/route.ts` |
| Auth | **write** — `update` if `content` is present, `rename` if `title` is present, **both** if both |
| Runtime | `nodejs` |

Checking both is not currently distinguishable — the same roles hold `update` and `rename` — but the
matrix is the thing allowed to change, not the call sites (`00-foundation.md` §6a).

**Request**

```ts
export const patchDocumentSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    content: documentContentSchema.optional(),   // from lib/documents/content.ts
    lastKnownUpdatedAt: z.iso.datetime(),        // Zod 4: z.iso.datetime()
  })
  .refine((b) => b.title !== undefined || b.content !== undefined, {
    message: 'Provide at least one of `title` or `content`.',
    path: ['title'],
  });
export type PatchDocumentInput = z.infer<typeof patchDocumentSchema>;
```

`lastKnownUpdatedAt` is **required on every call**, including a rename-only call. Renames and
content saves share one concurrency token; see §6.

**Success — `200`**

```ts
export type PatchDocumentResponse = {
  id: string;
  title: string;
  updatedAt: string;  // NEW token — the client MUST store this
};
```

`content` is not echoed back. The client already has it; echoing a 1 MB body on every autosave tick
is pure waste.

**Failures**

| Status | `code` | Fires when |
|---|---|---|
| 400 | `VALIDATION_FAILED` | body not JSON; `lastKnownUpdatedAt` missing or not ISO 8601; `title` empty after trim or > 200; `content` missing `type:"doc"`; neither `title` nor `content` supplied |
| 401 | `UNAUTHENTICATED` | no session |
| 403 | `FORBIDDEN` | caller is `VIEWER` — **this is the stretch feature's real enforcement point** (`00-foundation.md` §2, §6 rule 3) |
| 404 | `NOT_FOUND` | `resolveAccess` = `NONE`; **or** the row disappeared between the access check and the conditional update (count 0 + row gone, §6.2) |
| 409 | `CONFLICT` | conditional update matched 0 rows and the row still exists — `details: ConflictDetails` |
| 413 | `CONTENT_TOO_LARGE` | `contentByteSize(content) > MAX_CONTENT_BYTES` |
| 500 | `INTERNAL_ERROR` | DB error |

The size check is a **separate step after Zod**, not a Zod issue that gets re-mapped by matching on
a message string:

```ts
const input = await parseJson(req, patchDocumentSchema);

if (input.content !== undefined && contentByteSize(input.content) > MAX_CONTENT_BYTES) {
  throw new ApiError('CONTENT_TOO_LARGE', 'Document content is too large (1 MB limit).', 413);
}
```

Shape failures are `400`, size failures are `413`, and neither is inferred from the other's text.

---

### 7.9 `DELETE /api/documents/:id`

| | |
|---|---|
| File | `app/api/documents/[id]/route.ts` |
| Auth | **owner** |
| Runtime | `nodejs` |

**Request** — none. No confirmation token; the UI confirms with a dialog.

**Success — `200`**

```ts
export type DeleteDocumentResponse = { ok: true; id: string };
```

`DocumentShare` rows cascade (`onDelete: Cascade` in the schema). No soft delete, no trash
(`00-foundation.md` §4).

**Failures**

| Status | `code` | Fires when |
|---|---|---|
| 401 | `UNAUTHENTICATED` | no session |
| 403 | `FORBIDDEN` | caller is `EDITOR` or `VIEWER` |
| 404 | `NOT_FOUND` | `resolveAccess` = `NONE`, or already deleted |
| 500 | `INTERNAL_ERROR` | DB error |

---

### 7.10 `GET /api/documents/:id/shares` · `POST /api/documents/:id/shares`

| | |
|---|---|
| File | `app/api/documents/[id]/shares/route.ts` |
| Auth | **owner** (both methods) |
| Runtime | `nodejs`, `dynamic = 'force-dynamic'` |

#### GET

**Request** — none.

**Success — `200`**

```ts
export type ListSharesResponse = { shares: ShareEntry[] };
```

Sorted by `grantedAt` ascending. Empty array when nothing is shared.

**Failures**

| Status | `code` | Fires when |
|---|---|---|
| 401 | `UNAUTHENTICATED` | no session |
| 403 | `FORBIDDEN` | caller is `EDITOR`/`VIEWER` (they can read the doc, so `403` leaks nothing) |
| 404 | `NOT_FOUND` | `resolveAccess` = `NONE` |

#### POST (upsert)

**Request**

```ts
export const createShareSchema = z.object({
  email: z.email().trim().toLowerCase(),        // Zod 4
  role: z.enum(['VIEWER', 'EDITOR']),           // 'OWNER' is not grantable
});
export type CreateShareInput = z.infer<typeof createShareSchema>;
```

Behaviour (`00-foundation.md` §6 rule 4):

1. normalize email (Zod already trimmed + lowercased); look up `User` by `email`
2. if `user.id === session.id` → **400 `CANNOT_SHARE_WITH_SELF`**
3. if no user → **404 `USER_NOT_FOUND`**
4. `prisma.documentShare.upsert({ where: { documentId_userId: { documentId, userId } }, create: {...}, update: { role } })`
   — re-sharing with an existing recipient **updates the role**, never duplicates and never errors

Note the ordering: **self-share is checked before existence**, so sharing with your own address is
always `CANNOT_SHARE_WITH_SELF`, never `USER_NOT_FOUND`.

**Success — `200`** (not `201`, in either branch)

```ts
export type CreateShareResponse = { share: ShareEntry; created: boolean };
```

One status for one operation. `created: false` means an existing role was changed; the UI uses it to
choose between "Shared with Bob" and "Bob is now an editor". Splitting `201`/`200` would force the
client to branch on the status *and* on the body for no gain.

**Failures**

| Status | `code` | Fires when |
|---|---|---|
| 400 | `VALIDATION_FAILED` | body not JSON; `email` not an email; `role` not `VIEWER`/`EDITOR` |
| 400 | `CANNOT_SHARE_WITH_SELF` | target email is the session user's own email |
| 401 | `UNAUTHENTICATED` | no session |
| 403 | `FORBIDDEN` | caller is `EDITOR`/`VIEWER` |
| 404 | `NOT_FOUND` | `resolveAccess` = `NONE` on the document |
| 404 | `USER_NOT_FOUND` | no user with that email (only 3 seeded users exist) |
| 500 | `INTERNAL_ERROR` | DB error |

---

### 7.11 `PATCH /api/documents/:id/shares/:userId` · `DELETE /api/documents/:id/shares/:userId`

| | |
|---|---|
| File | `app/api/documents/[id]/shares/[userId]/route.ts` |
| Auth | **owner** (both methods) |
| Runtime | `nodejs` |

Params: `{ id: string; userId: string }` — `await params` (Next 15 and 16 both).

#### PATCH

**Request**

```ts
export const updateShareSchema = z.object({
  role: z.enum(['VIEWER', 'EDITOR']),   // 'OWNER' is rejected — ownership transfer is out of scope
});
```

Implemented with `updateMany({ where: { documentId, userId }, data: { role } })`; `count === 0` →
`SHARE_NOT_FOUND`. Then re-read for the response.

**Success — `200`**

```ts
export type UpdateShareResponse = { share: ShareEntry };
```

**Failures**

| Status | `code` | Fires when |
|---|---|---|
| 400 | `VALIDATION_FAILED` | body not JSON; `role` not `VIEWER`/`EDITOR` |
| 401 | `UNAUTHENTICATED` | no session |
| 403 | `FORBIDDEN` | caller is `EDITOR`/`VIEWER` |
| 404 | `NOT_FOUND` | `resolveAccess` = `NONE` on the document |
| 404 | `SHARE_NOT_FOUND` | no share row for `(id, userId)` |
| 500 | `INTERNAL_ERROR` | DB error |

#### DELETE

**Request** — none.

**Success — `200`, whether it removed one row or zero**

```ts
export type DeleteShareResponse = { ok: true; userId: string };
```

Implemented with `deleteMany({ where: { documentId, userId } })`. Not `delete` — that throws Prisma
`P2025` when the row is already gone.

**Failures**

| Status | `code` | Fires when |
|---|---|---|
| 401 | `UNAUTHENTICATED` | no session |
| 403 | `FORBIDDEN` | caller is `EDITOR`/`VIEWER` |
| 404 | `NOT_FOUND` | `resolveAccess` = `NONE` on the document |
| 500 | `INTERNAL_ERROR` | DB error |

**Revoking is idempotent.** A second `DELETE` is another `200`. This reverses an earlier
non-idempotent design: a double-click on **Remove** producing an error toast for an outcome the user
already has is worse than a silent success, and the client is not optimistic about removal anyway
(`04-ui-spec.md` §8.4), so a "stale UI" cannot go unnoticed. `SHARE_NOT_FOUND` survives on `PATCH`,
where changing the role of a share that does not exist really is a caller error.

---

### 7.12 `GET /api/users`

| | |
|---|---|
| File | `app/api/users/route.ts` |
| Auth | **session** |
| Runtime | `nodejs`, `dynamic = 'force-dynamic'` |

**Request — query string**

```ts
export const userSearchSchema = z.object({
  q: z.string().trim().max(100).optional(),
});
// 03-auth-and-permissions.md §12.2 proposed `q.length >= 3` and `take: 5`. REJECTED — the
// share picker queries at 2 characters (04-ui-spec.md §8.2) and would silently return
// nothing. Recorded under "Rulings", item 3.
```

Query semantics:

- results **exclude the session user** (you cannot share with yourself, §7.10)
- `q` absent or empty → return every other user (the demo directory is 3 accounts)
- `q` present → `OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }]`
- ordered by `name` ascending, `take: 10`

**Success — `200`**

```ts
export type UserSearchResponse = { users: UserSummary[] };
```

Select is literally `{ id: true, name: true, email: true }`. `passwordHash` and `createdAt` must not
appear in the Prisma `select` at all — not selected-then-deleted.

**Failures**

| Status | `code` | Fires when |
|---|---|---|
| 400 | `VALIDATION_FAILED` | `q` longer than 100 chars |
| 401 | `UNAUTHENTICATED` | no session |
| 500 | `INTERNAL_ERROR` | DB error |

> **Known simplification, per `00-foundation.md` §7:** this is a user-enumeration endpoint. It is
> acceptable only because the directory is three seeded demo accounts. `ARCHITECTURE.md` names the
> real fix (invite by exact email match, no listing, no partial search).

---

## 8. Zod → `VALIDATION_FAILED` mapping

One rule: `parseJson` / `parseQuery` call `schema.safeParse`, and on failure put
**`z.flattenError(error)`** straight into `details`. Nothing is reshaped, so the mapping is
trivially verifiable and needs no test of its own beyond one golden case.

```ts
type ZodFlattened = {
  formErrors: string[];                               // issues with an empty `path`
  fieldErrors: Record<string, string[] | undefined>;  // issues keyed by path[0]
};
```

Worked example. Request:

```http
PATCH /api/documents/clw3k9x0000abcd HTTP/1.1
Content-Type: application/json

{ "title": "", "lastKnownUpdatedAt": "yesterday" }
```

Response — `400`:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Request validation failed.",
    "details": {
      "formErrors": [],
      "fieldErrors": {
        "title": ["String must contain at least 1 character(s)"],
        "lastKnownUpdatedAt": ["Invalid datetime"]
      }
    }
  }
}
```

Notes for the frontend:

- `fieldErrors` keys are top-level field names only (`z.flattenError` keys by `issue.path[0]`). Nested
  ProseMirror issues therefore collapse under `"content"`. That is fine — the editor never shows a
  field-level error for `content`, it shows a toast.
- `.refine()` issues carry the `path` given in the refinement. `patchDocumentSchema`'s
  "at least one of title or content" refinement uses `path: ['title']`, so it lands in
  `fieldErrors.title`. Set `path` deliberately on every future refinement for this reason.
- Non-JSON bodies produce `formErrors: ["Request body must be valid JSON."]` with empty
  `fieldErrors`, so the client can render `details.formErrors` generically.
- Zod messages are English and default-generated. We do not localize them (`00-foundation.md` §2).

**Version pin: Zod 4 (`^4.1`)**, per `00-foundation.md` §2a — two of the three specs that write Zod
already assumed 4, and `01-data-and-persistence.md`'s content guard uses `z.looseObject()`, which is
4-only. Every schema in this document is written in 4 syntax. The four differences that bite:
`z.email()` not `z.string().email()`, `z.iso.datetime()` not `z.string().datetime()`,
`ctx.addIssue({ code: 'custom' })` not `z.ZodIssueCode.custom`, and **`z.flattenError(err)`** not
`err.flatten()` — the last one is what the `details` shape above depends on, and it is the one a
half-migrated file gets wrong silently.

The `"title"` message in the worked example is Zod's default text and will read slightly differently
across minor versions; the client renders `details.fieldErrors` generically and never asserts on it
(I12).

---

## 9. Client fetch helper

`lib/client.ts` — so no component hand-rolls envelope handling.

```ts
// lib/client.ts
import type { ApiErrorBody, ApiErrorCode } from '@/lib/api-types';

export class ApiClientError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export async function apiFetch<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...init?.headers,
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (body as ApiErrorBody | null)?.error;
    throw new ApiClientError(
      err?.code ?? 'INTERNAL_ERROR',
      err?.message ?? 'Unexpected error.',
      res.status,
      err?.details,
    );
  }
  return body as T;
}
```

Callers branch on `err.code`, never on `err.message` (I12). The editor's conflict handler is
`if (err.code === 'CONFLICT') showReloadBanner(err.details)`.

---

## 10. Runtime: Node vs Edge

| Surface | Runtime | Why |
|---|---|---|
| `middleware.ts` | **Edge** (Next.js default; do not override) | Only verifies the JWT with `jose`, which is Web-Crypto based and Edge-safe. No DB, no bcrypt. This is exactly why `00-foundation.md` §2 chose `jose` over `next-auth`/`jsonwebtoken`. |
| **Every** file under `app/api/**` | **Node** — `export const runtime = 'nodejs';` | Two hard blockers, either one is sufficient: **(1) Prisma Client** needs Node APIs and is not Edge-compatible without Accelerate or a driver adapter — both are extra setup we cut. **(2) `bcryptjs`** needs Node `crypto` for salt generation and burns CPU that the Edge runtime is not sized for. |
| `app/api/documents/import/route.ts` | **Node**, and additionally needs `Buffer` | `mammoth` (`.docx`) is a Node library; the R1 fallback may pull in `jsdom`. Neither runs on Edge. |
| Server Components under `app/documents/**` | Node (App Router default) | They query Prisma directly for the first paint. |

Node is already the App Router default for Route Handlers. We declare it **explicitly in every
route file anyway** — one line, and it makes "why is this Node?" answerable from the file itself
rather than from framework defaults, which is worth it on a reviewed codebase.

Every `GET` route file also declares:

```ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
```

`force-dynamic` is belt-and-braces: reading cookies already opts a handler out of static
generation, but an explicit declaration removes any chance of a `GET /api/documents` being cached at
build time and served stale on Vercel.

---

## 11. Explicit API non-goals

Stated here so no implementer "improves" the contract mid-build:

- **No rate limiting** on `/api/auth/login`. Three seeded accounts, one demo password published in
  the README. Named in `ARCHITECTURE.md`.
- **No CSRF token.** `SameSite=Lax` on the session cookie plus no cross-origin allowance is the
  mitigation. Named in `ARCHITECTURE.md`.
- **No API versioning** (`/api/v1`). One client, one deploy.
- **No pagination, sorting, or filtering params** on `GET /api/documents`.
- **No `PUT`.** `PATCH` is the only update verb; partial bodies are the norm.
- **No ETag / `If-Match` headers.** `lastKnownUpdatedAt` in the body is the concurrency mechanism;
  a header-based ETag is more correct HTTP but costs client plumbing we do not have hours for. This
  trade is named in `ARCHITECTURE.md`.
- **No OpenAPI spec generated.** This file is the spec.
- **No websockets / SSE.** See `00-foundation.md` §4.

---

## 12. Worked `curl` examples

Assumes `BASE=http://localhost:3000` and a cookie jar at `/tmp/sd.jar`. Seeded password is
`demo1234` (`00-foundation.md` §5).

### 12.1 Log in (establishes the session for everything else)

```bash
BASE=http://localhost:3000

curl -s -c /tmp/sd.jar -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"demo1234"}' | jq
```

```json
{ "user": { "id": "clw3a1...", "name": "Alice", "email": "alice@example.com" } }
```

Wrong password:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"wrong"}'
# 401  ->  {"error":{"code":"INVALID_CREDENTIALS","message":"Email or password is incorrect."}}
```

### 12.2 Save a document, then reproduce the 409

```bash
DOC=$(curl -s -b /tmp/sd.jar -X POST "$BASE/api/documents" \
  -H 'Content-Type: application/json' -d '{"title":"Q4 plan"}')
ID=$(echo "$DOC" | jq -r .id)
TOKEN=$(echo "$DOC" | jq -r .updatedAt)

# First save: succeeds, returns a NEW token
curl -s -b /tmp/sd.jar -X PATCH "$BASE/api/documents/$ID" \
  -H 'Content-Type: application/json' \
  -d "{\"content\":{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"hello\"}]}]},\"lastKnownUpdatedAt\":\"$TOKEN\"}" | jq
# { "id": "...", "title": "Q4 plan", "updatedAt": "2026-09-01T14:32:09.220Z" }

# Second save reusing the STALE token: 409
curl -s -b /tmp/sd.jar -X PATCH "$BASE/api/documents/$ID" \
  -H 'Content-Type: application/json' \
  -d "{\"title\":\"Q4 plan v2\",\"lastKnownUpdatedAt\":\"$TOKEN\"}" | jq
```

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "This document was changed somewhere else.",
    "details": {
      "currentUpdatedAt": "2026-09-01T14:32:09.220Z",
      "lastKnownUpdatedAt": "2026-09-01T14:32:07.913Z"
    }
  }
}
```

### 12.3 Share it, then prove the viewer is blocked

```bash
# Alice grants Carol VIEWER
curl -s -b /tmp/sd.jar -X POST "$BASE/api/documents/$ID/shares" \
  -H 'Content-Type: application/json' \
  -d '{"email":"carol@example.com","role":"VIEWER"}' | jq
# { "share": { "userId":"...", "user":{...}, "role":"VIEWER", "grantedAt":"..." }, "created": true }

# Sharing with yourself
curl -s -b /tmp/sd.jar -X POST "$BASE/api/documents/$ID/shares" \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","role":"EDITOR"}' | jq -r .error.code
# CANNOT_SHARE_WITH_SELF   (400)

# Now log in as Carol and try to write -> 403
curl -s -c /tmp/carol.jar -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"carol@example.com","password":"demo1234"}' > /dev/null

FRESH=$(curl -s -b /tmp/carol.jar "$BASE/api/documents/$ID" | jq -r .updatedAt)

curl -s -b /tmp/carol.jar -X PATCH "$BASE/api/documents/$ID" \
  -H 'Content-Type: application/json' \
  -d "{\"title\":\"hacked\",\"lastKnownUpdatedAt\":\"$FRESH\"}" | jq
# 403 {"error":{"code":"FORBIDDEN","message":"You have view-only access to this document."}}

# And a document Carol has no access to at all -> 404, not 403
curl -s -b /tmp/carol.jar "$BASE/api/documents/$SOME_OTHER_ID" | jq -r .error.code
# NOT_FOUND   (404)
```

Those last two commands are the demo of the stretch feature and of the 403/404 policy. They belong
in the walkthrough video.

---

## 13. Route index (quick reference)

| # | Method | Path | File | Auth | Success | Failure codes |
|---|---|---|---|---|---|---|
| 7.1 | `POST` | `/api/auth/login` | `app/api/auth/login/route.ts` | public | `200 LoginResponse` | `VALIDATION_FAILED`, `INVALID_CREDENTIALS`, `INTERNAL_ERROR` |
| 7.2 | `POST` | `/api/auth/logout` | `app/api/auth/logout/route.ts` | **public** | `200 { ok: true }` | `INTERNAL_ERROR` |
| 7.3 | `GET` | `/api/auth/me` | `app/api/auth/me/route.ts` | session | `200 MeResponse` | `UNAUTHENTICATED` |
| 7.4 | `GET` | `/api/documents` | `app/api/documents/route.ts` | session | `200 ListDocumentsResponse` | `UNAUTHENTICATED`, `INTERNAL_ERROR` |
| 7.5 | `POST` | `/api/documents` | `app/api/documents/route.ts` | session | `201 DocumentSummary` | `VALIDATION_FAILED`, `UNAUTHENTICATED`, `INTERNAL_ERROR` |
| 7.6 | `POST` | `/api/documents/import` | `app/api/documents/import/route.ts` | session | `201 DocumentSummary` | `FILE_MISSING`, `VALIDATION_FAILED`, `UNAUTHENTICATED`, `FILE_TOO_LARGE`, `CONTENT_TOO_LARGE`, `UNSUPPORTED_FILE_TYPE`, `PARSE_FAILED`, `INTERNAL_ERROR` |
| 7.7 | `GET` | `/api/documents/:id` | `app/api/documents/[id]/route.ts` | read | `200 DocumentDetail` | `UNAUTHENTICATED`, `NOT_FOUND`, `INTERNAL_ERROR` |
| 7.8 | `PATCH` | `/api/documents/:id` | `app/api/documents/[id]/route.ts` | write | `200 PatchDocumentResponse` | `VALIDATION_FAILED`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `CONTENT_TOO_LARGE`, `INTERNAL_ERROR` |
| 7.9 | `DELETE` | `/api/documents/:id` | `app/api/documents/[id]/route.ts` | owner | `200 { ok, id }` | `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `INTERNAL_ERROR` |
| 7.10 | `GET` | `/api/documents/:id/shares` | `app/api/documents/[id]/shares/route.ts` | owner | `200 ListSharesResponse` | `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND` |
| 7.10 | `POST` | `/api/documents/:id/shares` | `app/api/documents/[id]/shares/route.ts` | owner | `200 CreateShareResponse` | `VALIDATION_FAILED`, `CANNOT_SHARE_WITH_SELF`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `USER_NOT_FOUND`, `INTERNAL_ERROR` |
| 7.11 | `PATCH` | `/api/documents/:id/shares/:userId` | `app/api/documents/[id]/shares/[userId]/route.ts` | owner | `200 UpdateShareResponse` | `VALIDATION_FAILED`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `SHARE_NOT_FOUND`, `INTERNAL_ERROR` |
| 7.11 | `DELETE` | `/api/documents/:id/shares/:userId` | `app/api/documents/[id]/shares/[userId]/route.ts` | owner | `200 { ok, userId }` — **idempotent** | `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `INTERNAL_ERROR` |
| 7.12 | `GET` | `/api/users` | `app/api/users/route.ts` | session | `200 UserSearchResponse` | `VALIDATION_FAILED`, `UNAUTHENTICATED`, `INTERNAL_ERROR` |
| — | `GET` | `/api/health` | `app/api/health/route.ts` | **public** | `200 { ok, db, users }` | `503` (plain body, no envelope — it is a liveness probe, see `07-deployment-runbook.md` §0) |

---

## 14. Build order and budget for this slice

Roughly **2.0 h** of the 8 h. Do it in this order; each step leaves the app compiling.

| Step | Work | Est. |
|---|---|---|
| 1 | `lib/api-types.ts` + `lib/schemas.ts` (types, codes, Zod) | 20 min |
| 2 | `lib/api.ts` (`ok`, `fail`, `ApiError`, `toResponse`, `parseJson`, `parseQuery`, `withSession`, `withPublic`) + `lib/documents/queries.ts` (§4.3) | 20 min |
| 3 | `app/api/documents/route.ts` (GET + POST) — first end-to-end proof of the plumbing | 15 min |
| 4 | `app/api/documents/[id]/route.ts` (GET, PATCH incl. §6, DELETE) | 30 min |
| 5 | `app/api/documents/[id]/shares/**` (4 handlers) | 20 min |
| 6 | `app/api/users/route.ts` + `lib/client.ts` | 15 min |

Auth routes (7.1–7.3) are billed to `03-auth-and-permissions.md`; the import route body (7.6) is
billed to the import spec. This slice owns their contracts, not their internals.

---

## Rulings (previously "open questions")

Every item below was a proposal to `00-foundation.md`. All of them have been ruled on and written
into the foundation; they are recorded here so the reasoning survives.

1. ✅ **`POST /api/documents` returns `DocumentSummary`, not `{ id }`** — a strict superset that
   saves the dashboard a refetch and hands the editor its first concurrency token. The import route
   does the same (`05-import-spec.md` §6.3 was corrected to match).
2. ✅ **`POST /api/documents/:id/shares` always returns `200` with `created: boolean`.** One status
   for one operation. `06-test-plan.md` case 13's `201` expectation was corrected.
3. ✅ **`GET /api/users` with no `q` returns the whole directory** (minus self, capped at 10), and
   `q` is matched from **2** characters. `03-auth-and-permissions.md` §12.2's proposal to require
   three characters and cap at five was **rejected** — the share picker queries at two characters
   (`04-ui-spec.md` §8.2) and would silently return nothing, and tightening a demo directory of
   three accounts does not remove the enumeration surface, it only hides it. The trade is documented
   in `ARCHITECTURE.md` instead, with the real fix (invite by exact email) named.
4. ✅ **`POST /api/auth/logout` is public and idempotent — always `200`.** `00-foundation.md` §7 was
   changed to mark the route `public`. This reverses the earlier `401`, which forced the client to
   treat an error status as success.
5. ✅ **`DELETE .../shares/:userId` is idempotent — always `200`.** Reversed for the reason in §7.11:
   a double-click on Remove should not produce an error toast for an outcome the user already has.
   `SHARE_NOT_FOUND` remains on `PATCH`.
6. ✅ **Zod 4 (`^4.1`)**, not the exact `3.25.76` this file originally pinned. See §8 for the four
   syntax differences and `00-foundation.md` §2a for the pin.
7. ✅ **`CONTENT_TOO_LARGE` (413) with `MAX_CONTENT_BYTES = 1_000_000`**, defined once in
   `lib/documents/content.ts` — the name is `MAX_CONTENT_BYTES`, not `CONTENT_MAX_BYTES`, and the
   value is `1_000_000`, not `1024 * 1024`. It applies on `PATCH` **and** to an import result, which
   is why no separate node/character budget exists.

---

## Definition of done

This slice is done when every one of these is verifiably true.

- [ ] `lib/api-types.ts` exports `ApiErrorCode`, `ApiErrorBody`, `MyRole`, `ShareRole`,
      `AccessRole`, `UserSummary`, `ProseMirrorDoc`, `DocumentSummary`, `ShareEntry`,
      `DocumentDetail`, and every request/response type named in §7.
- [ ] `lib/api.ts` exports `ok`, `fail`, `ApiError`, `toResponse`, `parseJson`, `parseQuery`,
      `withSession`, `withPublic` with the signatures in §4, and `tsc --noEmit` passes.
- [ ] All 10 route files exist at the exact paths in §13 (including `app/api/health/route.ts`), and
      every handler in them is wrapped by `withSession` or `withPublic` —
      `grep -L "withSession\|withPublic" app/api/**/route.ts` returns nothing.
- [ ] Every route file declares `export const runtime = 'nodejs'`; every file exporting a `GET`
      also declares `export const dynamic = 'force-dynamic'`.
- [ ] No route constructs an error body by hand — `grep -rn "error:" app/api/` finds no object
      literals; all failures go through `fail()` or `ApiError`.
- [ ] No string appearing as a `code` is outside the `ApiErrorCode` union (guaranteed by types;
      confirmed by `tsc --noEmit`).
- [ ] `GET /api/documents/:id` as a `NONE` user returns `404 NOT_FOUND`, byte-identical to the
      response for an id that does not exist. Asserted by a test.
- [ ] No schema anywhere validates an id with `.cuid()` — `grep -rn "\.cuid()" lib/ app/` is empty
      (I6: the seed's ids are human-readable strings and a cuid check would reject all of them).
- [ ] `PATCH /api/documents/:id` as a `VIEWER` returns `403 FORBIDDEN`. Asserted by a test.
- [ ] `DELETE /api/documents/:id` as an `EDITOR` returns `403 FORBIDDEN`. Asserted by a test.
- [ ] A stale `lastKnownUpdatedAt` returns `409 CONFLICT` with `details.currentUpdatedAt` and
      `details.lastKnownUpdatedAt`. Asserted by an integration test that runs the §6.4 sequence.
- [ ] Every `200` from `PATCH /api/documents/:id` includes a `updatedAt` strictly greater than the
      `lastKnownUpdatedAt` that was sent. Asserted by a test.
- [ ] Re-sharing with an existing recipient returns `200 { created: false }` and leaves exactly one
      `DocumentShare` row for that `(documentId, userId)`. Asserted by a test.
- [ ] Sharing with your own email returns `400 CANNOT_SHARE_WITH_SELF` even though the user exists.
- [ ] `DELETE` of a share returns `200 {ok:true, userId}` on the **second** call too.
- [ ] `POST /api/auth/logout` with no cookie returns `200`, not `401`.
- [ ] `GET /api/documents` rows carry `shareCount`, sourced from `_count.shares` in the same query.
- [ ] `POST /api/documents/import` with a `.pdf` returns `415 UNSUPPORTED_FILE_TYPE` and the
      `message` names `.md`, `.txt`, `.docx`.
- [ ] `GET /api/users` never returns a field outside `{ id, name, email }` — verified by reading
      the Prisma `select`, not by post-filtering.
- [ ] The three `curl` blocks in §12 run against a freshly seeded local DB and produce the
      documented statuses and codes.
- [ ] `zod` resolves to 4.x, and `grep -rn "\.flatten()\|z.string().email()\|z.string().datetime()\|ZodIssueCode" lib/ app/` is empty.
- [ ] `grep -rn "getSession(\|next/headers" app/api/` is empty — handlers read the session with
      `getSessionFromRequest(req)` and never call `cookies()`.
