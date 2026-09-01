# 00 — Foundation

> **This file is the single source of truth.** Every other spec in `specs/` expands a
> slice of this document and must not contradict it. If an expansion needs to deviate,
> it changes this file first.

> **Except where `specs/DECISIONS.md` says otherwise.** `DECISIONS.md` is the ruling record:
> it holds decisions taken *after* this document was written, and it **outranks this file
> wherever the two conflict**. Read it before implementing anything from here. In force
> today: **D001** (3–4 agents, no up-front cuts), **D002** (optimistic concurrency ships in
> its reduced form), **D003** (Neon AWS `us-east-1` paired with Vercel `iad1`), **D004**
> (public repo, spec set committed before the code).

Status: **approved decisions, pre-implementation**
Owner: Natanael Alves Gabriel (@TheNatas)
Date: 2026-09-01

---

## 1. What we are building

**shared-docs** — a small, deliberately scoped collaborative document product. A user
signs in, creates or imports rich-text documents, edits them in the browser with
autosave, and shares them with other users as **viewer** or **editor**. Owned and
shared documents are visually distinct. Everything persists in Postgres.

This is a **product slice**, not a Google Docs clone. See §4 for what we are explicitly
not building and why.

## 2. Locked decisions

| Area | Decision | Rationale |
|---|---|---|
| Stack | **Next.js 16 (App Router) + TypeScript** | One repo, one deploy, one mental model. Route Handlers are a genuine HTTP API layer, so the frontend/backend split is still legible to a reviewer. Exact pin in §2a. |
| Package manager | **pnpm 10** | Already the user's default (`forty-monolito`, `nextjs-dashboard`). |
| DB | **Postgres on Neon** (free tier) | No card required, and one connection string for local *and* production. Honest caveat: a free-tier compute **suspends when idle** and takes a second or two to wake, so the first request after a pause is slow. Acceptable; do not describe it as "always-on". |
| ORM | **Prisma** | Typed schema, migrations, seeding in one tool. Already in the user's toolbelt. |
| Editor | **TipTap v3** (ProseMirror) | StarterKit covers bold/italic/**underline**/H1–H3/lists day one — v3's StarterKit already depends on `@tiptap/extension-underline`, so it is **not** installed or registered separately (`_toolchain-findings.md` TRAP-2). Content persists as **ProseMirror JSON**, not HTML — structured, diffable, and it sidesteps HTML-sanitization footguns entirely. All extensions used are MIT; nothing paid. |
| Styling | **Tailwind v4** + a small set of **shadcn/ui** primitives | shadcn gives us Radix Dialog / Select / DropdownMenu for the share flow, which is where hand-rolling costs the most time. |
| Auth | **Seeded accounts + email/password + signed session cookie** | Real auth logic (hashing, sessions, middleware) with zero reviewer friction — the login page ships one-click demo buttons. |
| Session | **`jose` HS256 JWT in an httpOnly cookie** | Works in Edge middleware (unlike bcrypt), no external service, ~40 lines we fully own and can explain on video. |
| Password hashing | **`bcryptjs`** | Pure JS — no native build step to fight on Vercel. Login route runs on the Node runtime. |
| Upload | **Import `.md` / `.txt` / `.docx` → a new editable document** | Product-relevant *and* it needs **zero blob storage** — we parse server-side and persist the result as document content. No S3/Blob dependency, nothing for reviewers to configure. |
| Sharing | **Owner + per-user share rows with `VIEWER` / `EDITOR` roles** | Satisfies the core requirement and absorbs the chosen stretch. |
| Stretch | **Role-based permissions (viewer vs editor)** | Deepens the graded requirement instead of bolting on a side feature. Enforced on **both** server and client. |
| Tests | **Vitest** — permission unit tests + API integration tests | Targets the access-control surface, which is what reviewers actually probe. |
| Deploy | **Vercel** (app, function region **`iad1`**) + **Neon** (DB, AWS **`us-east-1`**) | Both accounts already exist. The region pair is fixed by **D003**: Neon's region cannot be changed after project creation, reviewers are US-based, and the function must be co-located with the database. |
| Docs language | **English** | The brief and reviewers are English. |
| Repo | `~/Documents/natas/shared-docs` → `github.com/TheNatas/shared-docs`, **public** | Nested inside the `natas` repo; never `git add` it from the parent. **D004**: the spec set is commit 1 and the implementation starts at commit 2, so the history shows the plan predating the build. The remote is **HTTPS, not SSH** — the snap-confined `gh` cannot `exec ssh`, so pushes go through `credential.helper = !gh auth git-credential`. |
| Time budget | **~8 hours of focused work** | Drives every cut in §4. |

