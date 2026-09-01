# 01 — Data & Persistence

**Purpose.** This spec is the complete, buildable definition of everything that touches
Postgres: the final Prisma schema (verbatim from `00-foundation.md` §5, plus the datasource
and generator blocks it omits), why document content is a `Json` column holding a ProseMirror
document node, the runtime shape-guard that protects that column on write, the migration
workflow against Neon, the seed script that makes every access path in `00-foundation.md` §6
demoable in under a minute, the Prisma client singleton, and connection pooling on Vercel.
An implementation agent should be able to build the entire persistence layer from this file
alone. Permission resolution lives in `03-auth-and-permissions.md`; HTTP shapes live in the
API spec; this file only specifies the storage layer and the invariants the routes must honour.

**Slice budget: ~1.25h of the 8h.** Schema + first migration 20m · env + client singleton +
Neon wiring 20m · content guard 15m · seed script 25m · verification pass 15m.

---

## 1. Files owned by this slice

| Path | Contents |
|---|---|
| `prisma/schema.prisma` | datasource, generator, `User`, `Document`, `DocumentShare`, `ShareRole` |
| `prisma/migrations/<ts>_init/migration.sql` | generated — never hand-edited after it is applied |
| `prisma/seed.ts` | idempotent demo data (§7) |
| `lib/db.ts` | Prisma client singleton (§8) |
| `lib/documents/content.ts` | `EMPTY_DOC`, `documentContentSchema`, `toDocumentContent` (§5) |
| `prisma.config.ts` | seed registration — required by the Prisma 7 pin (`00-foundation.md` §2a) |
| `.env` | `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET` — gitignored |
| `.env.example` | same keys, placeholder values — committed |
| `.docker/initdb/01-dbs.sql` | creates the `shared_docs_dev` database inside the test container (§6.1) |
| `tsconfig.json` (incl. the `@/*` → repo-root alias), `.nvmrc`, `next.config.ts`, `.gitignore`, `.gitattributes`, `package.json` | **project setup is owned here.** These are the files that make a clean clone work and no other spec creates or edits them (`00-foundation.md` §5a). |

`docker-compose.test.yml` is **not** owned here — it belongs to `06-test-plan.md` §5.2, which has the
healthcheck, the tmpfs and the port-collision reasoning. This slice only adds the initdb script that
gives local dev a second database in the same container (§6.1).

> **No `src/` directory.** `app/`, `lib/`, `components/`, `hooks/` and `middleware.ts` live at the
> repo root and `@/*` resolves there (`00-foundation.md` §5a).

## 2. Dependencies

| Package | Version line | Dep type | Why |
|---|---|---|---|
| `prisma` | **`7.10.0` exact** | dev | CLI: migrate, generate, seed, studio |
| `@prisma/client` | **`7.10.0` exact** | prod | Generated typed client — **byte-identical to the CLI version** |
| `zod` | `^4.1` | prod | Content shape-guard + every route body (`00-foundation.md` §7) |
| `bcryptjs` | `3.0.3` | prod | Seed password hashing. v3 ships its own types — do **not** add `@types/bcryptjs` |
| `tsx` | `^4.20` | dev | Runs `prisma/seed.ts` without a build step |

```bash
pnpm add @prisma/client@7.10.0 zod bcryptjs
pnpm add -D prisma@7.10.0 tsx
```

Three pinning rules that other specs depend on (all canonical in `00-foundation.md` §2a):

1. **Pin Prisma explicitly at `7.10.0`, both packages, never `@latest`.** `prisma@latest` currently
   resolves to an `8.0.0-rc` CLI against a stable 7.x client, and that mismatch produces
   generate/migrate failures that are easy to misdiagnose as Neon or Vercel problems
   (`_toolchain-findings.md` TRAP-1). Add a one-line comment in `package.json` so nobody
   "helpfully" upgrades it.
2. **Prisma 7 moved seed registration out of `package.json`, so `prisma.config.ts` is mandatory.**
   Without it `pnpm prisma db seed` does nothing and `prisma migrate reset` no longer re-seeds —
   which `08-docs-plan.md` §2.7 promises reviewers. ~10 minutes, and the failure mode is silent:

   ```ts
   // prisma.config.ts
   import { defineConfig } from 'prisma/config';
   export default defineConfig({
     schema: 'prisma/schema.prisma',
     migrations: { seed: 'tsx prisma/seed.ts' },
   });
   ```

3. **Zod 4, not 3.** The guard in §5 uses `z.looseObject()`, which is Zod 4 API. Every other
   spec that writes Zod assumes 4; `00-foundation.md` §2a lists the four call sites that differ.

`package.json` is written **once**, complete, by this slice. It is the union of every script named
across specs 01 / 06 / 07 — no later task edits it:

```jsonc
{
  "engines": { "node": "22.x" },
  "packageManager": "pnpm@10.34.3",
  "scripts": {
    "dev": "next dev",
    "build": "prisma generate && next build",
    "start": "next start",
    "postinstall": "prisma generate",

    "db:up": "docker compose -f docker-compose.test.yml up -d --wait",
    "db:migrate": "prisma migrate dev",
    "db:seed": "prisma db seed",
    "db:studio": "prisma studio",
    "db:deploy": "prisma migrate deploy",
    // LOCAL ONLY. Never against Neon — it drops the database (§6.3).
    "db:reset": "prisma migrate reset --force",

    "test": "vitest run",
    "test:unit": "vitest run --project unit",
    "test:integration": "pnpm db:test:up && vitest run --project integration",
    "test:watch": "vitest --project unit",
    "db:test:up": "docker compose -f docker-compose.test.yml up -d --wait",
    "db:test:down": "docker compose -f docker-compose.test.yml down -v",
    "typecheck": "tsc --noEmit"
  }
}
```

There is **no `prisma.seed` key** — on the 7.x pin that key is ignored; seed registration lives in
`prisma.config.ts` (rule 2 above).

`prisma generate` runs **twice** on Vercel on purpose: `postinstall` covers a cold install,
and the `build` script covers the case where Vercel restores a cached `node_modules` and skips
`postinstall`, which would otherwise ship a stale or missing client. This is risk **R2** in
`00-foundation.md` §9.

---

## 3. The schema

Complete and copy-pasteable. The three models and the enum are **verbatim** from
`00-foundation.md` §5; only the `datasource`, the `generator`, and explanatory comments are added.

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  // Runtime: Neon's PgBouncer endpoint (host contains "-pooler"). See §9.
  url       = env("DATABASE_URL")
  // Migrations / introspection / studio: Neon's direct endpoint (session mode).
  // Prisma Migrate needs advisory locks + DDL + a shadow database, none of which
  // survive a transaction-mode pooler.
  directUrl = env("DIRECT_URL")
}

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

