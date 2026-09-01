# 06 — Test Plan

**Purpose.** This spec defines the entire automated-test surface for **shared-docs**, plus the manual QA
script that gets run before the walkthrough video. It covers the Vitest setup (two projects: a
zero-setup `unit` project and a Docker-Postgres `integration` project), the exact test cases for the
permission matrix, the import validators, and the API route handlers, what we deliberately leave
untested and why, and the reviewer-reproducible manual checklist. It is scoped to **~1.5 hours** of the
8-hour budget (see §10 for the degradation ladder if that hour runs out). Canonical decisions come from
[`00-foundation.md`](./00-foundation.md); the access model this suite encodes is §6 there and is
implemented per `03-auth-and-permissions.md`.

> **Sibling references.** The set is numbered and stable: `00-foundation.md` (canonical),
> `02-api-contract.md` (the wire contract), `03-auth-and-permissions.md` (the permission core),
> `05-import-spec.md` (the import pipeline). Every constant and code this suite asserts on is pinned
> in `00-foundation.md` §2a/§5a/§6a/§7a/§7b — **this spec imports them, it does not invent them.**
> §11 records what changed when that reconciliation happened.

---

## 1. Thesis: what we test, and what we refuse to chase

We test exactly two surfaces: **access control** and **import validation**. Both are places where a bug
is simultaneously the *most likely* (they are branchy, they encode a table a human transcribed by hand,
and they are the only code in the product where "it renders fine" and "it is correct" are different
questions) and the *most damaging* (a permission bug leaks or destroys another user's document; an
import bug is the file-handling equivalent of the same). They are also, not coincidentally, precisely
what a reviewer pokes at: the brief grades "full stack execution across frontend, backend, persistence,
and **access logic**", and the fastest way for a reviewer to falsify this submission is to log in as
Carol and try to `PATCH` a document she can only read. We would rather that request be covered by a test
we wrote than by a demo we hope holds.

**We are not chasing a coverage percentage, and we are not installing a coverage reporter.** At eight
hours, coverage is an anti-signal: it rewards writing tests for the code that is cheapest to test (React
render smoke tests, Prisma passthroughs, getters) and it says nothing about whether `VIEWER` can write.
A 90%-covered app with an unguarded `PATCH` fails the brief; a 25%-covered app where every cell of the
permission matrix and every rejected file type is asserted, against a real Postgres, passes it. The
metric we optimise is **"can a reviewer think of an access-control or upload attack this suite does not
already assert?"** If the answer is no, the suite is done, whatever the percentage says. This trade is
stated out loud in `ARCHITECTURE.md` and in the video — it is a judgement call we want graded, not a gap
we want overlooked.

---

## 2. Tooling and versions

| Package | Version line | Why |
|---|---|---|
| `vitest` | **`4.1.11`** | Native ESM + TS, one config, and `test.projects` gives us two suites in one file. Do **not** use `vitest.workspace.ts` — deprecated since 3.2 and gone in 4. Pin from `00-foundation.md` §2a; v5 is still an RC. |
| `vite-tsconfig-paths` | `^5.1.4` | Resolves the `@/*` alias from `tsconfig.json` so tests import route handlers the same way the app does. Without it every import needs a relative path. |
| `dotenv` | `^16.4.7` | Loads `.env.test` inside `vitest.config.ts` before the projects are constructed. |
| `zod` | `^4.1` | Already a runtime dependency (`00-foundation.md` §2a). The content shape-guard is a Zod schema, so its tests are plain unit tests. |

Everything else the tests need (`@prisma/client`, `jose`, `bcryptjs`) is already a production dependency
per foundation §2. **No new runtime dependency is added for testing.** No `@vitest/coverage-v8`, no
`supertest` (route handlers take a plain `Request`; `fetch` types are built in), no `msw` (we call
handlers directly, so there is nothing to intercept), no `@testing-library/react` (see §6).

Runtime: **Node 22.x**. The suite relies on the global `File`, `FormData`, `Request` and `Response`
(Node ≥ 20) and on `fetch`-shaped multipart bodies.

### 2.1 `vitest.config.ts` (full file, repo root)

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import { config as loadEnv } from 'dotenv';