## 2a. Pinned versions (canonical — overrides every other spec)

Verified against the live npm registry on 2026-09-01 (`_toolchain-findings.md`). Where a sibling
spec quotes a different version line, **this table wins** and that spec is the bug. `T01` in
`10-task-graph.md` installs all of it once; **no other task runs `pnpm add`**.

| Package | Pin | Note |
|---|---|---|
| `next` | `16.3.4` | `latest` is 16.x, not 15. Async `params` and async `cookies()` hold in 16 exactly as in 15. |
| `react` / `react-dom` | `19.x` | whatever `create-next-app` pairs with Next 16 |
| `prisma` / `@prisma/client` | **`7.10.0` — both, identical** | `prisma@latest` resolves to an `8.0.0-rc` CLI against a stable 7.x client (TRAP-1). Never `@latest`. **Prisma 7 moved seed registration out of `package.json`** — see §2b. |
| `zod` | **`^4.1`** | Zod **4**, not 3. Consequences for schemas written elsewhere: `z.email()` not `z.string().email()`, `z.iso.datetime()` not `z.string().datetime()`, `z.looseObject({…})` not `.passthrough()`, `ctx.addIssue({ code: 'custom', … })` not `z.ZodIssueCode.custom`, and `z.flattenError(err)` not `err.flatten()`. |
| `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/html` | `3.31.0` | one line, one version |
| `@tiptap/extension-underline` | **not installed** | already a dependency of StarterKit v3; registering it twice throws a duplicate-name error at editor init (TRAP-2) |
| `@tiptap/extension-placeholder` | `3.31.0` | client-only, see §5a |
| `tailwindcss` | `4.3.3` | |
| `vitest` | `4.1.11` | `test.projects` (not the deprecated `vitest.workspace.ts`) |
| `vite-tsconfig-paths` | `^5.1.4` | resolves `@/*` in tests |
| `jose` | `6.2.10` | |
| `bcryptjs` | `3.0.3` | ships its own types — never add `@types/bcryptjs` |
| `mammoth` | `1.12.2` | `.docx` → HTML |
| `marked` | `18.0.11` | `.md` → HTML |
| `jsdom` | `^26` | only if the R1 spike lands on Plan B (expected — see §9/R1) |
| `tsx` | `^4.20` | runs `prisma/seed.ts` |
| Node | **22.x** | pinned twice: `engines.node` and `.nvmrc`, both owned by `01-data-and-persistence.md` |

`prisma.config.ts` is required because of the Prisma 7 pin: it registers the seed command that 6.x
read from `package.json#prisma.seed`. Without it `pnpm prisma db seed` and the re-seed half of
`prisma migrate reset` silently do nothing.

## 2b. Environment variables (canonical — there are exactly four)

| Var | Where | Read by |
|---|---|---|
| `DATABASE_URL` | `.env`, Vercel Production **and** Preview | Prisma at runtime — the **pooled** Neon URL (host contains `-pooler`) |
| `DIRECT_URL` | `.env`, `.env.test`, Vercel Production **and** Preview | `prisma migrate` / `db push` / `studio` — the **direct** Neon URL. Prisma validates every env var the schema references at CLI startup, so it must be defined everywhere the CLI runs, including tests. |
| **`AUTH_SECRET`** | `.env`, `.env.test`, Vercel Production **and** Preview | HS256 session signing key. **The name is `AUTH_SECRET`. `SESSION_SECRET` does not exist anywhere in this project.** Minimum 32 characters; the app refuses to boot without it. |
| `TEST_DATABASE_URL` | `.env.test` only (committed) | the integration project's Postgres |

`.env.example` (committed) lists `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`.
`.env.test` (committed, no secret of value) holds `TEST_DATABASE_URL`, `DIRECT_URL` (same value) and
an `AUTH_SECRET` of **at least 32 characters**.

## 3. Non-negotiable acceptance criteria (traced to the brief)

Each maps to a line in `specs/BRIEF.md`. Nothing ships until all of these are true.