### 3.1 Every index, and the query it exists for

| Index | Created by | Query it serves |
|---|---|---|
| `User.email` unique btree | `@unique` | `POST /api/auth/login` (`findUnique({ where: { email } })`) and `POST /api/documents/:id/shares` (share-by-email lookup). Also the **correctness** constraint that makes email a stable identity. |
| `Document (ownerId, updatedAt DESC)` | `@@index` | The **My documents** half of `GET /api/documents`: `where: { ownerId }, orderBy: { updatedAt: 'desc' }`. Composite + matching sort direction means Postgres can satisfy filter *and* order from one index with no sort node. |
| `DocumentShare (documentId, userId)` unique | `@@unique` | Three jobs at once: (a) enforces `00-foundation.md` §6 rule 4 — one role per user per doc — at the database, not just in a handler; (b) gives Prisma the compound selector `where: { documentId_userId: { documentId, userId } }` needed for `upsert`, which is how re-sharing updates instead of duplicating; (c) its leading column serves `GET /api/documents/:id/shares` (`where: { documentId }`). |
| `DocumentShare (userId)` | `@@index` | The **Shared with me** half of `GET /api/documents`: `where: { userId }, include: { document: ... }`. |
| PK btrees on all three `id` columns | `@id` | `GET/PATCH/DELETE /api/documents/:id`, session → user lookup. |

**Not indexed on purpose:** `DocumentShare.grantedById`. Nothing queries "shares granted by X";
`grantedBy` is read only via the relation when rendering the share list of one document, which
is already reached through the `documentId` index. Adding an index for a query that does not
exist is write cost with no read benefit.

**Known, accepted imperfection:** the *Shared with me* query orders by `document.updatedAt`,
which the `userId` index cannot supply — Postgres will fetch the (at most a handful of) share
rows and sort them in memory. At three users this is free. The real fix at scale is denormalising
`updatedAt` onto the share row, which is exactly the kind of complexity `00-foundation.md` §4
tells us not to buy.

### 3.2 Every `onDelete`, and what it means

| Relation | Action | Reasoning |
|---|---|---|
| `Document.owner → User` | `Cascade` | Prisma's default for a *required* relation is `Restrict`, which would make a user undeletable forever. Cascade states the real ownership semantics: a document cannot outlive its owner. In the product we never delete users; the value is that test teardown and any future account-deletion story are one statement, and the FK never lies about what is orphanable. |
| `DocumentShare.document → Document` | `Cascade` | **The one cascade the product actually exercises.** `DELETE /api/documents/:id` must not fail with a foreign-key violation because share rows still point at the document, and it must not leave rows that would resurrect access if an id were ever reused. |
| `DocumentShare.user → User` | `Cascade` | Deleting a recipient revokes their access. Same reasoning as the owner cascade: the alternative default (`Restrict`) makes users permanently undeletable and gives us nothing. |
| `DocumentShare.grantedBy → User` | *(unset → Prisma default `Restrict`)* | Left as `00-foundation.md` §5 defines it. `grantedById` is provenance ("shared by Alice"), and losing provenance silently is worse than a loud error. Consequence to know: because Postgres `RESTRICT` fires immediately rather than at end-of-statement, deleting a user who has granted any share errors **even if** those share rows would have been removed by another cascade in the same statement. |

**Operational consequence of that last row** — any code that wipes the database must delete in
dependency order, not rely on cascades:

```ts
await prisma.documentShare.deleteMany();
await prisma.document.deleteMany();
await prisma.user.deleteMany();
```

That ordering belongs in the integration-test teardown helper (see the testing spec) and is the
reason the seed script in §7 uses upserts and never wipes.

---

## 4. Why content is `Json` holding a ProseMirror doc node

`Document.content` maps to Postgres `jsonb` and stores exactly what TipTap's
`editor.getJSON()` returns: a node tree rooted at `{ type: "doc", content: [...] }`.

```json
{
  "type": "doc",
  "content": [
    { "type": "heading", "attrs": { "level": 1 },
      "content": [{ "type": "text", "text": "Q3 Product Roadmap" }] },
    { "type": "paragraph",
      "content": [
        { "type": "text", "text": "Owner: " },
        { "type": "text", "marks": [{ "type": "bold" }], "text": "Alice Rivera" }
      ] }
  ]
}
```

### 4.1 What this buys

| Benefit | Concretely |
|---|---|
| **No HTML sanitisation surface** | We never store an HTML string and never call `dangerouslySetInnerHTML` on user content. There is no place for `<script>`, `onerror=`, or a `javascript:` href to survive a round-trip, because the storage format has no concept of an attribute we didn't model. The whole class of stored-XSS bugs is *structurally* absent rather than defended against — no DOMPurify, no allowlist to keep current, no CSP band-aid. At 8 hours, deleting a threat class is worth far more than mitigating one. |
| **Structural validation is possible and cheap** | You cannot meaningfully assert "this HTML string is a valid document" at the boundary. You can trivially assert `type === "doc"` on a tree (§5). The format lets a 10-line guard do real work. |
| **Save/reopen is lossless (C4)** | The editor's in-memory model *is* the storage model. No HTML→JSON→HTML normalisation step, so no drift where an `<em>` comes back as `<i>`, a nested list re-nests differently, or whitespace collapses. "Formatting preserved after reload" is true by construction rather than by testing every mark. |
| **Future diffability / version history** | The brief's optional stretch list includes version history. Diffing two node trees by position is a tractable problem; diffing two HTML strings is not. We are not building it (§10), but PM JSON is the choice that keeps it a day of work instead of a rewrite. |
| **`jsonb`, not `text`** | Postgres parses and stores it structurally: it is queryable with `->`/`@>` and indexable with GIN later if we ever need it, without a migration to change column type. |

### 4.2 What this costs — stated honestly, because it is a real trade

| Cost | Mitigation / why we accept it |
|---|---|
| **Content is only renderable through TipTap/ProseMirror.** Any consumer needs the same extension list to make sense of the tree. | The only consumers are the editor and (potentially) an export feature. `@tiptap/html`'s `generateHTML(json, extensions)` is the escape hatch and it takes the same extension array we already export from `lib/editor-extensions.ts`. |
| **The extension list becomes part of the data contract.** Removing an extension makes previously-saved nodes unrenderable. | Say it out loud in `ARCHITECTURE.md`. Our extension set is frozen at `schemaExtensions` in `lib/editor-extensions.ts` — StarterKit v3 with `codeBlock`/`code`/`blockquote`/`horizontalRule`/`strike`/`link` disabled, and **underline supplied by StarterKit itself, never installed separately** (`00-foundation.md` §2, §5a) and §4 forbids adding tables/images/code blocks, so the contract does not move during the assessment. `enableContentCheck: true` on the editor turns a mismatch into a visible error instead of a white screen. |
| **Not greppable.** `WHERE content ILIKE '%foo%'` matches JSON punctuation and node type names, not prose. Full-text search would need a derived `plainText` column kept in sync on every write. | Search is an explicit non-goal (`00-foundation.md` §4). This cost is unbilled at this scope. When it is billed, the fix is a generated `plainText` column, not a format change. |
| **Larger payloads than Markdown** for the same text (~3–5× for heavily-marked prose). | Documents here are hundreds of bytes to a few KB. The §5 size ceiling caps the worst case. |