// Loaded here (Vite config process) so TEST_DATABASE_URL is available when the
// integration project is constructed below. Never loaded inside a test file.
loadEnv({ path: '.env.test', quiet: true });

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    projects: [
      {
        // ── unit ─────────────────────────────────────────────────────────────
        // Pure functions only. No DB, no network, no filesystem, no env vars.
        // MUST pass on a clean clone after `pnpm install` and nothing else.
        plugins: [tsconfigPaths()],
        test: {
          name: 'unit',
          environment: 'node',
          include: ['lib/**/*.test.ts'],
          globals: false,
        },
      },
      {
        // ── integration ──────────────────────────────────────────────────────
        // Real Postgres in Docker. Route handlers invoked directly.
        plugins: [tsconfigPaths()],
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          globals: false,
          globalSetup: ['./tests/integration/global-setup.ts'],
          setupFiles: ['./tests/integration/setup.ts'],
          // One shared database => one worker. Parallel files would truncate
          // each other's fixtures mid-test. This is not a perf mistake, it is
          // the correctness constraint.
          fileParallelism: false,
          pool: 'forks',
          poolOptions: { forks: { singleFork: true } },
          hookTimeout: 30_000,
          testTimeout: 15_000,
          env: {
            // Prisma reads DATABASE_URL; point it at the throwaway test DB.
            DATABASE_URL: process.env.TEST_DATABASE_URL ?? '',
            // Prisma validates EVERY env var the schema references at CLI startup, and
            // schema.prisma declares directUrl. Without this, `prisma db push` in
            // global-setup dies with "Environment variable not found: DIRECT_URL"
            // before a single assertion runs.
            DIRECT_URL: process.env.TEST_DATABASE_URL ?? '',
            // AUTH_SECRET, not SESSION_SECRET — lib/env.ts throws at module evaluation
            // without it, and it must be >= 32 characters (00-foundation.md §2b).
            AUTH_SECRET: process.env.AUTH_SECRET ?? '',
          },
        },
      },
    ],
  },
});
```

### 2.2 `.env.test` (committed — it contains no secret of value)

```dotenv
TEST_DATABASE_URL="postgresql://test:test@localhost:55432/shared_docs_test?schema=public"
DIRECT_URL="postgresql://test:test@localhost:55432/shared_docs_test?schema=public"
# AUTH_SECRET (not SESSION_SECRET) and >= 32 characters, or lib/env.ts throws at import.
# The old value here was `test-secret-not-for-production` — 30 characters, two short, which
# would have failed every integration test at module evaluation with an env error.
AUTH_SECRET="test-secret-not-for-production-00000000"
```

Committing this is deliberate: the credentials address a throwaway container on a non-default port and
exist so `pnpm test:integration` works on a clean clone without a setup ritual. `.env` (real Neon URL,
real session secret) stays gitignored. Called out in `README.md`.

### 2.3 `package.json` scripts

```json
{
  "scripts": {
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

Two notes that will otherwise cost 20 minutes each:

- **`test:integration` starts the container inline with `&&`, not via a `pretest:integration` hook.**
  pnpm does not run `pre`/`post` lifecycle scripts by default (they need
  `enable-pre-post-scripts=true` in `.npmrc`). Relying on them silently does nothing.
- **`pnpm test` runs both projects and therefore requires Docker.** That is the right default for the
  author. It is *not* the reviewer entry point.

### 2.4 The hard rule

> **`pnpm test:unit` must pass on a clean clone with nothing but `pnpm install`.**
> No Docker, no database, no `.env`, no network, no `prisma generate` side effects.

A reviewer must always be able to run *something* and see green in under ten seconds. This constrains
what may live in the `unit` project: any file under `lib/**` that imports `@prisma/client`, reads
`process.env`, or touches the filesystem does not belong in a unit test. Concretely, `resolveAccess()`
(which queries the DB) is integration-tested; `can()` (which is a pure table lookup) is unit-tested.
That split is the reason `lib/permissions.ts` is designed with a pure core in the first place — see
§11 open question 4.

`README.md` states this rule verbatim under "Running the tests", with `pnpm test:unit` listed first.

---

## 3. Unit suite — the permission matrix (`lib/permissions.test.ts`)

This is the single highest-value test file in the repo. It is the executable form of foundation §6.

### 3.1 The module under test

`lib/permissions.ts` (owned by `03-auth-and-permissions.md`) exports:

```ts
export const ROLES = ['OWNER', 'EDITOR', 'VIEWER', 'NONE'] as const;
export type AccessRole = (typeof ROLES)[number];

// Six keys, UNPREFIXED — the vocabulary is pinned in 00-foundation.md §6a and owned by
// 03-auth-and-permissions.md. This spec's earlier `document:read` / `shares:manage`
// spelling is gone: three vocabularies for one enum meant the highest-value test file in
// the repo did not compile against the module it tests.
export const CAPABILITIES = [
  'read',
  'update',
  'rename',
  'delete',
  'viewShares',
  'manageShares',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** Pure, synchronous, no I/O. The only permission predicate in the codebase. */
export function can(role: AccessRole, capability: Capability): boolean;

/** DB-backed. Integration-tested, not unit-tested. Returns { role, document }. */
export function resolveAccess(userId: string, documentId: string): Promise<ResolvedAccess>;
```

`NONE` is a real member of `ROLES` with an all-`false` matrix row, which is the only reason the
24-cell table below can exist: `can('NONE', c)` has to be a callable expression.

### 3.2 The matrix (24 cases — transcribed from foundation §6)

| Capability | OWNER | EDITOR | VIEWER | NONE |
|---|:--:|:--:|:--:|:--:|
| `read` | ✅ | ✅ | ✅ | ❌ |
| `update` | ✅ | ✅ | ❌ | ❌ |
| `rename` | ✅ | ✅ | ❌ | ❌ |
| `delete` | ✅ | ❌ | ❌ | ❌ |
| `viewShares` | ✅ | ❌ | ❌ | ❌ |
| `manageShares` | ✅ | ❌ | ❌ | ❌ |

### 3.3 The test file (complete)

```ts
// lib/permissions.test.ts
import { describe, expect, it } from 'vitest';
import { can, CAPABILITIES, ROLES, type AccessRole, type Capability } from './permissions';

/**
 * One row per cell of foundation §6. If this table and 00-foundation.md ever
 * disagree, the foundation wins and this table is the bug.
 */
const MATRIX: ReadonlyArray<[AccessRole, Capability, boolean]> = [
  // read: everyone with any grant can read; NONE cannot.
  ['OWNER',  'read',            true ],
  ['EDITOR', 'read',            true ],
  ['VIEWER', 'read',            true ],
  ['NONE',   'read',            false],
  // update content: owner + editor.
  ['OWNER',  'update',          true ],
  ['EDITOR', 'update',          true ],
  ['VIEWER', 'update',          false],
  ['NONE',   'update',          false],
  // rename: same as update — the title is content.
  ['OWNER',  'rename',          true ],
  ['EDITOR', 'rename',          true ],
  ['VIEWER', 'rename',          false],
  ['NONE',   'rename',          false],
  // delete: owner only.
  ['OWNER',  'delete',          true ],
  ['EDITOR', 'delete',          false],
  ['VIEWER', 'delete',          false],
  ['NONE',   'delete',          false],
  // see who a document is shared with: owner only.
  ['OWNER',  'viewShares',      true ],
  ['EDITOR', 'viewShares',      false],
  ['VIEWER', 'viewShares',      false],
  ['NONE',   'viewShares',      false],
  // grant / change / revoke: owner only. An EDITOR cannot re-share.
  ['OWNER',  'manageShares',    true ],
  ['EDITOR', 'manageShares',    false],
  ['VIEWER', 'manageShares',    false],
  ['NONE',   'manageShares',    false],
];

describe('can(role, capability)', () => {
  it.each(MATRIX)('%s %s -> %s', (role, capability, expected) => {
    expect(can(role, capability)).toBe(expected);
  });

  it('covers every role x capability pair exactly once', () => {
    // Guard rail: adding a capability to lib/permissions.ts without adding its
    // four rows here fails immediately instead of shipping untested.
    expect(MATRIX).toHaveLength(ROLES.length * CAPABILITIES.length);
    const seen = new Set(MATRIX.map(([r, c]) => `${r}|${c}`));
    expect(seen.size).toBe(MATRIX.length);
    for (const role of ROLES) {
      for (const capability of CAPABILITIES) {
        expect(seen.has(`${role}|${capability}`)).toBe(true);
      }
    }
  });

  it('grants NONE nothing at all', () => {
    // Stated separately because it is the rule with the worst blast radius.
    expect(CAPABILITIES.filter((c) => can('NONE', c))).toEqual([]);
  });

  it('never lets a non-OWNER manage shares', () => {
    expect(ROLES.filter((r) => can(r, 'manageShares'))).toEqual(['OWNER']);
  });
});
```

The last two assertions are not redundant with the matrix: they are *properties*, so they keep holding
when a capability is added, whereas the matrix rows only cover what was enumerated.

---

## 4. Unit suite — import helpers

Three pure modules, three test files, all in the `unit` project. Owned by the import spec; this section
pins their signatures because the tests bind to them.

### 4.1 Title derivation — `lib/import/title.ts` → `lib/import/title.test.ts`

```ts
export const MAX_TITLE_LENGTH = 120;
export const FALLBACK_TITLE = 'Untitled document';   // matches Prisma's @default

/** Filename -> document title. Pure. Never throws. */
export function titleFromFilename(filename: string): string;
```

**Names come from `05-import-spec.md` §8**, which owns the module. This spec previously called them
`deriveTitle` / `DEFAULT_TITLE`; a test file importing symbols the module does not export is an
import error that reds the whole unit project, not a failing assertion.

Algorithm, in order: take the POSIX/Win32 basename → strip **one** trailing extension **only if** it is
in the import allowlist (case-insensitive) → replace control characters and collapse whitespace → trim →
truncate to `MAX_TITLE_LENGTH` → if the result is empty, return `FALLBACK_TITLE`.

Stripping only allowlisted extensions is what makes `a.b.c.md` behave: we remove `.md`, not `.c`.

| # | Input | Expected | Why it is in the table |
|---|---|---|---|
| 1 | `"notes.md"` | `"notes"` | happy path |
| 2 | `"Q3 Report (final).docx"` | `"Q3 Report (final)"` | spaces and punctuation survive |
| 3 | `"a.b.c.md"` | `"a.b.c"` | strip the **last** extension only |
| 4 | `"archive.tar.md"` | `"archive.tar"` | same rule, non-adversarial phrasing |
| 5 | `"README"` | `"README"` | no extension at all |
| 6 | `".gitignore"` | `".gitignore"` | leading dot is not an extension |
| 7 | `"notes.MD"` | `"notes"` | extension match is case-insensitive |
| 8 | `"notes.exe"` | `"notes.exe"` | non-allowlisted ext is *not* stripped (this file never reaches here anyway — §4.2 rejects it — but the function must not lie) |
| 9 | `""` | `FALLBACK_TITLE` | empty filename |
| 10 | `"   "` | `"Untitled document"` | whitespace-only |
| 11 | `".md"` | `"Untitled document"` | extension only, nothing left |
| 12 | `"../../etc/passwd.md"` | `"passwd"` | basename only; a filename is attacker-controlled text |
| 13 | `"C:\\Users\\bob\\plan.docx"` | `"plan"` | Windows separators |
| 14 | `"x".repeat(400) + ".md"` | 120 × `"x"` | length cap |
| 15 | `"my\nnotes\t.md"` | `"my notes"` | control chars collapsed, then trimmed |
| 16 | `"relatório-2026 ✅.md"` | `"relatório-2026 ✅"` | unicode and emoji preserved |

```ts
// lib/import/title.test.ts (shape)
import { describe, expect, it } from 'vitest';
import { titleFromFilename, FALLBACK_TITLE, MAX_TITLE_LENGTH } from './title';

describe('titleFromFilename', () => {
  it.each([
    ['notes.md', 'notes'],
    ['Q3 Report (final).docx', 'Q3 Report (final)'],
    ['a.b.c.md', 'a.b.c'],
    ['archive.tar.md', 'archive.tar'],
    ['README', 'README'],
    ['.gitignore', '.gitignore'],
    ['notes.MD', 'notes'],
    ['notes.exe', 'notes.exe'],
    ['', FALLBACK_TITLE],
    ['   ', FALLBACK_TITLE],
    ['.md', FALLBACK_TITLE],
    ['../../etc/passwd.md', 'passwd'],
    ['C:\\Users\\bob\\plan.docx', 'plan'],
    ['my\nnotes\t.md', 'my notes'],
    ['relatório-2026 ✅.md', 'relatório-2026 ✅'],
  ])('titleFromFilename(%j) -> %j', (input, expected) => {
    expect(titleFromFilename(input)).toBe(expected);
  });

  it('caps very long names at MAX_TITLE_LENGTH', () => {
    const title = titleFromFilename(`${'x'.repeat(400)}.md`);
    expect(title).toHaveLength(MAX_TITLE_LENGTH);
    expect(title).toBe('x'.repeat(MAX_TITLE_LENGTH));
  });

  it('never returns an empty string for any input', () => {
    for (const junk of ['', ' ', '.', '..', '.md', '\u0000', '/', '\\']) {
      expect(titleFromFilename(junk).length).toBeGreaterThan(0);
    }
  });
});
```

### 4.2 Extension / MIME allowlist — `lib/import/validate.ts` → `lib/import/validate.test.ts`

```ts
// The constant lives in lib/import/constants.ts (05-import-spec.md §2.3) and is imported,
// never redeclared: MAX_FILE_BYTES, one name, one value, one module (00-foundation.md §7b).
import { MAX_FILE_BYTES } from '@/lib/import/constants';

export type ImportKind = 'md' | 'txt' | 'docx';

export type FileCheck =
  | { ok: true; kind: ImportKind }
  | {
      ok: false;
      // Codes and statuses from the ONE registry (00-foundation.md §7a).
      code: 'UNSUPPORTED_FILE_TYPE' | 'FILE_TOO_LARGE' | 'FILE_MISSING';
      status: 415 | 413 | 400;
      message: string;
    };

export function checkImportFile(input: {
  filename: string;
  mimeType: string; // '' when the browser sends none
  size: number;     // bytes
}): FileCheck;
```

**Policy: the extension is authoritative, the MIME type is corroborating.** Browsers send
`text/plain`, `text/markdown` or `application/octet-stream` for the same `.md` file depending on OS and
browser, so enforcing MIME strictly rejects legitimate uploads. We therefore accept when the extension
is allowlisted **and** the MIME is either empty, generic, or one of that extension's known types; we
reject a positively-wrong MIME (a `.docx` announced as `image/png` is not a document we want to parse).

| Extension | Accepted MIME types (plus `''`, `application/octet-stream`) | `kind` |
|---|---|---|
| `.md` | `text/markdown`, `text/x-markdown`, `text/plain` | `md` |
| `.txt` | `text/plain` | `txt` |
| `.docx` | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | `docx` |

Evaluation order is fixed and tested: **extension → MIME → empty → size.** A `.exe` that is also over
the cap reports `UNSUPPORTED_FILE_TYPE`, never `FILE_TOO_LARGE`; leaking "your executable was too big"
would imply we would have accepted a smaller one.

| # | filename | mimeType | size | Expected |
|---|---|---|---|---|
| 1 | `notes.md` | `text/markdown` | 1 024 | `{ ok: true, kind: 'md' }` |
| 2 | `notes.md` | `''` | 1 024 | `{ ok: true, kind: 'md' }` (no MIME from browser) |
| 3 | `notes.md` | `application/octet-stream` | 1 024 | `{ ok: true, kind: 'md' }` (generic) |
| 4 | `notes.MD` | `text/plain` | 1 024 | `{ ok: true, kind: 'md' }` (case-insensitive) |
| 5 | `notes.markdown` | `text/markdown` | 1 024 | `UNSUPPORTED_FILE_TYPE` — `.markdown` is deliberately **not** accepted (`05-import-spec.md` §2.1 rule 1): the advertised copy says `.md`, and an accepted-but-unadvertised extension is drift |
| 6 | `notes.txt` | `text/plain` | 1 024 | `{ ok: true, kind: 'txt' }` |
| 7 | `plan.docx` | `application/vnd.openxml…wordprocessingml.document` | 50 000 | `{ ok: true, kind: 'docx' }` |
| 8 | `malware.exe` | `application/x-msdownload` | 10 | `UNSUPPORTED_FILE_TYPE` / **415** |
| 9 | `photo.png` | `image/png` | 10 | `UNSUPPORTED_FILE_TYPE` |
| 10 | `legacy.doc` | `application/msword` | 10 | `UNSUPPORTED_FILE_TYPE` (`.doc` ≠ `.docx`) |
| 11 | `notes.pdf` | `application/pdf` | 10 | `UNSUPPORTED_FILE_TYPE` |
| 12 | `README` | `text/plain` | 10 | `UNSUPPORTED_FILE_TYPE` (no extension) |
| 13 | `evil.md.exe` | `text/markdown` | 10 | `UNSUPPORTED_FILE_TYPE` (last extension wins) |
| 14 | `plan.docx` | `image/png` | 10 | `UNSUPPORTED_FILE_TYPE` (positively-wrong MIME) |
| 15 | `notes.md` | `text/markdown` | `MAX_FILE_BYTES` | `{ ok: true, kind: 'md' }` (boundary, inclusive) |
| 16 | `notes.md` | `text/markdown` | `MAX_FILE_BYTES + 1` | `FILE_TOO_LARGE` / **413** |
| 17 | `notes.md` | `text/markdown` | `0` | `FILE_MISSING` / **400** |
| 18 | `malware.exe` | `application/x-msdownload` | `MAX_FILE_BYTES + 1` | `UNSUPPORTED_FILE_TYPE` / **415** (order) |

The size cap is asserted **relative to the exported constant**, never against a hard-coded `2097152`, so
changing the cap in one place does not break the suite.

### 4.3 Content shape-guard — `lib/documents/content.ts` → `lib/documents/content.test.ts`

`Document.content` is `Json` (foundation §5) and arrives from the client on every `PATCH`. Without a
guard, a client can store arbitrary JSON — including something that makes the editor unopenable on
the next load, which is visible data loss.

**The guard is the ten-line root-shape check from `01-data-and-persistence.md` §5.** This spec
previously specified a recursive `z.lazy` node schema with a `MAX_CONTENT_DEPTH` and twelve test
rows — approximately the hour `01` §5.2 spends five numbered paragraphs explaining why *not* to
spend. That was cut, and the reasoning is worth keeping because it is the same reasoning a reviewer
will apply: the authoritative schema for a document already exists in the TipTap extension list, a
Zod copy of it is a second source of truth, and the failure mode of drift is "valid documents
rejected in production" — worse than the problem being solved. ProseMirror validates on load anyway,
and `enableContentCheck: true` (`04-ui-spec.md` §6.3) turns a mismatch into a visible error rather
than a white screen.

```ts
// lib/documents/content.ts  (owned by 01-data-and-persistence.md §5)
export const MAX_CONTENT_BYTES = 1_000_000;   // 1 MB — the name and the value, both canonical

export const documentContentSchema = z.looseObject({
  type: z.literal('doc'),
  content: z.array(z.looseObject({ type: z.string().min(1) })).max(10_000),
});

export const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };
export function contentByteSize(value: unknown): number;      // Buffer.byteLength, utf8
export function toDocumentContent(value: Prisma.JsonValue): DocumentContent;  // read-path fallback
```

Note `contentByteSize` uses `Buffer.byteLength(JSON.stringify(v), 'utf8')`, not
`JSON.stringify(v).length` — the two differ on any non-ASCII document, and bytes are what the column
and the request body actually cost.

| # | Input | Expect |
|---|---|---|
| 1 | `EMPTY_DOC` | parses |
| 2 | a realistic doc: `doc > [heading(level 1) > text, bulletList > listItem > paragraph > text(marks:[bold, italic, underline])]` | parses |
| 3 | `{ type: 'paragraph', content: [] }` | fails — root is not `doc` |
| 4 | `{ content: [] }` | fails — missing `type` |
| 5 | `null`, `[]`, `'doc'`, `7`, `{}` | fails — not a doc node. These five are the realistic bad writes (a client bug, a bad import, a hand edit in Studio), and each of them makes the editor unopenable. |
| 6 | `{ type: 'doc', content: [{ type: '' }] }` | fails — a child with an empty `type` |
| 7 | `{ type: 'doc', content: [{ type: 'unknownFromTheFuture' }] }` | **parses** — we guard shape, not vocabulary |
| 8 | `toDocumentContent(<any of row 5>)` | returns `EMPTY_DOC` rather than throwing — the read path must never white-screen on a bad row |
| 9 | `contentByteSize` of a doc with a 2 MB text node `> MAX_CONTENT_BYTES` | the **route** returns `413 CONTENT_TOO_LARGE` (integration; the size check is a handler step, not a schema issue — `02-api-contract.md` §7.8) |

Row 7 is a deliberate assertion of the policy, not an oversight: a strict node-type allowlist would
break the moment a TipTap extension is added, and TipTap itself discards unknown nodes on load.
Recorded in `ARCHITECTURE.md`.

**Deleted from this section, on purpose:** `MAX_CONTENT_DEPTH`, the `depthOf()` walk, the 60-deep
rejection case and the 49-deep boundary case. There is no depth bound anywhere in the product;
`MAX_CONTENT_BYTES` bounds the only thing that needs bounding. A test asserting a limit the
implementation does not have is worse than no test.

---

## 5. Integration suite — route handlers against a real Postgres

### 5.1 Approach

Next.js 16 Route Handlers are exported async functions taking `(request: Request, ctx)`. We import them
directly and call them — no dev server, no HTTP listener, no `supertest`. That gives us real Prisma, real
Zod, real session verification, and real status codes, in ~4 seconds, with zero port management.

```ts
import { PATCH } from '@/app/api/documents/[id]/route';
const res = await PATCH(req, { params: Promise.resolve({ id: 'd1' }) });
```

Two facts about Next 16 (unchanged from 15) this depends on, both worth knowing before writing the first test:

1. **`params` is a `Promise`.** The second argument is `{ params: Promise<{ id: string }> }`. Tests use
   the `ctx()` helper in §5.5 so this detail lives in one place.
2. **Route handlers must not import `next/headers`.** `cookies()` throws outside a request scope, which
   would make every handler untestable. Handlers therefore read the session from
   `request.headers.get('cookie')` via `getSessionFromRequest(request)` and write cookies through
   `NextResponse.cookies.set()` on the response they return. `cookies()` is used only in Server
   Components. **This is now accepted, not proposed:** `03-auth-and-permissions.md` §3.2 exports
   `getSessionFromRequest`, `02-api-contract.md` §4's `withSession` calls it, and
   `00-foundation.md` §7c pins it. Without that ruling this entire suite is impossible, and the
   degradation ladder in §8 would have been taken at hour 0.

### 5.2 `docker-compose.test.yml` (repo root)

```yaml
# docker-compose.test.yml — throwaway Postgres for `pnpm test:integration`.
# Port 55432 (not 5432) so it cannot collide with a Postgres already running
# on the reviewer's machine, and cannot be mistaken for a real database.
services:
  postgres-test:
    image: postgres:16-alpine
    container_name: shared-docs-postgres-test
    environment:
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
      POSTGRES_DB: shared_docs_test
    ports:
      - '55432:5432'
    volumes:
      # Adds shared_docs_dev beside shared_docs_test, so local development and the test
      # suite share ONE container and there is only one compose file in the README.
      # Owned by 01-data-and-persistence.md §6.1.
      - ./.docker/initdb:/docker-entrypoint-initdb.d:ro
    tmpfs:
      - /var/lib/postgresql/data   # RAM-backed: faster, and nothing to clean up
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U test -d shared_docs_test']
      interval: 1s
      timeout: 3s
      retries: 30
```

`tmpfs` for the data directory means the database is destroyed with the container — there is no stale
volume to explain in the README, and `docker compose down` is a complete cleanup. `--wait` in
`db:test:up` blocks on the healthcheck, so the schema push never races the server's first boot.

**This is the only compose file in the repo.** An earlier draft of `01-data-and-persistence.md`
specified a second file with the same name on port 5433 with a named volume and user `shared_docs`;
whichever agent wrote it second would have silently broken the other, and `global-setup.ts`'s safety
rail (below) would then refuse to run the suite at all. `01` now contributes only the initdb script.
The dev database URL is `postgresql://test:test@localhost:55432/shared_docs_dev`.

### 5.3 Global setup — `tests/integration/global-setup.ts`

Runs once per `vitest run`: pushes the Prisma schema into the empty container.

```ts
// tests/integration/global-setup.ts
import { execSync } from 'node:child_process';

export default function setup() {
  const url = process.env.TEST_DATABASE_URL;

  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL is not set. Copy .env.test or run `pnpm db:test:up`.',
    );
  }
  // Safety rail: this setup TRUNCATEs on every test. Refuse to point at
  // anything that is not the disposable test database.
  if (!url.includes('shared_docs_test') || !url.includes(':55432/')) {
    throw new Error(
      `Refusing to run integration tests against ${url} — expected the ` +
        'shared_docs_test database on port 55432.',
    );
  }

  // `db push` rather than `migrate deploy`: faster, and the test DB has no
  // history worth preserving. --accept-data-loss keeps it non-interactive.
  execSync('pnpm exec prisma db push --skip-generate --accept-data-loss', {
    stdio: 'inherit',
    // DIRECT_URL too: schema.prisma declares `directUrl`, and Prisma validates every
    // referenced env var at CLI startup — otherwise this dies with
    // "Environment variable not found: DIRECT_URL" and looks like a connection problem.
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
  });
}
```

The port/name assertion is the most important five lines in the file. A truncating test suite pointed at
a developer's real database is the classic way to lose an afternoon.

### 5.4 Per-test reset and fixtures

```ts
// tests/integration/setup.ts  (vitest `setupFiles`)
import { afterAll, beforeEach } from 'vitest';
import { prisma } from '@/lib/db';
import { seedFixtures } from './fixtures';

beforeEach(async () => {
  // Single statement, CASCADE, RESTART IDENTITY: deterministic and ~2ms.
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "DocumentShare", "Document", "User" RESTART IDENTITY CASCADE',
  );
  await seedFixtures();
});

afterAll(async () => {
  await prisma.$disconnect();
});
```

```ts
// tests/integration/fixtures.ts
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { EMPTY_DOC } from '@/lib/documents/content';

// cost 4, not the production 10: fixtures are re-hashed on every test file.
// Hashed once at module load, reused for all three users.
const PASSWORD = 'demo1234';
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);

export const USERS = {
  alice: { id: 'u_alice', email: 'alice@example.com', name: 'Alice' },
  bob:   { id: 'u_bob',   email: 'bob@example.com',   name: 'Bob'   },
  carol: { id: 'u_carol', email: 'carol@example.com', name: 'Carol' },
} as const;

export const DOCS = {
  d1: 'd1', // alice owns; bob EDITOR, carol VIEWER
  d2: 'd2', // alice owns; shared with nobody  <- the 404 case
  d3: 'd3', // bob owns
} as const;

export async function seedFixtures() {
  await prisma.user.createMany({
    data: Object.values(USERS).map((u) => ({ ...u, passwordHash: PASSWORD_HASH })),
  });

  await prisma.document.createMany({
    data: [
      { id: DOCS.d1, title: 'Alice shared doc',  content: EMPTY_DOC, ownerId: USERS.alice.id },
      { id: DOCS.d2, title: 'Alice private doc', content: EMPTY_DOC, ownerId: USERS.alice.id },
      { id: DOCS.d3, title: 'Bob own doc',       content: EMPTY_DOC, ownerId: USERS.bob.id   },
    ],
  });

  await prisma.documentShare.createMany({
    data: [
      { documentId: DOCS.d1, userId: USERS.bob.id,   role: 'EDITOR', grantedById: USERS.alice.id },
      { documentId: DOCS.d1, userId: USERS.carol.id, role: 'VIEWER', grantedById: USERS.alice.id },
    ],
  });
}

/** Current updatedAt, for building fresh/stale optimistic-concurrency tokens. */
export async function updatedAtOf(documentId: string): Promise<string> {
  const doc = await prisma.document.findUniqueOrThrow({
    where: { id: documentId },
    select: { updatedAt: true },
  });
  return doc.updatedAt.toISOString();
}
```

**These are test fixtures, not the demo seed, and that is deliberate.** `prisma/seed.ts`
(`01-data-and-persistence.md` §7) builds five documents with rich content so a reviewer can click
every access level in ten seconds; this graph is the smallest one that makes every access level
*assertable* under a `TRUNCATE`-per-test loop that has to stay around 2 ms. Neither is a good
substitute for the other. What must never diverge is the access model they both encode — and that
lives in exactly one place, `lib/permissions.ts`. `01` §7.3's matrix is verified by its own DoD query
and by the manual QA run in §9, not by this suite.

The fixture graph, restated: **alice owns d1** (shared to **bob as `EDITOR`** and **carol as `VIEWER`**),
**alice owns d2** (shared with nobody — this is what makes the 404-not-403 case demonstrable), **bob owns
d3** (this is what makes `owned` vs `sharedWithMe` distinguishable in the list response). Fixed string ids
rather than cuids so assertions read as prose.

### 5.5 Authenticated request helper — `tests/integration/helpers/request.ts`

```ts
// tests/integration/helpers/request.ts
// 03-auth-and-permissions.md §3.2 owns these. Module path and both symbol names are its,
// not ours: `lib/session-token.ts`, `SESSION_COOKIE`, `signSessionToken(user)`.
import { SESSION_COOKIE, signSessionToken, type SessionUser } from '@/lib/session-token';

const BASE_URL = 'http://localhost:3000';

type Init = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  json?: unknown;
  formData?: FormData;
  /** Sign the cookie with the wrong secret, to test tampering. */
  badSignature?: boolean;
};

/**
 * Builds a Request the way the browser would, with a real signed session
 * cookie. Deliberately calls the production `signSessionToken` rather than
 * re-implementing JWT signing: if the token shape changes, these tests fail
 * loudly instead of passing against a fiction.
 *
 * Pass `null` for the unauthenticated case (no cookie header at all).
 */
export async function authedRequest(
  user: SessionUser | null,
  path: string,
  init: Init = {},
): Promise<Request> {
  const headers = new Headers();

  if (user) {
    // signSessionToken takes the whole SessionUser — the token carries `sub`, `email`
    // and `name`, and verifySessionToken rejects a payload missing any of them. Callers
    // pass a USERS fixture entry, e.g. authedRequest(USERS.carol, …).
    const token = init.badSignature
      ? `${await signSessionToken(user)}tampered`
      : await signSessionToken(user);
    headers.set('cookie', `${SESSION_COOKIE}=${token}`);
  }

  let body: BodyInit | undefined;
  if (init.formData) {
    // Do NOT set content-type here — undici derives the multipart boundary.
    body = init.formData;
  } else if (init.json !== undefined) {
    body = JSON.stringify(init.json);
    headers.set('content-type', 'application/json');
  }

  return new Request(`${BASE_URL}${path}`, {
    method: init.method ?? 'GET',
    headers,
    body,
  });
}

/** Next 15+ route-handler context: `params` is a Promise. */
export function ctx<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) };
}

/** Multipart body for the import route. */
export function fileForm(filename: string, mimeType: string, bytes: Uint8Array | string): FormData {
  const form = new FormData();
  form.append('file', new File([bytes], filename, { type: mimeType }));
  return form;
}

/** Reads the JSON body once and returns it with the status, for compact asserts. */
export async function read<T = any>(res: Response): Promise<{ status: number; body: T }> {
  return { status: res.status, body: (await res.json()) as T };
}
```

### 5.6 Error envelope and codes asserted

Foundation §7 fixes the envelope `{ error: { code, message, details? } }`. This suite asserts on `code`,
never on `message` (messages are UI copy and will be reworded).

The registry is `00-foundation.md` §7a; this table is the subset this suite asserts on, with the
statuses **as the registry defines them**. Two rows here were wrong and would have failed two P0
cases against a correct implementation: the import statuses are `415` and `413`, not `400`.

| Code | HTTP | Meaning |
|---|---|---|
| `UNAUTHENTICATED` | 401 | no cookie, or an invalid / expired token |
| `FORBIDDEN` | 403 | you can see it, but not do *that* |
| `NOT_FOUND` | 404 | it does not exist — **or** you have no access at all |
| `VALIDATION_FAILED` | 400 | Zod rejected the body (**not** `VALIDATION_ERROR`) |
| `CONFLICT` | 409 | stale `lastKnownUpdatedAt` |
| `CANNOT_SHARE_WITH_SELF` | 400 | owner tried to share with their own email |
| `USER_NOT_FOUND` | 404 | share recipient email is not a seeded user |
| `SHARE_NOT_FOUND` | 404 | `PATCH` of a share row that does not exist (`DELETE` is idempotent and never emits it) |
| `UNSUPPORTED_FILE_TYPE` | **415** | import extension/MIME not allowlisted |
| `FILE_TOO_LARGE` | **413** | import over `MAX_FILE_BYTES` |
| `FILE_MISSING` | 400 | no `file` part, or a 0-byte file |
| `PARSE_FAILED` | 422 | accepted but unparseable; `details.reason` discriminates |
| `CONTENT_TOO_LARGE` | 413 | `PATCH` body — or an import result — over `MAX_CONTENT_BYTES` |

### 5.7 The integration cases

Files: `tests/integration/documents.test.ts`, `shares.test.ts`, `import.test.ts`, `auth.test.ts`.
Priority column: **P0** ships or the slice is not done; **P1** is added only if the harness lands under
budget.

| # | Request | Actor | Expect | Also assert | P |
|---|---|---|---|---|:--:|
| 1 | `GET /api/documents/d1` | alice | `200` | `myRole === 'OWNER'`, `shares.length === 2` | P0 |
| 2 | `GET /api/documents/d1` | carol | `200` | `myRole === 'VIEWER'`, **`shares` is `null`** — not `undefined`, not `[]`. A viewer must be able to tell "not allowed to see this" from "there are none" (`02-api-contract.md` §7.7), and `JSON.stringify({shares:null})` round-trips as `null`, so `toBeUndefined()` fails against a correct implementation | P0 |
| 3 | **`GET /api/documents/d2`** | **carol** | **`404` `NOT_FOUND`** | **not `403`** — no-access must not confirm existence (foundation §6 rule 1) | **P0** |
| 4 | **`PATCH /api/documents/d1`** | **carol** | **`403` `FORBIDDEN`** | row's `content` and `updatedAt` unchanged in the DB | **P0** |
| 5 | **`PATCH /api/documents/d1`** with fresh token | **bob** | **`200`** | persisted `content` matches; response `updatedAt` > fixture `updatedAt` | **P0** |
| 6 | **`PATCH /api/documents/d1`** with `lastKnownUpdatedAt` one hour in the past | **alice** | **`409` `CONFLICT`** | row unchanged; body carries the server's current `updatedAt` in `details.currentUpdatedAt`, which is what the inline conflict banner's **Reload** re-seeds from (foundation §7, risk R4) | **P0** |
| 7 | `PATCH /api/documents/d1` with `content: { type: 'paragraph' }` | alice | `400` `VALIDATION_FAILED` | shape guard (§4.3) is wired into the route, not just unit-tested | P1 |
| 8 | `DELETE /api/documents/d1` | bob | `403` `FORBIDDEN` | document still exists — EDITOR ≠ owner | P1 |
| 9 | **`POST /api/documents/d1/shares`** `{email: carol, role: VIEWER}` | **bob** | **`403` `FORBIDDEN`** | an EDITOR cannot re-share; share count still 2 | **P0** |
| 10 | **`POST /api/documents/d1/shares`** `{email: carol, role: EDITOR}` | **alice** | **`200`** | share count **still 2, not 3**; carol's role is now `EDITOR` — upsert, not insert (foundation §6 rule 4) | **P0** |
| 11 | **`POST /api/documents/d1/shares`** `{email: alice, role: EDITOR}` | **alice** | **`400` `CANNOT_SHARE_WITH_SELF`** | share count unchanged | **P0** |
| 12 | `POST /api/documents/d1/shares` `{email: nobody@example.com}` | alice | `404` `USER_NOT_FOUND` | no share row created | P1 |
| 13 | `POST /api/documents/d2/shares` `{email: bob, role: VIEWER}` | alice | **`200`** | `body.created === true`. The endpoint returns one status for one operation and signals insert-vs-update in the body (`02-api-contract.md` §7.10, `03-auth-and-permissions.md` §9.3). There is no `201` on this route — this row previously contradicted case 10 as well as both siblings. | P1 |
| 14 | **`GET /api/documents`** | **bob** | **`200`** | `owned` = `[d3]`; `sharedWithMe` = `[d1]` with `myRole === 'EDITOR'`; **`d2` appears in neither array** | **P0** |
| 15 | `POST /api/documents/import` with `notes.md`, `text/markdown` | alice | `201` | document row exists, `title === 'notes'`, `sourceFilename === 'notes.md'`, `content.type === 'doc'`, `ownerId === alice` | P0 |
| 16 | **`POST /api/documents/import`** with `malware.exe`, `application/x-msdownload` | **alice** | **`415` `UNSUPPORTED_FILE_TYPE`** | no document row created | **P0** |
| 17 | **`POST /api/documents/import`** with `notes.md` of `MAX_FILE_BYTES + 1` bytes | **alice** | **`413` `FILE_TOO_LARGE`** | no document row created; body built from the exported constant, never a literal | **P0** |
| 18 | **`GET /api/documents/d1`** with **no cookie** | — | **`401` `UNAUTHENTICATED`** | — | **P0** |
| 19 | **`GET /api/documents`**, **`PATCH /api/documents/d1`**, **`POST /api/documents/d1/shares`**, **`POST /api/documents/import`** with no cookie | — | **`401` each** | table-driven over the four handlers: no route is accidentally public | **P0** |
| 20 | `GET /api/documents/d1` with a tampered cookie (`badSignature: true`) | — | `401` `UNAUTHENTICATED` | a forged session is not a session | P1 |
| 21 | `DELETE /api/documents/d1/shares/u_carol` **twice** | alice | `200` **both times** | idempotent revoke (`02-api-contract.md` §7.11) — the second call is not a `404` | P1 |
| 22 | `POST /api/auth/logout` with **no cookie** | — | `200` | logout is public and idempotent (`00-foundation.md` §7) | P1 |

Case 19 is the one that catches the mistake most likely to actually happen at hour six: adding a route
and forgetting the auth guard.

**Case 6 is the only conflict case, deliberately (D002).** The suite asserts that the guard *fires* —
a stale token never writes, and the client is handed the current one — and stops there. Recovery is a
single **Reload** button in an inline banner: no dialog, no "copy my text" clipboard path, and no
request-merging queue, so there is nothing on the recovery side left to cover at this level. The
second, recovery-side integration case is struck; it is not in the table above and **must not be added
back** — the reduced conflict system is a ~30-minute slice, and a second case is how it grows back
into the 1h15 D002 declined to spend. What a reviewer sees of recovery is manual QA step 20 (§9).

### 5.8 Representative test file

```ts
// tests/integration/documents.test.ts
import { describe, expect, it } from 'vitest';
import { GET as getDocument, PATCH as patchDocument } from '@/app/api/documents/[id]/route';
import { GET as listDocuments } from '@/app/api/documents/route';
import { prisma } from '@/lib/db';
import { DOCS, USERS, updatedAtOf } from './fixtures';
import { authedRequest, ctx, read } from './helpers/request';

describe('GET /api/documents/:id', () => {
  it('404s (not 403) for a user with no access at all', async () => {
    const req = await authedRequest(USERS.carol, `/api/documents/${DOCS.d2}`);
    const { status, body } = await read(await getDocument(req, ctx({ id: DOCS.d2 })));

    expect(status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
    // The point of the test: 403 would confirm d2 exists.
    expect(status).not.toBe(403);
  });

  it('hides the share list from a viewer', async () => {
    const req = await authedRequest(USERS.carol, `/api/documents/${DOCS.d1}`);
    const { status, body } = await read(await getDocument(req, ctx({ id: DOCS.d1 })));

    expect(status).toBe(200);
    expect(body.myRole).toBe('VIEWER');
    expect(body.shares).toBeNull();
  });

  it('401s with no session cookie', async () => {
    const req = await authedRequest(null, `/api/documents/${DOCS.d1}`);
    const { status, body } = await read(await getDocument(req, ctx({ id: DOCS.d1 })));

    expect(status).toBe(401);
    expect(body.error.code).toBe('UNAUTHENTICATED');
  });
});

describe('PATCH /api/documents/:id', () => {
  const NEW_CONTENT = {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'edited by the test' }] }],
  };

  it('403s for a VIEWER and leaves the row untouched', async () => {
    const before = await prisma.document.findUniqueOrThrow({ where: { id: DOCS.d1 } });

    const req = await authedRequest(USERS.carol.id, `/api/documents/${DOCS.d1}`, {
      method: 'PATCH',
      json: { content: NEW_CONTENT, lastKnownUpdatedAt: before.updatedAt.toISOString() },
    });
    const { status, body } = await read(await patchDocument(req, ctx({ id: DOCS.d1 })));

    expect(status).toBe(403);
    expect(body.error.code).toBe('FORBIDDEN');

    const after = await prisma.document.findUniqueOrThrow({ where: { id: DOCS.d1 } });
    expect(after.content).toEqual(before.content);
    expect(after.updatedAt).toEqual(before.updatedAt);
  });

  it('200s for an EDITOR and persists the content', async () => {
    const req = await authedRequest(USERS.bob, `/api/documents/${DOCS.d1}`, {
      method: 'PATCH',
      json: { content: NEW_CONTENT, lastKnownUpdatedAt: await updatedAtOf(DOCS.d1) },
    });
    const { status, body } = await read(await patchDocument(req, ctx({ id: DOCS.d1 })));

    expect(status).toBe(200);
    const after = await prisma.document.findUniqueOrThrow({ where: { id: DOCS.d1 } });
    expect(after.content).toEqual(NEW_CONTENT);
    expect(body.updatedAt).toBe(after.updatedAt.toISOString());
  });

  it('409s on a stale lastKnownUpdatedAt, even for the owner', async () => {
    const before = await prisma.document.findUniqueOrThrow({ where: { id: DOCS.d1 } });
    const stale = new Date(before.updatedAt.getTime() - 3_600_000).toISOString();

    const req = await authedRequest(USERS.alice, `/api/documents/${DOCS.d1}`, {
      method: 'PATCH',
      json: { content: NEW_CONTENT, lastKnownUpdatedAt: stale },
    });
    const { status, body } = await read(await patchDocument(req, ctx({ id: DOCS.d1 })));

    expect(status).toBe(409);
    expect(body.error.code).toBe('CONFLICT');
    // The inline conflict banner's Reload re-seeds the editor from this token.
    expect(body.error.details.currentUpdatedAt).toBe(before.updatedAt.toISOString());

    const after = await prisma.document.findUniqueOrThrow({ where: { id: DOCS.d1 } });
    expect(after.content).toEqual(before.content);
  });
});

describe('GET /api/documents', () => {
  it("separates bob's owned documents from those shared with him", async () => {
    const req = await authedRequest(USERS.bob, '/api/documents');
    const { status, body } = await read(await listDocuments(req));

    expect(status).toBe(200);
    expect(body.owned.map((d: any) => d.id)).toEqual([DOCS.d3]);
    expect(body.sharedWithMe.map((d: any) => d.id)).toEqual([DOCS.d1]);
    expect(body.sharedWithMe[0].myRole).toBe('EDITOR');

    const allIds = [...body.owned, ...body.sharedWithMe].map((d: any) => d.id);
    expect(allIds).not.toContain(DOCS.d2); // alice's private doc must not leak
  });
});
```

```ts
// tests/integration/import.test.ts (the two rejection cases)
import { describe, expect, it } from 'vitest';
import { POST as importDocument } from '@/app/api/documents/import/route';
import { MAX_FILE_BYTES } from '@/lib/import/constants';
import { prisma } from '@/lib/db';
import { USERS } from './fixtures';
import { authedRequest, fileForm, read } from './helpers/request';

describe('POST /api/documents/import', () => {
  it('rejects a non-allowlisted extension', async () => {
    const form = fileForm('malware.exe', 'application/x-msdownload', 'MZ\u0000\u0000');
    const req = await authedRequest(USERS.alice, '/api/documents/import', {
      method: 'POST',
      formData: form,
    });
    const { status, body } = await read(await importDocument(req));

    expect(status).toBe(415);
    expect(body.error.code).toBe('UNSUPPORTED_FILE_TYPE');
    expect(await prisma.document.count({ where: { ownerId: USERS.alice.id } })).toBe(2);
  });

  it('rejects a file over the size cap', async () => {
    // Built from the constant so raising the cap never silently skips this test.
    const oversized = 'x'.repeat(MAX_FILE_BYTES + 1);
    const form = fileForm('notes.md', 'text/markdown', oversized);
    const req = await authedRequest(USERS.alice, '/api/documents/import', {
      method: 'POST',
      formData: form,
    });
    const { status, body } = await read(await importDocument(req));

    expect(status).toBe(413);
    expect(body.error.code).toBe('FILE_TOO_LARGE');
    expect(await prisma.document.count({ where: { ownerId: USERS.alice.id } })).toBe(2);
  });
});
```

### 5.9 File layout

```
vitest.config.ts
docker-compose.test.yml
.env.test
lib/
  permissions.ts
  permissions.test.ts              # unit — the matrix
  documents/content.ts
  documents/content.test.ts        # unit — PM shape guard
  import/title.ts
  import/title.test.ts             # unit — title derivation
  import/validate.ts
  import/validate.test.ts          # unit — extension/MIME/size allowlist
tests/
  integration/
    global-setup.ts
    setup.ts
    fixtures.ts
    helpers/request.ts
    documents.test.ts
    shares.test.ts
    import.test.ts
    auth.test.ts
```

Unit tests sit **beside** the module (`lib/**/*.test.ts`); integration tests live under `tests/` because
they are about the system, not a module. The `include` globs in §2.1 make that convention mechanical: a
test file cannot end up in the wrong project by accident.

---

## 6. What we deliberately do **not** test, and why

| Not tested | Why |
|---|---|
| **TipTap's own behaviour** — that `toggleBold` applies a bold mark, that `StarterKit` produces well-formed ProseMirror JSON, that lists nest | It is a mature MIT library with its own suite. Testing it tests ProseMirror, not shared-docs. What we *do* own is that whatever it produces round-trips through our schema and our DB — asserted by integration case 5 and manual QA steps 4–7. |
| **Prisma's own behaviour** — that `createMany` inserts, that `@@unique` is unique, that cascades cascade | Same argument. Our schema *decisions* (the `@@unique([documentId, userId])` that turns re-sharing into an upsert) are tested through the route in case 10, which is where a bug would actually reach a user. |
| **Zod's own behaviour** | We test *our schemas'* accept/reject decisions (§4.2, §4.3), not that Zod parses. |
| **Styling, layout, responsive behaviour, dark mode** | No visual-regression tooling at 8h. Screenshots in the Drive folder and the video are the evidence. |
| **React component rendering** | No `@testing-library/react` installed. The components are thin; the logic worth protecting was pushed into `lib/`, which is exactly why the unit project can run with zero setup. The read-only editor state for `VIEWER` is a *UX affordance* — the real control is the `403` in case 4, which **is** tested (foundation §6 rule 3). |
| **Next.js middleware** (`/documents/*` redirect for unauthenticated users) | Exercising Edge-runtime middleware in isolation costs more setup than the branch is worth. It is a redirect, not an authorization boundary — every API route re-checks the session independently (case 19). Covered by manual QA step 1. |
| **Full browser E2E — Playwright** | This is the one real omission. A `@playwright/test` suite driving two browser contexts (Alice edits, Carol sees read-only) would be the strongest possible demo artifact, but it is ~2 hours: install, browser download, dev-server-and-DB fixture, auth storage state, and the flake budget that comes with it. At 8 hours that trades directly against shipping the deployment (C14) or the video (C19). **Scoped out; listed in `SUBMISSION.md` under "what I would build next with another 2–4 hours" as item 1**, alongside the note that the manual script in §9 is the Playwright spec already written in prose. |
| **Deployment / Vercel build** | Verified by the deploy-at-hour-2 rule (foundation R2), not by a test. |

Every row in this table is stated in `ARCHITECTURE.md` and said out loud in the walkthrough video —
"what I intentionally deprioritized" is a graded line in the brief.

---

## 7. Running the suite

```bash
# ── zero-setup path (what a reviewer runs) ────────────────────────────────
pnpm install
pnpm test:unit          # ~0.6–1.0s, ~60 assertions, no Docker, no DB, no env

# ── full path (what the author runs) ──────────────────────────────────────
pnpm db:test:up         # first run pulls postgres:16-alpine (~30–60s), then ~2s
pnpm test:integration   # ~10–14s cold (schema push), ~4–6s warm
pnpm db:test:down       # tmpfs volume disappears with the container

pnpm test               # both projects; requires Docker
pnpm test:watch         # unit only, in watch mode, during development
pnpm typecheck          # tsc --noEmit
```

Expected totals: **~60 unit assertions in under a second**, **~20 integration cases in well under
fifteen**. If the integration suite ever exceeds 30 seconds, the cause is fixture reseeding, not
Postgres — reduce the bcrypt cost or hoist the hash, do not start mocking the database.

`README.md` reproduces this block verbatim, with `pnpm test:unit` first and an explicit line: *"Docker is
required only for `test:integration`; `test:unit` runs anywhere."*

### 7.1 CI — **optional, only if it fits**

Recommended **only if the hour-6 feature freeze leaves slack**; it is ~10 minutes of work and buys a
green badge on the repo a reviewer will see before they clone. It runs the zero-setup checks only —
spinning up Postgres in Actions is a further 20 minutes for a suite the author already runs locally.

```yaml
# .github/workflows/ci.yml  — OPTIONAL. Unit + typecheck only.
name: ci
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec prisma generate   # tsc needs the generated client types
      - run: pnpm typecheck
      - run: pnpm test:unit
```

If it is not green within 10 minutes of the first push, **delete the workflow file** rather than debug
it. A red CI badge on a submission is worse than no badge; the tests still run locally and the README
says so.

---

## 8. Test-writing order (so this fits in 1.5h)

Tests are written *alongside* the code they cover, not in a block at the end:

| When | What | Cost |
|---|---|---|
| With `lib/permissions.ts` (hour ~1) | §3 matrix suite | 15 min |
| With `lib/import/*` (hour ~4) | §4.1 + §4.2 tables | 15 min |
| With the `PATCH` route (hour ~3) | §4.3 content guard | 10 min |
| Once routes exist (hour ~5) | §5.2–§5.5 harness | 30 min |
| Immediately after (hour ~5.5) | §5.7 P0 cases | 20 min |
| If under budget | P1 cases, CI workflow | 15 min |

**Degradation ladder** — if hour 6 arrives and the integration harness is not green:

1. Ship the unit project only. It already satisfies C16 ("at least one meaningful automated test") and it
   is the matrix, which is the meaningful part.
2. Say so in `SUBMISSION.md` under "incomplete", with the harness committed but the suite skipped.
3. Do **not** delete the manual QA script (§9) — with the automated integration suite gone, it becomes the
   only evidence that the access model works end to end, and it must be run before recording.

Never trade the deployment (C14) or the video (C19) for an integration test.

---

## 9. Manual QA checklist

Run this **against the deployed Vercel URL** (not localhost) immediately before recording the
walkthrough. Two browsers, side by side: **Browser A = a normal window (Alice)**, **Browser B = a private/
incognito window (Carol)** — private mode guarantees a separate cookie jar, which a second tab does not.
Password for every account: `demo1234`.

Total run time: ~8 minutes. It doubles as the video storyboard.

| # | Step | Expected result |
|---|---|---|
| 1 | Browser A: open `/documents` while logged out | Redirected to `/login` — the middleware guard works |
| 2 | Browser A: click the **Alice** demo button, submit | Landed on `/documents`; header shows Alice |
| 3 | Browser A: read the dashboard | Two labelled sections, **My documents** and **Shared with me**; Alice's docs are under the first (C11) |
| 4 | Browser A: **New document** | Redirected into `/documents/<id>` with an empty editor and the title `Untitled document` |
| 5 | Browser A: type a paragraph; apply **bold**, *italic*, <u>underline</u> with both toolbar buttons and keyboard shortcuts | Marks apply; toolbar buttons show active state when the caret is inside a marked range (C5) |
| 6 | Browser A: add an **H1**, an **H2**, a **bulleted list** (nest one item with Tab), a **numbered list** | All render correctly (C6, C7) |
| 7 | Browser A: rename the doc inline to `Launch plan` | Title persists; save indicator settles on "Saved" (C2) |
| 8 | Browser A: hard-reload (Ctrl+Shift+R) | Title **and all formatting** survive — this is C4, the single most-watched behaviour |
| 9 | Browser A: **Import**, choose a `.md` file with a heading, bold text and a list | New document created, opened in the editor, headings/bold/list preserved, title derived from the filename (C8, §4.1) |
| 10 | Browser A: **Import**, choose a `.docx` | Same — content converted, document opens |
| 11 | Browser A: **Import**, choose a `.png` or `.exe` | Inline error naming the supported types; **no** document created. The supported-types line is visible in the dialog *before* choosing a file (brief: "state that clearly in the UI") |
| 12 | Browser A: on `Launch plan`, **Share** → `carol@example.com` → **Viewer** | Carol appears in the share list with a `Viewer` badge |
| 13 | Browser B: log in as **Carol** | `Launch plan` appears under **Shared with me** with a `Viewer` badge; Alice's other documents are **not listed** (C9, C11) |
| 14 | Browser B: open `Launch plan` | Read-only banner reading **"👁 View only — Alice Rivera shared this with you as a viewer."** (`04-ui-spec.md` §6.8 owns the copy); the toolbar is **not rendered** at all; typing changes nothing |
| 15 | Browser B: paste the URL of a document Carol has no access to (Alice's private one, id from Browser A's address bar) | **Not-found page, not a permission-denied page** — foundation §6 rule 1, visible in the UI |
| 16 | Browser B: with devtools open, `fetch` a `PATCH` at `Launch plan` | **`403`** with `{"error":{"code":"FORBIDDEN"}}` — the server is the authority, not the disabled toolbar (§6 rule 3). *This is the money shot for the video.* |
| 17 | Browser A: change Carol's role to **Editor** | Badge updates in place; the share list still has exactly one Carol row (upsert, not duplicate) |
| 18 | Browser B: reload | Editor is now writable; Carol types a sentence; it saves |
| 19 | Browser A: reload | Carol's sentence is visible — shared persistence round-trips (C12) |
| 20 | Both browsers open on the same document: A edits and saves, then B (whose tab has been idle) edits and saves | B gets an **inline amber banner** inside the editor — **"This document changed elsewhere."** with a **Reload** button (`04-ui-spec.md` owns the copy; D002). **No modal opens**, and there is no "copy my text" affordance — **Reload** is the only action offered. Autosave is suspended while the banner is up, so the save status never settles on "Saved"; clicking **Reload** re-fetches the document and B sees A's text. No silent data loss (foundation §4, R4) |
| 21 | Browser A: **Share** → `alice@example.com` (her own address) | Inline error, no share created (§6 rule 4) |
| 22 | Browser B: attempt to open the Share dialog as Editor | Not offered — an editor cannot re-share (matches integration case 9) |
| 23 | Browser A: revoke Carol's access; Browser B: reload | Document disappears from Carol's dashboard; opening the old URL gives not-found |
| 24 | Browser A: log out, then press Back | Returned to `/login`, not to a cached dashboard |

If any step fails, it is a release blocker for the video — record after it is green, not before, and note
anything still failing in `SUBMISSION.md` under "what is incomplete".

---

## 10. Budget

| Item | Estimate |
|---|---|
| `vitest.config.ts`, `.env.test`, scripts, `vite-tsconfig-paths` wiring | 10 min |
| §3 permission matrix suite | 15 min |
| §4 import + content-guard unit suites | 25 min |
| §5 integration harness (compose, global setup, fixtures, request helper) | 30 min |
| §5.7 P0 integration cases | 20 min |
| Debugging the first integration run (Prisma `DATABASE_URL`, multipart boundary, async `params`) | 15 min |
| **Total implementation** | **~1.9h → budgeted 1.5h**, with P1 cases and CI as the drop-first items |
| Manual QA run-through (§9) | 15 min, charged to the video/submission block, not here |

---

## 11. Rulings (previously "open questions")

Each of these was a constant or a name this spec had to pin in order to write assertions. All are
now decided in `00-foundation.md`, and where the sibling won, **this file changed.**

1. ✅ **The error-code registry is `00-foundation.md` §7a**, exported as `ApiErrorCode` from
   `lib/api-types.ts`. Tests import codes as strings but `tsc` checks the routes, so a typo cannot
   ship. Two of this spec's own rows were wrong and were corrected: `VALIDATION_ERROR` →
   `VALIDATION_FAILED`, and import rejections are **`415`/`413`**, not `400`/`400` — those two were
   P0 cases that would have failed against a correct implementation.
2. ✅ **`POST /api/documents/:id/shares` always returns `200`**, with `created: boolean` in the body.
   Case 13's `201` is gone; it contradicted `02`, `03`, and case 10 of this same table.
3. ✅ **`MAX_FILE_BYTES = 2 * 1024 * 1024`, in `lib/import/constants.ts`** — one name, one module
   (`00-foundation.md` §7b). This spec's `MAX_IMPORT_BYTES` is gone, and `04-ui-spec.md`'s 1 MB UI
   copy was corrected to render `IMPORT_LIMITS_COPY` instead of a literal.
4. ✅ **Accepted: route handlers never import `next/headers`.** `03-auth-and-permissions.md` §3.2
   now exports `getSessionFromRequest(request)` from `lib/session-token.ts`, and
   `02-api-contract.md`'s `withSession` calls it. The helper in §5.5 uses `signSessionToken(user)`
   and `SESSION_COOKIE` — **`03`'s names**, taking the whole `SessionUser`, not a bare `userId`.
   Without this ruling the integration suite could not exist at all.
5. ✅ **Capability keys are the six unprefixed names** (`read`, `update`, `rename`, `delete`,
   `viewShares`, `manageShares`) from `00-foundation.md` §6a. The `document:` / `shares:` prefixes
   this spec invented are gone; `ROLES` keeps `NONE` so the 24-cell table remains expressible.
6. ✅ **CI is optional and unit-only** (§7.1). Unchanged.
7. ✅ **Node 22.x**, pinned in `engines` and `.nvmrc`, both owned by `01-data-and-persistence.md`
   (`00-foundation.md` §2a).

### 11.1 What this spec had to give up

| This spec specified | What ships | Why |
|---|---|---|
| A recursive `z.lazy` node schema + `MAX_CONTENT_DEPTH` + 12 rows (§4.3) | `01`'s ten-line root-shape guard + 9 rows | `01` §5.2 gives five reasons not to build a second source of truth for the document schema, and the budget argument is real. Test cases asserting a depth limit the implementation does not have are worse than no cases. |
| `.markdown` accepted (§4.2 row 5) | rejected | `05-import-spec.md` §2.1 rule 1: the advertised copy says `.md`. |
| `deriveTitle` / `DEFAULT_TITLE` | `titleFromFilename` / `FALLBACK_TITLE` | `05` owns the module; importing a symbol it does not export reds the whole unit project. |
| Its own `docker-compose.test.yml` semantics vs `01`'s | this file's (55432, tmpfs, `shared_docs_test`) **plus `01`'s initdb script** for `shared_docs_dev` | The safety rail in `global-setup.ts` is the better design and is load-bearing; `01` contributes the second database rather than a second compose file. |
| `SESSION_SECRET` in `.env.test` | `AUTH_SECRET`, ≥32 chars, **plus `DIRECT_URL`** | `lib/env.ts` throws at module evaluation otherwise, and `prisma db push` needs `DIRECT_URL` defined. The old 30-character value was two short of the minimum. |

## Definition of done

- [ ] `vitest@4.1.11`, `vite-tsconfig-paths` and `dotenv` are devDependencies (installed by `T01`, not by this slice); no coverage reporter is installed.
- [ ] `vitest.config.ts` exists at the repo root with exactly two projects named `unit` and `integration`, matching §2.1.
- [ ] `package.json` defines `test`, `test:unit`, `test:integration`, `test:watch`, `db:test:up`, `db:test:down`, `typecheck` as in §2.3, and `test:integration` starts the container inline with `&&` (no reliance on pnpm pre/post hooks).
- [ ] **On a clean clone, `pnpm install && pnpm test:unit` passes green with no Docker, no database, no `.env` file and no network access.** Verified by actually deleting `node_modules` and `.env` and running it once.
- [ ] `lib/permissions.test.ts` asserts all 24 role × capability cells from foundation §6 via `it.each`, using the **unprefixed** capability keys from §6a, plus the exhaustiveness guard and the two property assertions in §3.3.
- [ ] `lib/import/title.test.ts` covers all 16 rows of §4.1, including `a.b.c.md`, no-extension, empty, whitespace-only, path-traversal, and the 120-char cap asserted against `MAX_TITLE_LENGTH`.
- [ ] `lib/import/validate.test.ts` covers all 18 rows of §4.2, asserts the extension → MIME → empty → size evaluation order, and builds the over-cap case from `MAX_FILE_BYTES` rather than a literal.
- [ ] `lib/documents/content.test.ts` covers all 9 rows of §4.3, including the `toDocumentContent` read-path fallback and the "unknown node type is allowed" policy assertion. **No depth bound is asserted** — none exists.
- [ ] `docker-compose.test.yml` runs `postgres:16-alpine` on host port **55432** with a `pg_isready` healthcheck and a `tmpfs` data directory; `pnpm db:test:up` returns only once healthy.
- [ ] `.env.test` is committed with `TEST_DATABASE_URL`, `DIRECT_URL` and an `AUTH_SECRET` of **at least 32 characters**; the real `.env` remains gitignored. `grep -rn SESSION_SECRET .` returns nothing.
- [ ] `tests/integration/global-setup.ts` refuses to run unless `TEST_DATABASE_URL` names `shared_docs_test` on port `55432`, then runs `prisma db push`.
- [ ] `tests/integration/setup.ts` truncates all three tables and reseeds fixtures in `beforeEach`; the integration project runs single-fork with `fileParallelism: false`.
- [ ] The fixture graph is exactly: alice owns d1 (bob `EDITOR`, carol `VIEWER`), alice owns d2 (no shares), bob owns d3 — with fixed ids `u_alice`/`u_bob`/`u_carol` and `d1`/`d2`/`d3`.
- [ ] `tests/integration/helpers/request.ts` exports `authedRequest`, `ctx`, `fileForm` and `read`, and mints cookies by calling the **production** `signSessionToken(user)` from `@/lib/session-token`, not a re-implementation.
- [ ] Every **P0** row of §5.7 is implemented and green — in particular: d2-as-carol is **404 and not 403**; carol's `GET` of d1 has `shares === null`; `PATCH` d1 as carol is 403 with the row provably unchanged; `PATCH` d1 as bob is 200 with content persisted; a stale `lastKnownUpdatedAt` is 409 with the current token in `details` — **the only conflict case; no recovery case is added (D002)**; `POST` shares as bob is 403; re-sharing carol leaves **two** share rows with her role updated; sharing with self is 400; bob's list has d3 in `owned`, d1 in `sharedWithMe`, and d2 in neither; `.exe` import is **415** `UNSUPPORTED_FILE_TYPE`; over-cap import is **413** `FILE_TOO_LARGE`; and all four listed handlers return 401 with no cookie.
- [ ] Integration assertions check `error.code`, never `error.message`.
- [ ] `pnpm test` (both projects) passes locally with Docker running; the integration project finishes in under 30s warm.
- [ ] `README.md` contains the §7 command block verbatim, lists `pnpm test:unit` first, and states that Docker is required only for `test:integration`.
- [ ] `ARCHITECTURE.md` contains the §1 thesis (why access control + import validation, why no coverage target) and the §6 "not tested" table.
- [ ] Playwright / browser E2E is named as scoped-out in `SUBMISSION.md` under "what I would build next with another 2–4 hours".
- [ ] The §9 manual QA checklist has been run end to end against the **deployed** URL, all 24 steps pass, and only then is the walkthrough video recorded.
- [ ] Optional: `.github/workflows/ci.yml` runs `prisma generate`, `typecheck` and `test:unit` and is green — or the file does not exist. A red CI badge is not shipped.