| # | Requirement | Acceptance |
|---|---|---|
| C1 | Create a document | `POST /api/documents` creates and redirects into the editor |
| C2 | Rename a document | Inline title edit, persisted, visible on the dashboard |
| C3 | Edit content in browser | TipTap editor with working autosave |
| C4 | Save and reopen | Reload preserves content **and** formatting |
| C5 | Bold / Italic / Underline | Toolbar buttons with active-state styling + keyboard shortcuts |
| C6 | Headings / text size | H1, H2, H3, Paragraph |
| C7 | Bulleted + numbered lists | Both, nestable |
| C8 | File upload | `.md` / `.txt` / `.docx` → new document; the limits are stated **in the UI and the README** as the *same literal string* — `IMPORT_LIMITS_COPY` (§7b). If the R1 spike forces Plan C, `.docx` is cut and the constant is the single edit that propagates (see `05-import-spec.md` §5.6). |
| C9 | Document owner | `Document.ownerId`, surfaced in the UI |
| C10 | Grant another user access | Share dialog by email, owner-only |
| C11 | Owned vs shared visibly distinct | Two labelled dashboard sections + role badges |
| C12 | Persistence | Postgres; survives refresh and redeploy |
| C13 | Setup + run instructions | `README.md`, verified from a clean clone |
| C14 | Working deployment | Public Vercel URL reviewers can use |
| C15 | Validation + error handling | Zod on every mutating route; typed error envelope; UI error states |
| C16 | ≥1 meaningful automated test | Permission matrix suite + API integration suite |
| C17 | Architecture note | `ARCHITECTURE.md` — what we prioritized and why |
| C18 | AI workflow note | `AI-WORKFLOW.md` — tools, wins, rejections, verification |
| C19 | Walkthrough video 3–5 min | Unlisted link, in the Drive folder |
| C20 | Drive folder w/ all deliverables | Per the brief's list, plus `SUBMISSION.md` |

**Two shipped behaviours are not brief lines.** They are specced in depth, they appear in the video
script and the smoke test, and they must therefore be traceable — but they are *not* acceptance
criteria, and both are on the cut list in `10-task-graph.md` §7 — C22 as item 1, C21 as items 3
and 11. **D002 has since resolved C22's entry: it is not taken — the conflict system ships,
reduced.**

| # | Behaviour | Status |
|---|---|---|
| C21 | Delete a document (owner only) | **cuttable.** No brief line asks for it. The endpoint and its `403`-for-EDITOR test are cheap; the UI affordance is the part that goes first. |
| C22 | A concurrent edit produces a visible conflict, never silent data loss | **ships, reduced — see D002.** The full `409` machinery (§7) was priced at ~1h15 across five specs, the largest single block in the set that maps to no brief line. D002 declines to delete it and ships it at ~30 minutes instead: the `409`, the single-in-flight guard, a `conflict` save state, and an inline reload banner. What goes is the recovery polish — the conflict *dialog*, "Copy my text", the request-merging queue, the second integration case. The *argument* — we did not build real-time collab and here is what happens instead — still gets one paragraph in `ARCHITECTURE.md` and one sentence in the video, both of which are being written anyway. |

## 4. Explicit non-goals (say these out loud in the video and ARCHITECTURE.md)

Cutting well *is* the graded skill. We are **not** building:

- **Real-time collaborative editing (OT/CRDT).** Correct multiplayer editing is days of
  work. Instead we ship a cheap, honest guard: optimistic concurrency (§7) so a
  second writer gets a `409` and a clear inline banner — `This document changed
  elsewhere.` with a **Reload** button — rather than silent data loss. Per **D002** that
  banner is the whole recovery surface: no conflict dialog, no merge, no "copy my text".
  Stating the limit and handling it beats pretending it doesn't exist.
- **Public link sharing / anonymous access.** Sharing is user-to-user only.
- **Comments, suggestions, presence cursors.**
- **Tables, images, code blocks, text colour, fonts.** The brief asks for basic
  formatting; extra marks are surface area, not depth.
- **Self-service signup, password reset, email.** Seeded accounts only — the graded
  flow is *sharing*, and seeded users make it testable in 10 seconds.
- **Blob storage.** Import parses to document content; nothing binary is retained.
- **Folders, tags, search, trash, pagination.** 3 users and a handful of docs.
- **Mobile-optimised editing.** Responsive-tolerant, desktop-first.

## 5. Data model (canonical)