**Rejected alternatives, for the record:** *HTML* — reintroduces the sanitisation surface and the
normalisation drift, for the sole benefit of being human-readable in `psql`. *Markdown* — lossy
for underline (no native syntax), forces a parse on every read, and turns the editor into a
serialiser round-trip that mangles nested lists.

---

## 5. The write-path shape guard

```ts
// lib/documents/content.ts
import { z } from "zod";
import type { Prisma } from "@prisma/client";

/** Max serialised size of a document body. Guards the DB and the JSON parser. */
export const MAX_CONTENT_BYTES = 1_000_000; // 1 MB

/**
 * Minimal structural guard for a ProseMirror document node.
 * We assert the ROOT shape only — see "Why not deeper" below.
 */
export const documentContentSchema = z.looseObject({
  type: z.literal("doc"),
  content: z.array(z.looseObject({ type: z.string().min(1) })).max(10_000),
});
// Zod 3 equivalent, if the pin in §2 ever slips:
//   z.object({ type: z.literal("doc"), content: z.array(z.object({ type: z.string() }).passthrough()).max(10_000) }).passthrough()

export type DocumentContent = z.infer<typeof documentContentSchema>;

/** Canonical empty document. Used by POST /api/documents. */
export const EMPTY_DOC: DocumentContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

/** Byte size of the serialised body, for the 413 check. */
export function contentByteSize(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
}

/**
 * Defensive READ path: a row written before this guard existed, or hand-edited in
 * Studio, must not white-screen the editor. Bad shape degrades to an empty doc.
 */
export function toDocumentContent(value: Prisma.JsonValue): DocumentContent {
  const parsed = documentContentSchema.safeParse(value);
  return parsed.success ? parsed.data : EMPTY_DOC;
}

/** Prisma's write type for a non-nullable Json column. */
export function toPrismaJson(content: DocumentContent): Prisma.InputJsonValue {
  return content as unknown as Prisma.InputJsonValue;
}
```

### 5.1 Where it is enforced

| Route | Rule |
|---|---|
| `POST /api/documents` | Body carries no content; the handler writes `EMPTY_DOC`. |
| `POST /api/documents/import` | The parser's output is run through `documentContentSchema.parse()` before it reaches Prisma. If the import pipeline produces something that is not a doc node, that is a bug we want to fail loudly at the boundary, not persist. |
| `PATCH /api/documents/:id` | `content` is optional; when present it is validated by `documentContentSchema` inside the route's Zod body schema, and then by the byte ceiling. |

Order of checks in `PATCH`, and the status codes:

| # | Check | Failure |
|---|---|---|
| 1 | Body parses as JSON | `400 INVALID_JSON` |
| 2 | Zod body schema (incl. `documentContentSchema`) | `400 VALIDATION_FAILED` + `details` from `z.flattenError(error)` |
| 3 | `contentByteSize(content) <= MAX_CONTENT_BYTES` | `413 CONTENT_TOO_LARGE` |
| 4 | `resolveAccess` grants `update content` (`03-auth-and-permissions.md`) | `404` for `NONE`, `403` otherwise |
| 5 | Optimistic concurrency (§5.3) | `409 CONFLICT` |

`413 CONTENT_TOO_LARGE` is an addition to the code list implied by `00-foundation.md` §7; it uses
the same `{ error: { code, message } }` envelope. Recorded in §11.

### 5.2 Why we do **not** deep-validate the ProseMirror tree

A faithful Zod schema for our node set (doc, paragraph, heading with `attrs.level ∈ 1..3`, text
with a `marks` array constrained to bold/italic/underline, bulletList/orderedList/listItem with
their content expressions, hardBreak, horizontalRule) is roughly 150 lines and about an hour to
write and test. We are not spending that hour, for five reasons:

1. **The authoritative schema already exists**, in the TipTap extension list. A Zod copy is a
   second source of truth that will drift the first time the toolbar changes — every editor
   tweak becomes a two-file change, and the failure mode of drift is "valid documents rejected
   in production", which is worse than the problem being solved.
2. **ProseMirror validates on load anyway.** `Node.fromJSON` rejects node and mark types the
   schema does not know. With `enableContentCheck: true` the editor surfaces a `contentError`
   instead of crashing. So the *rendering* layer is already a validator, and it is the one whose
   opinion actually matters.
3. **The threat model does not need it.** The reason to distrust content is code execution, and
   §4 already closed that by never rendering user HTML. A structurally weird but well-typed tree
   is a rendering annoyance for the one user who caused it, not a security event.
4. **The failure it must prevent is coarse.** The realistic bad writes are `null`, `"hello"`,
   `[]`, `{}`, or `{ type: "paragraph" }` at the root — a client bug, a bad import, or a manual
   Studio edit. Each of these makes the editor unopenable on the next load, which is a *visible*
   data-loss bug. Root-shape + array-of-typed-nodes catches all of them for ten lines.
5. **Budget.** One hour is 12.5% of the total build, spent to defend three seeded users against
   themselves.

Also rejected: **server-side validation with the real ProseMirror schema** (`Node.fromJSON`
against our extension list inside the `PATCH` handler). It is the *correct* validation, but it
pulls ProseMirror — and, for some extensions, a DOM — into the hot write path on serverless,
which is precisely the uncertainty flagged as risk **R1**. The import route pays that cost once
because it has no choice; the autosave route, hit every few seconds, does not.

### 5.3 Optimistic concurrency is a persistence-layer concern

`00-foundation.md` §7 requires `PATCH` to take `lastKnownUpdatedAt` and answer `409` on a
mismatch. Implement the check as a **conditional update**, not read-then-write:

```ts
// lib/documents/update.ts
const result = await prisma.document.updateMany({
  where: { id, updatedAt: new Date(lastKnownUpdatedAt) },
  data: {
    ...(title !== undefined ? { title } : {}),
    ...(content !== undefined ? { content: toPrismaJson(content) } : {}),
  },
});

if (result.count === 0) {
  // Two causes, and they are different responses: the token is stale (409), or the row
  // was deleted between the access check and this statement (404). Distinguish them.
  const current = await prisma.document.findUnique({ where: { id }, select: { updatedAt: true } });
  if (!current) throw new ApiError('NOT_FOUND', 'Document not found.', 404);
  throw new ApiError('CONFLICT', 'This document was changed somewhere else.', 409, {
    currentUpdatedAt: current.updatedAt.toISOString(),
    lastKnownUpdatedAt,
  });
}

// `content` is deliberately NOT selected: 02-api-contract.md §7.8 does not echo it back,
// and shipping a 1 MB body on every autosave tick is pure waste.
const doc = await prisma.document.findUniqueOrThrow({
  where: { id },
  select: { id: true, title: true, updatedAt: true },
});
```

Two things make this safe rather than clever:

- **Atomicity.** `SELECT` then `UPDATE` has a window where a concurrent writer slips between the
  two statements and the check passes anyway. `UPDATE ... WHERE id = ? AND updated_at = ?` has no
  such window; the row lock is taken by the same statement that tests the predicate.
- **Timestamp precision round-trips exactly.** Prisma maps `DateTime` to Postgres `timestamp(3)`,
  and `Date.prototype.toISOString()` emits milliseconds. So the ISO string the client received
  from the previous `PATCH` reconstructs to the identical `Date` — no truncation, no spurious
  `409`. This is the mechanical half of the mitigation for risk **R4**; the client-side half is in
  the editor spec (`04-ui-spec.md` §7.3) and is **two rules, both mandatory**: advance the token
  **only** from a successful `PATCH` body, and keep **at most one `PATCH` in flight per document**
  (skip-if-in-flight, re-fire once on completion if still dirty). `DECISIONS.md` **D002** keeps that
  in-flight guard explicitly non-optional — it cut the request-*merging queue* around it, not the
  guard. Shipping this conditional `UPDATE` without the guard turns a correctness feature into a bug:
  a lone user editing for two minutes would `409` against themselves.

`@updatedAt` is applied by the Prisma **client**, not by a database trigger. That is fine here
because every write to `Document` goes through Prisma, but it means a manual `UPDATE` in `psql`
or Studio will not bump `updatedAt` and will therefore go unnoticed by the conflict check. Do not
hand-edit documents during the demo.

---

## 6. Migration workflow

### 6.1 Local database

Local development and integration tests share one Postgres 16 container, two databases.

**The compose file itself is owned by `06-test-plan.md` §5.2** — postgres:16-alpine on host port
**55432**, user/password `test`, database `shared_docs_test`, a `pg_isready` healthcheck, and a
**tmpfs** data directory so the database dies with the container and there is no stale volume to
explain. Its port and database name are load-bearing: `tests/integration/global-setup.ts` refuses to
run against any URL that is not `shared_docs_test` on `:55432`, which is what stops a truncating
test suite from ever pointing at a real database.

This slice contributes exactly one file to that container — the initdb script that adds the **dev**
database beside the test one, so there is still only one compose file to explain in the README:

```sql
-- .docker/initdb/01-dbs.sql   (mounted read-only at /docker-entrypoint-initdb.d)
CREATE DATABASE shared_docs_dev;
GRANT ALL PRIVILEGES ON DATABASE shared_docs_dev TO test;
```

Reviewers who do not want Docker can point `DATABASE_URL`/`DIRECT_URL` at any Postgres, including
their own Neon branch — document both paths in the README.

### 6.2 Environment variables

| Var | Local value | Vercel value | Read by |
|---|---|---|---|
| `DATABASE_URL` | `postgresql://test:test@localhost:55432/shared_docs_dev` | Neon **pooled** URL (§9) | Prisma client at runtime |
| `DIRECT_URL` | same as `DATABASE_URL` locally (no pooler in front of Docker) | Neon **direct** URL (§9) | `prisma migrate`, `prisma studio` |
| `AUTH_SECRET` | any ≥32-char string | a distinct value generated with `openssl rand -base64 32` | `lib/env.ts`, the login route, the middleware |
| `TEST_DATABASE_URL` | `postgresql://test:test@localhost:55432/shared_docs_test` | — | `.env.test` only; integration tests |

`DATABASE_URL`, `DIRECT_URL` and `AUTH_SECRET` go in `.env` (gitignored). **`.env`, not
`.env.local`** — Next.js reads both, but the Prisma CLI only reads `.env`, so `.env` is the single
file that satisfies both tools. Commit `.env.example` with those three keys and placeholder values.
`TEST_DATABASE_URL` lives only in the committed `.env.test`, alongside a copy of `DIRECT_URL` and an
`AUTH_SECRET` of at least 32 characters — Prisma validates *every* env var the schema references at
CLI startup, so `prisma db push` in the integration global-setup fails with
`Environment variable not found: DIRECT_URL` if it is missing (`00-foundation.md` §2b).

**The variable is `AUTH_SECRET`.** `SESSION_SECRET` appears nowhere in this project.

### 6.3 The commands

```bash
# ── local, first run ────────────────────────────────────────────────
pnpm db:up                                   # docker compose -f docker-compose.test.yml up -d --wait
pnpm prisma migrate dev --name init          # writes SQL, applies it, regenerates the client
pnpm prisma db seed                           # tsx prisma/seed.ts

# ── local, after editing schema.prisma ─────────────────────────────
pnpm prisma migrate dev --name add_source_filename

# ── local, blow it away and start clean (NEVER against Neon) ────────
pnpm db:reset                                 # prisma migrate reset --force: drops, re-migrates, re-seeds

# ── Neon: apply committed migrations, from your laptop ─────────────
DATABASE_URL="$NEON_POOLED" DIRECT_URL="$NEON_DIRECT" pnpm prisma migrate deploy
DATABASE_URL="$NEON_POOLED" DIRECT_URL="$NEON_DIRECT" pnpm prisma db seed

# ── inspect ────────────────────────────────────────────────────────
pnpm prisma studio
```

`migrate dev` and `migrate deploy` both connect over `directUrl`, because DDL, the migration
advisory lock, and the shadow database all require a session-mode connection that a
transaction-mode pooler cannot provide. This is the whole reason the datasource declares two URLs.

If `migrate dev` fails to create a shadow database on a hosted provider, set
`shadowDatabaseUrl = env("SHADOW_DATABASE_URL")` in the datasource and point it at the local
Docker Postgres. Not expected on the Docker-local workflow above; noted so nobody loses 20
minutes to it.

