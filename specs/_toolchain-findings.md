# Toolchain findings — verified against the live npm registry (2026-09-01)

These were checked with `npm view` before any code was written. They **override** any
version stated elsewhere in the spec set. Three of them are traps that would have cost
real time on the day.

## Pinned versions

| Package | Pin | Note |
|---|---|---|
| `next` | **16.3.4** | `latest` is 16.x, **not** 15. Update every spec that says "Next.js 15". |
| `react` / `react-dom` | 19.x | whatever `create-next-app` pairs with Next 16 |
| `prisma` (CLI) | **7.10.0** | ⚠️ see TRAP-1 |
| `@prisma/client` | **7.10.0** | must match the CLI exactly |
| `@tiptap/react` | 3.31.0 | |
| `@tiptap/starter-kit` | 3.31.0 | ⚠️ see TRAP-2 |
| `@tiptap/pm` | 3.31.0 | required peer |
| `@tiptap/html` | 3.31.0 | ⚠️ see TRAP-3 |
| `tailwindcss` | 4.3.3 | |
| `vitest` | 4.1.11 | `latest`; v5 is still rc |
| `jose` | 6.2.10 | |
| `bcryptjs` | 3.0.3 | |
| `mammoth` | 1.12.2 | `.docx` → HTML |
| `marked` | 18.0.11 | `.md` → HTML |
| `zod` | 3.x or 4.x — pick one and pin it | |

## TRAP-1 — Prisma CLI and client resolve to different major versions

```
npm view prisma dist-tags          ->  latest: 8.0.0-rc.12   ← an RC is on `latest`
npm view @prisma/client dist-tags  ->  latest: 7.10.0        ← stable
```

Installing `prisma @prisma/client` with no version pins gives a **release-candidate CLI
against a stable client**. That mismatch produces confusing generate/migrate failures
that are easy to misdiagnose as Neon or Vercel problems.

**Action:** pin explicitly — `pnpm add -D prisma@7.10.0` and `pnpm add @prisma/client@7.10.0`.
Never `prisma@latest` in this project. Add a one-line comment in `package.json` explaining
the pin so it does not get "helpfully" upgraded.

## TRAP-2 — `@tiptap/extension-underline` is already inside StarterKit v3

`@tiptap/starter-kit@3.31.0` depends on `@tiptap/extension-underline@3.31.0` directly,
along with bold, italic, heading, bullet-list, ordered-list and list-item.

**Action:** do **not** install Underline separately, and do **not** add it to the
extensions array — registering the same extension twice throws a duplicate-name error at
editor init. `StarterKit` alone covers every formatting requirement C5–C7. Verify at build
time with a one-line check of what StarterKit registers, rather than assuming.

## TRAP-3 — `@tiptap/html` ships no DOM (risk R1 confirmed)

```
npm view @tiptap/html dependencies   ->  (empty)
```

v2 bundled `zeed-dom`; **v3 has zero dependencies**, so `generateJSON()` expects a DOM to
already exist in the global scope. On a Node/serverless route handler there is none.

**Action:** R1 is now a known problem rather than an unknown, so the 30-minute spike gets
cheaper — start it on **Plan B**, not Plan A:

- **Plan B (start here):** add `jsdom`, install `document`/`DOMParser` onto `globalThis`
  inside the import module before calling `generateJSON`, and confirm it round-trips.
- **Plan C (fallback):** skip HTML entirely — walk the `marked` token stream and emit
  ProseMirror JSON with a small hand-written mapper over the supported node set.
  `.txt` never needs HTML at all. If Plan B is not green in 30 minutes, take Plan C for
  `.md`/`.txt` and **cut `.docx`** — `.md` + `.txt` satisfy requirement C8 on their own.

Keep the extension list in a single shared `lib/editor-extensions.ts` imported by both the
client editor and the server-side importer, so parsed content can never contain nodes the
editor cannot render.

---

## CORRECTION — 2026-09-01, during W0/T01: the Prisma pin above is wrong

TRAP-1 correctly identified that `prisma@latest` resolves to an `8.0.0-rc` CLI against a
stable 7.x client, and pinned both halves to **7.10.0** to fix the mismatch. That fixed the
mismatch and introduced a worse problem, discovered the moment `postinstall` ran:

```
error: The datasource property `url` is no longer supported in schema files.
       Move connection URLs for Migrate to `prisma.config.ts` and pass either
       `adapter` ... to the PrismaClient constructor.
error: The datasource property `directUrl` is no longer supported in schema files.
Prisma CLI Version : 7.10.0
```

**Prisma 7 is a breaking redesign**, not a version bump. `url` and `directUrl` are gone from
the schema `datasource` block, connection config moves to `prisma.config.ts`, and the client
requires a **driver adapter** rather than a connection string. That invalidates the datasource
block in `00-foundation.md` §5, `lib/db.ts`, and the pooled/direct deployment story in
`07-deployment-runbook.md` §2 — the most load-bearing infrastructure section in the set.

**Corrected pin: `prisma` and `@prisma/client` both at `6.19.3`.** See `DECISIONS.md` D006.

The lesson for the pin table generally: `npm view <pkg> version` answers "what is newest", which
is not the question. The question is "what does this project's specs assume, and is that still
supported". For the other pins those answers coincided; for Prisma they did not.

## CORRECTION — TRAP-3's conclusion was wrong (settled by the T03 spike)

TRAP-3 observed, correctly, that `npm view @tiptap/html dependencies` returns empty and that v2
had bundled `zeed-dom`. It then concluded that `generateJSON` would need a DOM supplied by the
caller on a Node/serverless route, and directed the spike to start on Plan B (jsdom).

**The conclusion did not follow.** `@tiptap/html@3.31.0` ships a `node` conditional export:

```json
"exports": { ".": { "import": { "browser": "./dist/index.js",
                                "node":    "./dist/server/index.js" } },
             "./server": { ... } }
```

Node resolves the server build automatically. It has no DOM *dependency* because it does not
need one — not because it expects the caller to provide one. The spike passed on **Plan A**
with zero extra packages; `jsdom` was removed again. See `DECISIONS.md` D007.

**Generalisable lesson for this table:** `npm view <pkg> dependencies` describes what a package
pulls in, which is weak evidence about what it *requires at runtime*. Reading the `exports` map
answers the actual question and takes the same ten seconds. Combined with the Prisma correction
above, two of this file's three traps had the right observation and the wrong inference.