```prisma
model User {
  id            String          @id @default(cuid())
  email         String          @unique
  name          String
  passwordHash  String
  createdAt     DateTime        @default(now())

  ownedDocuments Document[]     @relation("OwnedDocuments")
  sharedWithMe   DocumentShare[] @relation("ShareRecipient")
  sharesGranted  DocumentShare[] @relation("ShareGranter")
}

model Document {
  id             String   @id @default(cuid())
  title          String   @default("Untitled document")
  content        Json     // ProseMirror JSON document node
  sourceFilename String?  // set when created via import; shown as provenance in the UI
  ownerId        String
  owner          User     @relation("OwnedDocuments", fields: [ownerId], references: [id], onDelete: Cascade)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  shares         DocumentShare[]

  @@index([ownerId, updatedAt(sort: Desc)])
}

enum ShareRole {
  VIEWER
  EDITOR
}

model DocumentShare {
  id          String    @id @default(cuid())
  documentId  String
  document    Document  @relation(fields: [documentId], references: [id], onDelete: Cascade)
  userId      String
  user        User      @relation("ShareRecipient", fields: [userId], references: [id], onDelete: Cascade)
  role        ShareRole @default(VIEWER)
  grantedById String
  grantedBy   User      @relation("ShareGranter", fields: [grantedById], references: [id])
  createdAt   DateTime  @default(now())

  @@unique([documentId, userId])   // one role per user per doc
  @@index([userId])                // powers "shared with me"
}
```

### Seed (canonical — the README, the login page, the video script and the tests all quote this)

Three users, **`@example.com`**, password **`demo1234`** for all three. No other domain is used
anywhere in the project.

| id | name | email |
|---|---|---|
| `seed-user-alice` | Alice Rivera | `alice@example.com` |
| `seed-user-bob` | Bob Chen | `bob@example.com` |
| `seed-user-carol` | Carol Mendes | `carol@example.com` |

**Five documents.** Alice owns four (`seed-doc-roadmap`, `seed-doc-handbook`, `seed-doc-private`,
`seed-doc-imported`) and has shared three of them; Bob owns one (`seed-doc-bob-notes`). Bob is
`EDITOR` on *Q3 Product Roadmap*; Carol is `VIEWER` on *Team Handbook*; both roles appear again at
different levels on *Imported: Product Brief*; and *Alice — Private Draft* is shared with nobody, so
the `NONE → 404` path is demoable. The full matrix is `01-data-and-persistence.md` §7.2–§7.3.

**Ids are fixed, human-readable strings, not cuids** (`@default(cuid())` only fires when the value
is omitted). The payoff is stable demo URLs and stable fixtures. **The binding consequence for every
other spec: validate ids as `z.string().min(1).max(64)`, never `z.string().cuid()`** — a cuid check
rejects every seeded id.

`prisma/seed.ts` ends by printing the demo-accounts markdown table to stdout, so `README.md`'s table
is pasted from a real run rather than hand-typed.

## 5a. Module map (canonical — one path per concern, **no `src/` directory**)

The project root holds `app/`, `lib/`, `components/`, `hooks/`, `middleware.ts`. Everything is
imported through the `@/*` alias, which `tsconfig.json` (owned by `01`) maps to the repo root.
Any spec that writes `src/lib/…` means `lib/…`.