**Target: exactly one migration, `init`.** The schema is fixed by `00-foundation.md` §5 and there
is nothing left to discover. If a change is genuinely needed, add a new migration; never edit an
applied `migration.sql`, and never run `migrate reset` against Neon once the deployment exists —
that wipes the demo state a reviewer might be looking at.

### 6.4 Migrations are **not** run in the Vercel build

The build command is `prisma generate && next build`. It does **not** call `prisma migrate deploy`.

| Reason | Detail |
|---|---|
| **Preview deploys would mutate production schema** | Every push builds. A build-time migration means a half-finished feature branch can apply a schema change to the production database before anyone has reviewed it. Schema changes must be a deliberate act, not a side effect of pushing code. |
| **Build caching makes the timing non-deterministic** | A build that hits Vercel's cache may skip steps; a rebuild with no code change reruns them. "When did the migration run?" should have an answer. |
| **Rollback becomes a lie** | Vercel can instantly roll back the app. It cannot roll back a schema. Coupling them produces a rollback button that restores the code but not the database it expects. |
| **Concurrency and timeouts** | Two builds can run at once. Prisma serialises them with an advisory lock, which means one *waits* — and a build that times out waiting fails a deploy for a reason that has nothing to do with the deploy. |
| **It costs nothing to do it right here** | One migration, run once, from a laptop, in three seconds, with the output visible. Automation would be pure ceremony at this scope. |

Deployment order for every schema change, in the README and `ARCHITECTURE.md`:
**(1)** run `prisma migrate deploy` against Neon → **(2)** push code → **(3)** Vercel builds and
deploys. Additive-first migrations only, so step 1 is always safe against the currently-live code.

---

## 7. Seed script

Run with `pnpm prisma db seed` (wired through `package.json#prisma.seed` → `tsx prisma/seed.ts`).

### 7.1 Users

Password for all three: **`demo1234`**, hashed with `bcryptjs` at cost factor 10. Stated on the
login page (`00-foundation.md` §8) and in the README/`SUBMISSION.md`.

| id (fixed) | name | email | password |
|---|---|---|---|
| `seed-user-alice` | Alice Rivera | `alice@example.com` | `demo1234` |
| `seed-user-bob` | Bob Chen | `bob@example.com` | `demo1234` |
| `seed-user-carol` | Carol Mendes | `carol@example.com` | `demo1234` |

**IDs are fixed and human-readable, not generated cuids.** `@default(cuid())` only fires when the
field is omitted, so supplying a string is legal. The payoff: stable URLs for the demo
(`/documents/seed-doc-roadmap` can be pasted into the video script), stable fixtures for
integration tests, and a seed that is idempotent by `id` as well as by `email`.

The cost, which every other spec must respect: **route params and body ids are validated as
`z.string().min(1).max(64)`, never `z.string().cuid()`.** A `cuid()` check would reject every
seeded id. Recorded in §11.

### 7.2 Documents

Designed so that **every cell of the `00-foundation.md` §6 access matrix is reachable by clicking**,
without anyone having to create or share anything first.

| id | title | owner | `sourceFilename` | shares | what it proves |
|---|---|---|---|---|---|
| `seed-doc-roadmap` | Q3 Product Roadmap | Alice | — | Bob → `EDITOR` | The **editor** path: Bob opens a doc he does not own, the toolbar is live, `PATCH` succeeds, autosave works, it appears under *Shared with me* with an `Editor` badge. |
| `seed-doc-handbook` | Team Handbook | Alice | — | Carol → `VIEWER` | The **viewer** path: Carol sees the read-only banner, the toolbar is disabled, and a hand-rolled `PATCH` returns `403` (the UI is an affordance, the 403 is the control — `00-foundation.md` §6 rule 3). |
| `seed-doc-private` | Alice — Private Draft | Alice | — | *(none)* | The **`NONE` → 404** path. `GET /api/documents/seed-doc-private` as Bob or Carol must return `404`, not `403`, and the id must not appear in either list. |
| `seed-doc-bob-notes` | Bob's Meeting Notes | Bob | — | *(none)* | **Ownership is per-user**: Alice's dashboard does not contain it, and Bob's *My documents* section is non-empty so the dashboard's two-section layout is demoable from a second account. |
| `seed-doc-imported` | Imported: Product Brief | Alice | `product-brief.md` | Bob → `VIEWER`, Carol → `EDITOR` | Three things at once: the **provenance badge** for imported documents without anyone having to run an import; the **share list with two rows** at two different roles (the owner-only share dialog would otherwise render a single row everywhere); and it **completes the matrix** — see §7.3. |

### 7.3 Access coverage this produces

| | roadmap | handbook | private | bob-notes | imported |
|---|:--:|:--:|:--:|:--:|:--:|
| **Alice** | OWNER | OWNER | OWNER | NONE | OWNER |
| **Bob** | EDITOR | NONE | NONE | OWNER | VIEWER |
| **Carol** | NONE | VIEWER | NONE | NONE | EDITOR |

Both non-owner accounts hit all four access levels, and each level appears at least twice across
the set. This table is copied verbatim into `README.md` as the reviewer's test script, and it is
verified by this slice's own DoD (a query for Carol's readable documents) and by the manual QA run
in `06-test-plan.md` §9.

**It is not the integration suite's fixture.** `06-test-plan.md` §5.4 builds its own three-document
graph (`d1`/`d2`/`d3`) so a `TRUNCATE`-per-test loop stays ~2 ms and its assertions read as prose.
That is a deliberate second fixture universe, not drift: the demo seed exists to make every access
level *clickable in ten seconds*, the test fixture exists to make every access level *assertable in
two milliseconds*, and neither is a good substitute for the other. What must never diverge is the
**access model** they both encode, and that lives in one place — `lib/permissions.ts`.

Bob being `EDITOR` on `roadmap` but `VIEWER` on `handbook` is deliberate: it is the cheapest
possible proof that `resolveAccess` is per-document and not per-user.

### 7.4 Seeded content

Every document is seeded with a ProseMirror body that exercises **every supported node and mark**
— H1, H2, paragraph, bold, italic, underline, bullet list, ordered list — so requirements C4–C7
are visible the instant a document opens, before anyone types a character.