| Path | Owns |
|---|---|
| `lib/db.ts` | the **one** Prisma client singleton, exported as `prisma`. There is no `lib/prisma.ts`. Must stay unreachable from `middleware.ts`. |
| `lib/env.ts` | fail-fast env validation (`AUTH_SECRET`, `DATABASE_URL`) |
| `lib/session-token.ts` | Edge-safe: `SESSION_COOKIE`, `SESSION_MAX_AGE_SECONDS`, `SessionUser`, `signSessionToken(user)`, `verifySessionToken(token)`, **`getSessionFromRequest(req: Request)`**. Imports nothing from `next/headers`, Prisma or Node builtins. |
| `lib/session.ts` | `next/headers` wrappers for Server Components and cookie writes: `createSession`, `readSession`, `requireSession`, `destroySession`. **Route handlers never import this** — see §7c. |
| `lib/password.ts` | `hashPassword`, `verifyPassword`, `DUMMY_PASSWORD_HASH` |
| `lib/permissions.ts` | `ROLES`, `AccessRole`, `CAPABILITIES`, `Capability`, `CAPABILITY_MATRIX`, `can`, `resolveAccess`, `requireAccess` (§6a). There is no `lib/access.ts`. |
| `lib/api-types.ts` | `ApiErrorCode`, `ApiErrorBody`, and every DTO + request/response type |
| `lib/api.ts` | `ok`, `fail`, **`ApiError`**, `toResponse`, `parseJson`, `parseQuery`, `withSession`, `withPublic`. **This is the only error class and the only error funnel — there is no `lib/errors.ts`, no `AppError`, no `toErrorResponse`, no `apiError`.** |
| `lib/client.ts` | `apiFetch`, `ApiClientError(code, message, status, details?)`. There is no `lib/api-client.ts`. |
| `lib/schemas.ts` | **request** Zod schemas only (`loginSchema`, `createDocumentSchema`, `patchDocumentSchema`, `createShareSchema`, `updateShareSchema`, `importMetaSchema`, `userSearchSchema`). It re-exports nothing. |
| `lib/documents/content.ts` | `EMPTY_DOC`, `documentContentSchema`, `MAX_CONTENT_BYTES`, `contentByteSize`, `toDocumentContent`. **The only definition of each.** |
| `lib/documents/queries.ts` | `listDocumentsFor(userId)`, `getDocumentFor(userId, id)` — the shared read layer. **Server Components and Route Handlers both call these**, so "what may this person see" has exactly one implementation and one test. |
| `lib/documents/update.ts` | the conditional `PATCH` write |
| `lib/editor-extensions.ts` | `schemaExtensions` (server-safe) and `editorExtensions` (adds `Placeholder`). **The single source of truth for the document schema**, imported by both the editor and the importer. There is no `lib/editor/extensions.ts`. |
| `lib/import/constants.ts` | `MAX_FILE_BYTES`, `ACCEPTED_EXTENSIONS`, `IMPORT_LIMITS_COPY`, `IMPORT_ACCEPT_ATTR` |
| `lib/import/{types,validate,parsers,html-to-pm,title,index}.ts` | the import pipeline |
| `lib/format.ts` | `formatRelativeTime`, `formatBytes` |
| `middleware.ts` | repo root, Edge, matcher `['/documents/:path*']` |
| `lib/**/*.test.ts` | **all unit tests, colocated beside their module.** `tests/unit/**` does not exist — the `unit` Vitest project's `include` is `['lib/**/*.test.ts']`, so a test written anywhere else is silently never run. |
| `tests/integration/**` | integration tests only |
| `tests/fixtures/import/**`, `samples/` | committed import fixtures, and reviewer-facing copies of the three good ones |
| `docs/screenshots/` | the six committed PNGs (see `09-video-and-submission.md` §B.6) |

`tsconfig.json`, `.nvmrc`, `next.config.ts`, `.gitignore`, `.gitattributes`, `package.json` and the
`@/*` alias are all owned by `01-data-and-persistence.md`; nothing else creates or edits them.

## 6. Access model (canonical)

Four roles, resolved by one function — `resolveAccess(userId, documentId)`.

| Capability | OWNER | EDITOR | VIEWER | NONE |
|---|:--:|:--:|:--:|:--:|
| read document | ✅ | ✅ | ✅ | ❌ |
| update content | ✅ | ✅ | ❌ | ❌ |
| rename | ✅ | ✅ | ❌ | ❌ |
| delete | ✅ | ❌ | ❌ | ❌ |
| view share list | ✅ | ❌ | ❌ | ❌ |
| grant / change / revoke share | ✅ | ❌ | ❌ | ❌ |

Rules that must hold everywhere:

1. **`NONE` gets `404`, not `403`.** Never leak that a document exists to someone with
   no access. `403` is reserved for "you can see it, but not do *that*".
2. **One resolver.** No route re-derives permissions inline. Every handler calls
   `resolveAccess` and then a capability check.
3. **Server is the authority.** The read-only editor for viewers is a UX affordance;
   the `403` on `PATCH` is the actual control. Both are tested.
4. **An owner cannot share with themselves**, and re-sharing with an existing
   recipient **updates** the role rather than erroring or duplicating.

## 6a. Capability keys and the resolver signature (canonical)

The cell *values* above were already agreed by every spec; only the names were not. These are the
names. No spec invents its own, prefixes them (`document:read`), or collapses them (`write`).

```ts
// lib/permissions.ts
export const ROLES = ['OWNER', 'EDITOR', 'VIEWER', 'NONE'] as const;
export type AccessRole = (typeof ROLES)[number];

export const CAPABILITIES = [
  'read', 'update', 'rename', 'delete', 'viewShares', 'manageShares',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** Total over all four roles — the NONE row is six explicit `false`s, not an absence. */
export const CAPABILITY_MATRIX: Record<AccessRole, Record<Capability, boolean>>;

/** Pure. No I/O, no clock, no request context. Unit-tested over all 24 cells. */
export function can(role: AccessRole, capability: Capability): boolean;

export type ResolvedAccess = { role: AccessRole; document: Document | null };

/** One Prisma query. Returns { role: 'NONE', document: null } for BOTH "no such
 *  document" and "not shared with you" — that is what makes the 404 indistinguishable. */
export function resolveAccess(userId: string, documentId: string): Promise<ResolvedAccess>;

/** Throws ApiError(404 NOT_FOUND) when role is NONE, ApiError(403 FORBIDDEN) when the
 *  role lacks the capability. On success `document` is non-null. */
export function requireAccess(
  userId: string, documentId: string, capability: Capability,
): Promise<{ role: Exclude<AccessRole, 'NONE'>; document: Document }>;
```

`NONE` **is** a member of the union so `can()` is total and the 24-cell matrix is expressible in a
pure, database-free unit test — which is the single highest-value test in the repo. Modelling
absence as `null` instead would make `can('NONE', …)` a `TypeError`.

Route → capability mapping (no route invents its own):

| Route | Capability |
|---|---|
| `GET /api/documents/:id` | `read` |
| `PATCH /api/documents/:id` with `content` | `update` |
| `PATCH /api/documents/:id` with `title` | `rename` |
| `PATCH` with **both** | both are checked |
| `DELETE /api/documents/:id` | `delete` |
| `GET /api/documents/:id/shares` | `viewShares` |
| `POST` / `PATCH` / `DELETE` `…/shares…` | `manageShares` |

## 7. API surface (canonical)

All under `/api`. JSON in, JSON out, except `import` (multipart). Every mutating route
validates its body with **Zod**. Errors use one envelope:
`{ error: { code: string, message: string, details?: unknown } }`.

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/api/auth/login` | public | `{email, password}` → sets session cookie |
| `POST` | `/api/auth/logout` | **public** | clears the cookie and returns `200 {ok:true}` **always** — with no cookie, an expired one, or a forged one. A logout that 401s is worse UX for zero security gain. |
| `GET` | `/api/auth/me` | session | current user |
| `GET` | `/api/documents` | session | `{ owned: [...], sharedWithMe: [...] }` |
| `POST` | `/api/documents` | session | creates empty doc → `201 {id}` |
| `POST` | `/api/documents/import` | session | multipart → parses → `201 {id}` |
| `GET` | `/api/documents/:id` | read | doc + `myRole` (+ `shares` if owner) |
| `PATCH` | `/api/documents/:id` | write | `{title?, content?, lastKnownUpdatedAt}` |
| `DELETE` | `/api/documents/:id` | owner | |
| `GET` | `/api/documents/:id/shares` | owner | |
| `POST` | `/api/documents/:id/shares` | owner | `{email, role}` — upserts |
| `PATCH` | `/api/documents/:id/shares/:userId` | owner | `{role}` |
| `DELETE` | `/api/documents/:id/shares/:userId` | owner | **idempotent** — `200 {ok:true, userId}` whether it removed one row or zero |
| `GET` | `/api/users?q=` | session | share-picker autocomplete; returns `{id, name, email}` only |
| `GET` | `/api/health` | public | `{ok, db, users}` — a row count, no PII. It is the hour-2 deploy checkpoint (§9/R2) and it stays in the final product. |

**Optimistic concurrency.** `PATCH /api/documents/:id` requires `lastKnownUpdatedAt`.
If it does not match the row's `updatedAt`, respond `409 CONFLICT`. The client then enters
a `conflict` state, suspends autosave, and shows an inline banner whose only action is
**Reload** — that is the entire recovery UI (**D002**): no dialog, no merge, no clipboard
path. The response of every successful `PATCH` returns the new `updatedAt`, and the client
advances its token **only** from a success body. The client also keeps at most one `PATCH`
in flight per document (§9/R4). This is our honest answer to "no real-time collab":
last-write-wins, but never *silently*.

**`GET /api/users` is a known simplification** — it exposes a 3-account demo directory.
Documented in `ARCHITECTURE.md` as a deliberate trade, with the real fix (invite by
exact email, no enumeration) named.

## 7a. Error-code registry (canonical — no route invents a code)

Exported as a TypeScript union from `lib/api-types.ts`, so a typo is a compile error. A code always
maps to the same status. **Every response, success and failure, has a JSON body — there are no
`204`s**, because `apiFetch` calls `res.json()` unconditionally.

| Code | Status | Fires when |
|---|---|---|
| `VALIDATION_FAILED` | 400 | Zod rejected the body/query, or the body was not JSON. **Not** `VALIDATION_ERROR`. |
| `FILE_MISSING` | 400 | import request was not multipart, or had no `file` part, or the file was empty |
| `CANNOT_SHARE_WITH_SELF` | 400 | owner used their own email. **Not** `SELF_SHARE`. |
| `UNAUTHENTICATED` | 401 | no session cookie, or it failed verification |
| `INVALID_CREDENTIALS` | 401 | login: unknown email **or** wrong password — never distinguished |
| `FORBIDDEN` | 403 | the caller can see the document but lacks this capability |
| `NOT_FOUND` | 404 | document absent **or** access is `NONE` (§6 rule 1) |
| `USER_NOT_FOUND` | 404 | share target email matches no user |
| `SHARE_NOT_FOUND` | 404 | `PATCH` of a share row that does not exist (**`DELETE` of one is idempotent and never uses this**) |
| `CONFLICT` | 409 | stale `lastKnownUpdatedAt`; `details: { currentUpdatedAt, lastKnownUpdatedAt }` |
| `FILE_TOO_LARGE` | 413 | uploaded file over `MAX_FILE_BYTES` |
| `CONTENT_TOO_LARGE` | 413 | serialised content over `MAX_CONTENT_BYTES` — on `PATCH` **and** on import |
| `UNSUPPORTED_FILE_TYPE` | **415** | extension not in `ACCEPTED_EXTENSIONS`, or a positively-wrong MIME |
| `PARSE_FAILED` | **422** | the file was accepted but could not be turned into a document. Carries `details: { reason }` — a short machine string (`'not-text'`, `'corrupt-docx'`, `'empty-result'`, `'unsupported-content'`) so the import spec's distinct user-facing sentences survive without nine extra codes. |
| `INTERNAL_ERROR` | 500 | anything unhandled; never leaks details |

There is no `IMPORT_*` code family. `05-import-spec.md` maps its conditions onto this table.

## 7b. Shared constants (one definition, one module)

| Constant | Value | Module |
|---|---|---|
| `MAX_CONTENT_BYTES` | `1_000_000` | `lib/documents/content.ts` |
| `MAX_FILE_BYTES` | `2 * 1024 * 1024` | `lib/import/constants.ts` — **2 MB, everywhere**. No spec states 1 MB, and no UI hard-codes a number. |
| `IMPORT_LIMITS_COPY` | `'Supported files: .md, .txt, .docx — maximum 2 MB per file.'` | `lib/import/constants.ts` — rendered verbatim by the import UI and pasted verbatim into `README.md` under `## File import`, with a unit test asserting the README contains it |
| `ACCEPTED_EXTENSIONS` | `['.md', '.txt', '.docx']` | `lib/import/constants.ts` — `.markdown` is **not** accepted |
| `FALLBACK_TITLE` / `MAX_TITLE_LENGTH` | `'Untitled document'` / `120` | `lib/import/title.ts`, alongside `titleFromFilename(filename)` |
| `SESSION_COOKIE` | `'shared_docs_session'` | `lib/session-token.ts` — one constant, used by the login route and the middleware |
| `SESSION_MAX_AGE_SECONDS` | `604800` | `lib/session-token.ts` |
| `DEMO_PASSWORD` | `'demo1234'` | `prisma/seed.ts`, printed by the seed |
| bad-credentials copy | `'Email or password is incorrect.'` | `lib/schemas.ts`-adjacent; byte-identical on both login failure paths |