```ts
// prisma/seed.ts — content helper
import type { DocumentContent } from "../lib/documents/content";

const text = (t: string, marks?: string[]) => ({
  type: "text",
  text: t,
  ...(marks ? { marks: marks.map((type) => ({ type })) } : {}),
});

const bullets = (items: string[]) => ({
  type: "bulletList",
  content: items.map((i) => ({
    type: "listItem",
    content: [{ type: "paragraph", content: [text(i)] }],
  })),
});

const numbered = (items: string[]) => ({
  type: "orderedList",
  attrs: { start: 1 },
  content: items.map((i) => ({
    type: "listItem",
    content: [{ type: "paragraph", content: [text(i)] }],
  })),
});

function demoDoc(heading: string, lead: string, points: string[], steps: string[]): DocumentContent {
  return {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 1 }, content: [text(heading)] },
      {
        type: "paragraph",
        content: [
          text("This document is "),
          text("seeded demo content", ["bold"]),
          text(" — it is "),
          text("safe to edit", ["italic"]),
          text(" and can be restored with "),
          text("pnpm prisma db seed", ["underline"]),
          text("."),
        ],
      },
      { type: "heading", attrs: { level: 2 }, content: [text("Summary")] },
      { type: "paragraph", content: [text(lead)] },
      bullets(points),
      { type: "heading", attrs: { level: 2 }, content: [text("Next steps")] },
      numbered(steps),
    ],
  };
}
```

`underline` is the mark name registered by **StarterKit v3** (which depends on
`@tiptap/extension-underline` internally — we never install or register it ourselves; see
`_toolchain-findings.md` TRAP-2). It must match `schemaExtensions` in `lib/editor-extensions.ts`
exactly, or seeded documents will render without underline (or, with `enableContentCheck: true`,
raise a content error). Verify this by opening a seeded doc, not by reading the JSON.

### 7.5 The script