No node/character budget exists. `MAX_CONTENT_BYTES` bounds both the autosave body and the import
result; a second recursive `measure()` walk over the tree was specified, priced at ~40 minutes, and
cut.

## 7c. How a handler reads the session

**Route handlers must never import `next/headers`.** `cookies()` throws outside a request scope,
which would make every handler untestable without a running server and would delete the entire
integration suite. The primitive is therefore:

```ts
// lib/session-token.ts
export async function getSessionFromRequest(req: Request): Promise<SessionUser | null>;
```

reading `req.headers.get('cookie')`. `withSession` in `lib/api.ts` calls it; handlers write cookies
with `NextResponse.cookies.set()` on the response they return. `readSession()` / `requireSession()`
in `lib/session.ts` are the `next/headers` wrappers, used **only by Server Components and pages**.
There is no function named `getSession`.

`SessionUser` is `{ id: string; email: string; name: string }` — the field is **`session.id`**,
never `session.userId`.

## 8. Routes / screens

| Route | Purpose |
|---|---|
| `/` | redirect → `/documents` or `/login` |
| `/login` | credential form + one-click demo account buttons + stated demo password |
| `/documents` | dashboard: **My documents** and **Shared with me**, plus New / Import |
| `/documents/[id]` | editor: title, toolbar, canvas, save status, Share, read-only banner |