```ts
// prisma/seed.ts
import { PrismaClient, ShareRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import type { DocumentContent } from "../lib/documents/content";

const prisma = new PrismaClient();
const DEMO_PASSWORD = "demo1234";

// ... text/bullets/numbered/demoDoc helpers from §7.4 ...

const USERS = [
  { id: "seed-user-alice", email: "alice@example.com", name: "Alice Rivera" },
  { id: "seed-user-bob",   email: "bob@example.com",   name: "Bob Chen" },
  { id: "seed-user-carol", email: "carol@example.com", name: "Carol Mendes" },
] as const;

const DOCS: Array<{
  id: string;
  title: string;
  ownerId: string;
  sourceFilename?: string;
  content: DocumentContent;
  shares: Array<{ userId: string; role: ShareRole }>;
}> = [
  {
    id: "seed-doc-roadmap",
    title: "Q3 Product Roadmap",
    ownerId: "seed-user-alice",
    content: demoDoc("Q3 Product Roadmap", "What we are shipping this quarter.",
      ["Document editing", "File import", "Sharing with roles"],
      ["Lock scope", "Ship the editor", "Ship sharing"]),
    shares: [{ userId: "seed-user-bob", role: ShareRole.EDITOR }],
  },
  {
    id: "seed-doc-handbook",
    title: "Team Handbook",
    ownerId: "seed-user-alice",
    content: demoDoc("Team Handbook", "How the team works day to day.",
      ["Async by default", "Write decisions down", "Small pull requests"],
      ["Read this", "Ask questions", "Suggest an edit"]),
    shares: [{ userId: "seed-user-carol", role: ShareRole.VIEWER }],
  },
  {
    id: "seed-doc-private",
    title: "Alice — Private Draft",
    ownerId: "seed-user-alice",
    content: demoDoc("Private Draft", "Nobody else can open this document.",
      ["Not shared with Bob", "Not shared with Carol"],
      ["Try opening it as Bob", "Expect a 404, not a 403"]),
    shares: [],
  },
  {
    id: "seed-doc-bob-notes",
    title: "Bob's Meeting Notes",
    ownerId: "seed-user-bob",
    content: demoDoc("Meeting Notes", "Bob owns this; Alice cannot see it.",
      ["Owned by Bob", "Shared with nobody"],
      ["Sign in as Bob", "Confirm it is under My documents"]),
    shares: [],
  },
  {
    id: "seed-doc-imported",
    title: "Imported: Product Brief",
    ownerId: "seed-user-alice",
    sourceFilename: "product-brief.md",
    content: demoDoc("Product Brief", "Created by importing a Markdown file.",
      ["Imported from product-brief.md", "Shared with two people at two roles"],
      ["Open the share dialog", "Change Bob to Editor", "Revoke Carol"]),
    shares: [
      { userId: "seed-user-bob", role: ShareRole.VIEWER },
      { userId: "seed-user-carol", role: ShareRole.EDITOR },
    ],
  },
];

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  for (const u of USERS) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { id: u.id, name: u.name, passwordHash },
      create: { ...u, passwordHash },
    });
  }

  for (const d of DOCS) {
    await prisma.document.upsert({
      where: { id: d.id },
      update: {
        title: d.title,
        content: d.content as object,
        sourceFilename: d.sourceFilename ?? null,
        ownerId: d.ownerId,
      },
      create: {
        id: d.id,
        title: d.title,
        content: d.content as object,
        sourceFilename: d.sourceFilename ?? null,
        ownerId: d.ownerId,
      },
    });

    for (const s of d.shares) {
      await prisma.documentShare.upsert({
        where: { documentId_userId: { documentId: d.id, userId: s.userId } },
        update: { role: s.role, grantedById: d.ownerId },
        create: { documentId: d.id, userId: s.userId, role: s.role, grantedById: d.ownerId },
      });
    }
  }

  // Printed as markdown so README.md's demo-accounts table is PASTED from a real run,
  // never hand-typed (08-docs-plan.md §2.9). A typed table drifts the first time an
  // email changes, and a reviewer who cannot log in stops reviewing.
  console.log(`\nSeeded ${USERS.length} users and ${DOCS.length} documents.\n`);
  console.log('| Name | Email | Password | Set up so that… |');
  console.log('|---|---|---|---|');
  console.log(`| Alice | \`alice@example.com\` | \`${DEMO_PASSWORD}\` | owns four documents and has shared three of them |`);
  console.log(`| Bob | \`bob@example.com\` | \`${DEMO_PASSWORD}\` | **editor** on "Q3 Product Roadmap", **viewer** on "Imported: Product Brief", owns one document of his own |`);
  console.log(`| Carol | \`carol@example.com\` | \`${DEMO_PASSWORD}\` | **viewer** on "Team Handbook", **editor** on "Imported: Product Brief", and has **no access** to "Alice — Private Draft" so the denial path is demonstrable |`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

### 7.6 Idempotency rules

The seed **must be safe to run any number of times, against a database that already has data.**

| Rule | Why |
|---|---|
| Users upsert on `email` (the natural key), and the `update` branch also pins `id` | Email is the identity a login uses; pinning `id` on update repairs a database seeded before ids were fixed. |
| Documents upsert on `id`; shares upsert on the compound `documentId_userId` | Deterministic ids make re-running a no-op-shaped operation instead of a duplication. |
| The `update` branch **restores the canonical demo state** (title, content, shares, role) | This is the feature, not a side effect: reviewers will edit the seeded documents. `pnpm prisma db seed` becomes "reset the demo", which is exactly what is needed 30 seconds before recording the walkthrough video. |
| **No `deleteMany` anywhere** in the seed | Running the seed must never destroy something a reviewer created. Accepted consequence: a share the reviewer revoked comes back, and a share or document they added survives. That is the right asymmetry — restoring is cheap, deleting someone's work is not. |
| The seed does not run automatically on deploy | It is invoked explicitly, once, after the first `migrate deploy` (§6.3), for the same reasons migrations are not in the build. |
| `bcrypt.hash` is called once, outside the loop | ~100ms at cost 10, three times over is pointless; also keeps the hash identical for all three accounts, which makes the fixture easy to reason about. |

---

## 8. Prisma client singleton

```ts
// lib/db.ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "warn", "error"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

**Why `globalThis`.** In `next dev`, hot module replacement re-evaluates modules as you edit.
A bare `export const prisma = new PrismaClient()` constructs a *new* client — and a new connection
pool — on every reload. Within a few minutes of editing you exhaust Neon's connection ceiling and
get `too many connections` errors that look like a database problem and are actually a dev-server
problem. `globalThis` survives HMR, so the same client is reused.

**Why not cache it in production.** Each serverless instance evaluates the module once and holds
one client for its lifetime — module scope already gives the correct behaviour. Writing to
`globalThis` in production is a no-op at best and a leak across a warm instance's lifecycle at worst.

**Hard rule — `lib/db.ts` must never be reachable from `middleware.ts`.** Edge middleware
runs on the Edge runtime, where the standard Prisma client does not work. The middleware
protecting `/documents/*` verifies the session with `jose` only, and never imports anything that
transitively imports this file. See `03-auth-and-permissions.md`. If middleware starts failing at
build time with a Node-API or `child_process` error, an import chain into `db.ts` is the first
thing to check.

Every route handler and server component imports the client from exactly this path:

```ts
import { prisma } from "@/lib/db";
```

---

## 9. Connection pooling on serverless

Neon exposes two hostnames for the same database:

| Endpoint | Host shape | Mode | Used for |
|---|---|---|---|
| **Pooled** | `ep-xxx-pooler.<region>.aws.neon.tech` | PgBouncer, transaction mode | `DATABASE_URL` — all application runtime queries |
| **Direct** | `ep-xxx.<region>.aws.neon.tech` | plain session mode | `DIRECT_URL` — `prisma migrate`, `prisma studio`, introspection |

```bash
DATABASE_URL="postgresql://USER:PASS@ep-xxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require&pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://USER:PASS@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require"
```

**Why the pooled URL at runtime.** A Vercel function invocation can land on a cold isolate, which
evaluates `lib/db.ts` and opens a fresh connection pool. Traffic concurrency therefore
multiplies directly into Postgres connections: *N concurrent invocations × pool size*. Against a
direct endpoint that saturates Neon's connection limit at trivial load and produces
`FATAL: sorry, too many clients already` — a failure that shows up as an intermittent 500 in the
middle of a reviewer's demo and looks like a bug in the app. PgBouncer in transaction mode
multiplexes many short-lived client connections onto a small number of real server connections,
so the ceiling stops being a function of invocation concurrency.

**Why each query parameter is there:**

| Param | Effect |
|---|---|
| `sslmode=require` | Neon requires TLS. |
| `pgbouncer=true` | Tells Prisma to disable prepared statements. PgBouncer in transaction mode gives a different server connection per transaction, so a prepared statement created on one is missing on the next — the symptom is a sporadic `prepared statement "s0" does not exist`. This flag is not optional. |
| `connection_limit=1` | Each invocation serves one request, so a per-isolate pool larger than 1 is idle capacity that still consumes a pooler slot. Setting 1 keeps total connections proportional to concurrency instead of concurrency × 5 (Prisma's default of `num_cpus * 2 + 1`). |

**Why migrations must not go through the pooler.** Prisma Migrate takes a Postgres advisory lock
held across statements, issues DDL, and creates/drops a shadow database. All of that requires a
stable session, which transaction-mode pooling explicitly does not provide. Hence `directUrl`.
Running `migrate deploy` against the pooled URL typically hangs on the lock rather than failing
cleanly, which is a confusing 10 minutes nobody has budgeted.

**Transaction discipline.** Keep any `prisma.$transaction` short. Interactive transactions pin a
pooler connection for their whole duration, so a long one is a self-inflicted connection leak.
As specified, nothing in this app needs one: every write is a single statement or an `upsert`,
and the conflict check in §5.3 is deliberately a single conditional `UPDATE`.

**Vercel checklist:** set `DATABASE_URL` and `DIRECT_URL` in **both** the Production and Preview
environments. A preview deploy missing `DIRECT_URL` fails at `prisma generate` with a schema
validation error, not a connection error, which is a misleading symptom worth recognising.

---

## 10. What we did not model, and why

| Not modelled | Why not | What it would cost later |
|---|---|---|
| **`DocumentVersion` / history** | The brief lists version history as an *optional* stretch; `00-foundation.md` §2 already spends the stretch budget on role-based permissions, and §4 forbids doubling up. | ~2h: a table (`documentId`, `content`, `createdAt`, `authorId`), a write on each autosave settle, and a restore UI. Storing PM JSON (§4) is precisely what keeps this a bounded feature. |
| **Soft delete (`deletedAt`)** | Every read query would need `where: { deletedAt: null }`, and every index would need it as a leading column — a permanent tax on all queries to support a trash UI that §4 says we are not building. Hard delete plus the cascades in §3.2 is the honest model. | One additive migration and a filter in the resolver. |
| **Folders / tags / collections** | Non-goal (§4). Three users, five documents. Hierarchy without volume is decoration. | A `Folder` table and a nullable `folderId`. |
| **Audit log** | `DocumentShare.grantedById` + `createdAt` already carries the 5% of an audit trail the UI actually renders ("shared by Alice"). A real log needs append-only writes, retention, and a viewer — none of which is graded. | An `AuditEvent` table written from the same route handlers. |
| **`plainText` column / tsvector** | Search is a non-goal (§4), and it is the one cost §4.2 admits the JSON format imposes. Adding it now would be paying for a feature we deliberately cut. | A generated column plus a GIN index, and a backfill. |
| **Public link sharing (`Document.isPublic`, share tokens)** | Explicit non-goal (§4): sharing is user-to-user only. Modelling it without shipping it invites a reviewer to ask why a dead column exists. | A token table and an unauthenticated read path. |
| **`DocumentShare.expiresAt`** | No clock-driven behaviour exists anywhere else in the app, so expiry would need a sweeper or a filter that nothing else needs. | A column plus a `where` clause in the resolver. |
| **User profile fields (avatar, timezone, `updatedAt`)** | Nothing reads them. Columns nothing reads are noise in a schema a reviewer is going to read top to bottom. | Trivially additive. |
| **Postgres row-level security** | `00-foundation.md` §6 rule 2 says there is exactly one resolver. RLS policies would be a *second* authority on access, and two authorities that disagree are worse than one that is merely simple. Tests target the resolver (C16); testing RLS would need a separate harness. | Policies plus a per-request `SET LOCAL app.user_id`. |
| **A `Session` table** | Sessions are stateless `jose` JWTs in an httpOnly cookie (`00-foundation.md` §2), which is what makes Edge middleware possible. Server-side sessions would put a database round-trip in front of every request and break the middleware. | A table plus a revocation check. |

---

## 11. Rulings and remaining notes

Items 1–3 and 5 below were **proposals**; they have been accepted and written into
`00-foundation.md`, so they are recorded here as rulings rather than open questions.

1. ✅ **`413 CONTENT_TOO_LARGE` is in the registry** — `00-foundation.md` §7a, status `413`, with
   `MAX_CONTENT_BYTES = 1_000_000` in `lib/documents/content.ts` (§7b). It applies to `PATCH`
   **and** to the import result, which is why no separate node/character budget exists.
2. ✅ **Seeded ids are human-readable strings, not cuids** (§7.1) — pinned in `00-foundation.md` §5.
   **Every spec validates ids as `z.string().min(1).max(64)`, never `z.string().cuid()`.**
3. ✅ **The seed set is five documents, Alice owns four** — pinned in `00-foundation.md` §5, and the
   README (`08`) and the video pre-flight checklist (`09`) were corrected to match.
5. ✅ **One container, two databases, on port 55432.** `06-test-plan.md` owns
   `docker-compose.test.yml`; this slice adds `.docker/initdb/01-dbs.sql` so `shared_docs_dev` lives
   beside `shared_docs_test`. There is no second compose file and nothing runs on 5433.
4. **`DocumentShare.grantedBy` has no `onDelete`,** so Postgres gets `RESTRICT` and a user who has
   granted any share cannot be deleted — even when the share rows would be removed by another
   cascade in the same statement (§3.2). Harmless in the product (we never delete users) but it
   forces ordered deletes in test teardown. Left exactly as §5 specifies; flagged so nobody
   "fixes" the resulting error by weakening the schema mid-build.
6. **`prisma db seed` is run manually against Neon, once.** Not in the build, not in a Vercel
   post-deploy hook. Consistent with §6.4's reasoning, but worth stating because "the demo data is
   missing in production" is a plausible hour-7 panic.

---

## Definition of done

Persistence is complete when every one of these is verifiably true:

- [ ] `prisma/schema.prisma` contains the datasource with **both** `url` and `directUrl`, the
      `prisma-client-js` generator, and `User` / `Document` / `DocumentShare` / `ShareRole`
      byte-identical to `00-foundation.md` §5.
- [ ] `pnpm prisma validate` and `pnpm prisma format` both pass with no diff.
- [ ] `pnpm db:up && pnpm prisma migrate dev --name init` succeeds from an empty database and
      produces exactly one directory under `prisma/migrations/`.
- [ ] `prisma/migrations/*/migration.sql` is committed and contains the two `CREATE INDEX`
      statements and the `documentId, userId` unique constraint.
- [ ] `pnpm prisma migrate deploy` succeeds against Neon using `DIRECT_URL`, and `migrate status`
      afterwards reports no pending migrations.
- [ ] Neither `postinstall` nor `build` in `package.json` contains `migrate`; **both** run
      `prisma generate` (`build` is `prisma generate && next build` — a cached `node_modules`
      skips `postinstall`, which is exactly the failure `07-deployment-runbook.md` §8 lists).
- [ ] `prisma` and `@prisma/client` resolve to the **identical** version `7.10.0` in
      `pnpm-lock.yaml`, and `prisma.config.ts` registers the seed — verified by
      `pnpm prisma db seed` actually inserting rows on a 7.x install.
- [ ] `package.json` contains every script named across specs 01/06/07 and no later task edits it.
- [ ] `tsconfig.json` maps `@/*` to the repo root and there is **no `src/` directory**;
      `06`'s unit glob `lib/**/*.test.ts` collects the content-guard test.
- [ ] `pnpm prisma db seed` creates 3 users and 5 documents, and **running it a second time
      changes no row counts** (verified with `SELECT count(*)` on all three tables before and after).
- [ ] After editing a seeded document's title in the UI, re-running the seed restores the original
      title, and any document created by hand is still present.
- [ ] `bcrypt.compare("demo1234", user.passwordHash)` returns `true` for all three seeded users.
- [ ] The §7.3 access matrix is true in the database: a query for Carol's readable documents
      returns exactly `seed-doc-handbook` and `seed-doc-imported`.
- [ ] `lib/db.ts` exports a `globalThis`-cached `prisma` and is imported by every handler that
      touches the database.
- [ ] `middleware.ts` has no import path — direct or transitive — into `lib/db.ts`, and
      `next build` produces no Edge-runtime warning about Node APIs.
- [ ] `documentContentSchema` rejects `null`, `"text"`, `[]`, `{}`, and `{ type: "paragraph" }`,
      and accepts `EMPTY_DOC` and every seeded document body. Covered by a unit test in
      `lib/documents/content.test.ts` that runs with **no database**.
- [ ] `toDocumentContent` returns `EMPTY_DOC` for a malformed stored value rather than throwing.
- [ ] `PATCH` with a body over `MAX_CONTENT_BYTES` returns `413 CONTENT_TOO_LARGE`.
- [ ] The `PATCH` write path is a single conditional `updateMany` keyed on `updatedAt`; a stale
      `lastKnownUpdatedAt` yields `409` and a fresh one does not (integration test, per R4).
- [ ] Deleting a document removes its `DocumentShare` rows with no foreign-key error.
- [ ] Vercel Production **and** Preview both define `DATABASE_URL` (pooled, with
      `pgbouncer=true&connection_limit=1`) and `DIRECT_URL` (unpooled).
- [ ] `.env.example` is committed with `DATABASE_URL`, `DIRECT_URL` and **`AUTH_SECRET`**;
      `.env.test` is committed with `TEST_DATABASE_URL`, `DIRECT_URL` and an `AUTH_SECRET` of at
      least 32 characters; `.env` is gitignored and no live credential appears anywhere in the
      repository history.
- [ ] The deployed app survives a redeploy with all seeded and user-created documents intact (C12).