Edge middleware protects `/documents/*` and redirects unauthenticated users to `/login`.

## 9. Known risks (resolve these first)

| id | Risk | Mitigation |
|---|---|---|
| **R1** | `@tiptap/html`'s `generateJSON` needs a DOM; behavior on Node/serverless is the one genuinely uncertain integration. | **Spike it in the first 30 minutes.** Fallback: parse to HTML then map to ProseMirror JSON via `jsdom`, or bypass HTML entirely and build PM JSON from the Markdown AST. Do not start the import UI before this is settled. |
| **R2** | Prisma on Vercel needs `prisma generate` at build and a pooled Neon URL at runtime. | `postinstall: prisma generate` **and** `"build": "prisma generate && next build"` — belt and braces, because a cached `node_modules` skips `postinstall`. Datasource declares both `url` (pooled, `pgbouncer=true&connection_limit=1`) and `directUrl` (unpooled, migrations only). Set the Vercel function region to **`iad1`** to match Neon's **`us-east-1`** (**D003**) — a mismatched pair adds a cross-region round trip to every query. Deploy a hello-world slice **early**, not at hour 7. |
| **R2b** | **Vercel Deployment Protection** puts an SSO wall in front of production. It looks perfectly healthy to the owner, who is logged in, and zeroes C14 for the reviewer. | Settings → Deployment Protection → **disabled for Production**, verified from a **logged-out incognito window at the hour-2 deploy**, not at hour 7:50. Two minutes; the highest-consequence item in the runbook. |
| **R3** | Integration tests need a real Postgres. | One file, `docker-compose.test.yml`, on host port **55432**, user/password `test`, tmpfs data dir, databases `shared_docs_test` (tests) and `shared_docs_dev` (local dev, created by an initdb script). `pnpm test:unit` must stay dependency-free so reviewers can always run *something*. |
| **R4** | Autosave + optimistic concurrency can 409 spuriously against yourself. | Client stores the `updatedAt` returned by each successful `PATCH` in a **ref**, and keeps at most one `PATCH` in flight per document; only a *different* session can trigger a conflict. Cover with a test. **This guard is explicitly preserved by D002 — it is not optional and is on no cut list**, because cutting it while keeping the `409` turns a correctness feature into a bug. (D002 drops the request-*merging queue*, which is a separate thing: skip-if-in-flight, then re-fire once on completion if still dirty.) |
| **R5** | **Time. The nine slice budgets sum to ~15.5 agent-hours — ~15.75 before D002 took 0.25 h out of `04` — against 8 wall-clock hours.** That is not a rounding error. (D002 saves ~45 minutes of conflict-system work in total; only the `04` quarter-hour lands in the slice budgets, the rest sits in `10-task-graph.md`'s task estimates, the dropped recovery test and the folded video beat. The authoritative itemisation is `10-task-graph.md` §1 S2.) | Two levers, and both must be pulled. **(a) Parallelism.** `10-task-graph.md` runs waves W1/W3/W4/W6 **three-to-four** agents wide — fixed by **D001**; mean parallelism required is ~2.1×. **If you are working solo with no delegation, this plan does not fit and you start taking cuts from `10-task-graph.md` §7 at hour 3, not hour 6.** **(b) An honest schedule.** Deploy at hour 2, **freeze features at 5:30**, and reserve **2.5 h** for docs + video + submission — measured at 2h15 (docs) + 1h45 (video/Drive) against the old 2 h reserve, which never fit. The last block is not compressible: four of the brief's deliverables and a graded video live in it. |

## 10. Deliverables map

| Brief deliverable | Artifact |
|---|---|
| Source code | GitHub repo + `source-code.zip` in Drive |
| `README.md` | repo root — setup, run, limits, seeded accounts |
| Architecture note | `ARCHITECTURE.md` |
| AI workflow note | `AI-WORKFLOW.md` |
| `SUBMISSION.md` | index of everything, with the "working / incomplete / next 2–4h" section |
| Live product URL | Vercel; recorded in `live-url.txt` |
| Video URL | `walkthrough-video-url.txt` |
| Screenshots / GIF | **`docs/screenshots/`** — six committed PNGs, embedded by `README.md` and copied into the Drive folder. **No GIF**: the brief says "screenshots **or** a short demo GIF", the video already carries motion, and a broken image is the first thing a reviewer sees. |
| Build log behind the AI note | `docs/ai-log.md` |
| Drive staging | `submission/` — gitignored except `submission/README.md`, rebuilt by `scripts/build-submission.sh` |
