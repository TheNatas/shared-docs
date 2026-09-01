# DECISIONS — the ruling record

Append-only. When an implementer hits a contradiction between two specs, they **stop and
escalate** rather than resolving it locally (risk R6 in `10-task-graph.md` §8). The ruling
is appended here as a numbered entry and becomes canonical, outranking every spec file
except where it says otherwise.

Owner: the lead. No delegated agent writes to this file.

---

## D001 — Parallelism: 3–4 agents. No up-front cuts.

**Ruled 2026-09-01, before T01.**

The build runs 3–4 agents wide through W1, W3, W4 and W6, which is the ~2.1× mean
parallelism the 8-hour clock requires (`10-task-graph.md` §1 S2).

Consequence: **nothing is cut in advance.** Entry into the cut list (`10` §7) happens only
when a wave actually slips, pulling from the top. The one exception is D002 below, which is
a scope decision rather than a schedule cut and therefore is taken now.

The trigger that changes this ruling: clock reaches 3:00 with W3 not underway, or 5:30 with
any W3/W4 task unmerged. At that point R5 has fired — freeze and cut, do not extend.

## D002 — Optimistic concurrency ships in its reduced form.

**Ruled 2026-09-01. Must be applied BEFORE T10 and T18 start.**

Cut-list item 1 proposed deleting the conflict system entirely (saves 1h15, touches no
brief line). It is **not** taken. Instead the system ships reduced, at ~30 minutes — saving
~45 minutes while keeping the whole engineering argument intact.

The claim being defended is *"last write wins, but never silently."* Everything that
defends that claim stays. Everything that merely polishes the recovery goes.

### Ships

| Piece | Where |
|---|---|
| `lastKnownUpdatedAt` in the `PATCH` body, Zod-validated as an ISO datetime string | `02` |
| Server guard: `updateMany({ where: { id, updatedAt: <token> } })`, then `count === 0` → **409 `CONFLICT`** | `02`, T10 |
| Every `200` from `PATCH` returns the new `updatedAt`; the client advances its token **only** from a success body | `02`, `04` |
| **At most one in-flight `PATCH` per document** on the client | `04`, T18 |
| A `conflict` state in the save-status machine; autosave **suspends** while in it | `04`, T18 |
| An inline amber banner — `This document changed elsewhere.` + a **Reload** button | `04`, T18 |
| One integration case: stale `lastKnownUpdatedAt` → `409` | `06`, T20 |
| The `ARCHITECTURE.md` paragraph and the video sentence | `08`, `09` |

The single-in-flight guard is **not** optional. It is the whole mitigation for R4 — without
it a lone user editing for two minutes 409s against themselves. It is a boolean ref and a
dirty flag, roughly five lines. Cutting it while keeping the 409 turns a correctness
feature into a bug.

### Does not ship

| Piece | Replaced by |
|---|---|
| `components/editor/ConflictDialog.tsx` (the modal) | the inline banner |
| **"Copy my text"** + the clipboard path | nothing — Reload is the only action |
| The request-**merging queue** in `useAutosave` (`queue()` folding into a pending patch) | skip-if-in-flight, then re-fire once on completion if still dirty |
| The second integration case covering conflict *recovery* | the one detection case above |
| A dedicated video beat at ~3:00 | one sentence inside the implementation-decisions beat |

Note the distinction in the third row: the *merging queue* was the expensive part, not the
in-flight guard. They were bundled together in cut-list item 1; they are separable, and
that separation is what makes the reduced version cost 30 minutes instead of 75.

### Consequence for the specs

`04-ui-spec.md` §7.2 keeps the `useAutosave` signature but loses the queue; §11's
`ConflictDialog` wireframe becomes a banner; `04` §1's component tree drops
`ConflictDialog.tsx`. `02-api-contract.md` is unchanged — the wire contract was already
correct. `06-test-plan.md` keeps case 6 and drops the recovery case. `09` folds the beat.

## D003 — Neon region: AWS `us-east-1`, paired with Vercel `iad1`.

**Ruled 2026-09-01, before the Neon project is created.**

The region is fixed at project creation on the free tier; changing it later means deleting
and re-creating the project, so this is decided before `07-deployment-runbook.md` §2 is
executed. Reviewers are US-based. Vercel's function region must be set to `iad1` to match,
so the function and the database are co-located.

Neon has no South America region on the free tier, so this would have been the answer
regardless of the author's own location.

## D004 — Repository is public, and the plan is committed before the code.

**Ruled 2026-09-01.**

`github.com/TheNatas/shared-docs`, public. The spec set is commit 1; the implementation
starts at commit 2. The history therefore shows the specification predating the build,
which is itself part of the delivery-discipline signal the brief grades.

Remote uses **HTTPS**, not SSH — the snap-confined `gh` on this machine cannot `exec ssh`,
so pushes go through `credential.helper = !gh auth git-credential`, already set in this
repo's local config.

## D005 — `docker-compose.test.yml` moves from T04 to T01.

**Ruled 2026-09-01, during W0. Fixes an ordering bug in `10-task-graph.md`.**

T01's definition of done requires `prisma migrate dev --name init` to run and
`GET /api/health` to return `db:"up"` **locally**. Both need a running Postgres. But
`docker-compose.test.yml` and the `.docker/initdb/01-dbs.sql` that creates `shared_docs_dev`
were owned by **T04, which lands in W1** — the following wave. As written, T01 could not
reach its own DoD.

**Ruling:** ownership of `docker-compose.test.yml` and `.docker/initdb/01-dbs.sql` moves to
**T01**. The file keeps `06-test-plan.md` §5.2's shape exactly — port `55432`, user `test`,
tmpfs, healthcheck — because `global-setup.ts` refuses any URL that does not name
`shared_docs_test` on `55432` (Appendix A row 19). The initdb script adds `shared_docs_dev`
to the same container, so local dev and the integration suite share one container on one
port: one thing to start, one thing to explain in the README.

T04 keeps `.env.test`, `vitest.config.ts`, `prisma.config.ts`, `prisma/seed.ts`,
`lib/documents/content.ts` and its test. T04's dependency on T01 is unchanged.

Update `10-task-graph.md` §2's chokepoint table accordingly: the row currently reading
`docker-compose.test.yml, .env.test, vitest.config.ts | T04 | W1` splits in two.

## D006 — Prisma pinned to 6.19.3, not 7.10.0. My own toolchain pin was wrong.

**Ruled 2026-09-01, during W0/T01, on evidence from the failing install.**

`_toolchain-findings.md` pinned both Prisma halves to **7.10.0** to resolve TRAP-1 (an
`8.0.0-rc` CLI resolving against a stable 7.x client). That pin overrode
`01-data-and-persistence.md` §2, which had said **"stay on the Prisma 6.x line for the whole
assessment"** — recorded in `_review-coverage.md` row 20. **The original spec was right and the
override was wrong.**

`pnpm install`'s `postinstall` failed immediately: Prisma 7 removed `url` and `directUrl` from
the schema `datasource` block. Connection configuration moves to `prisma.config.ts` and
`PrismaClient` now requires a **driver adapter** instead of a connection string.

### Why 6.19.3 rather than adopting the Prisma 7 model

Adopting Prisma 7 would mean rewriting the datasource block, `lib/db.ts`, and the pooled/direct
URL story in `07-deployment-runbook.md` §2 — plus adding `@prisma/adapter-pg` and `pg`. That is
30–45 minutes of unplanned work whose failure mode lands squarely on the **hour-2 deploy gate**,
the one checkpoint the whole schedule is built around. Prisma 6.19.3 is the last release where
every line the specs already describe works verbatim, it is well-trodden with Neon, and it costs
zero minutes.

Newest is not the same as correct. For every other pin in the table those coincided; for Prisma
they did not.

### Consequences

- `prisma` and `@prisma/client` both `6.19.3`. Still byte-identical — TRAP-1's actual lesson
  (never `@latest`, never upgrade one half alone) stands unchanged.
- `prisma/schema.prisma` keeps `url` + `directUrl` in the datasource block, exactly as
  `00-foundation.md` §5 and `01-data-and-persistence.md` specify. **No spec change needed.**
- `lib/db.ts` keeps a bare `new PrismaClient()`. No adapter, no `pg` dependency.
- `07-deployment-runbook.md` §2's pooled/direct story is correct as written.
- **T04 is affected:** `01` §2's warning that "Prisma 7 moves seed registration into
  `prisma.config.ts`, so `package.json#prisma.seed` silently stops working" no longer applies.
  On 6.19.3 the `package.json#prisma.seed` key is the correct mechanism. T04 must **not** create
  `prisma.config.ts`; it adds a `prisma.seed` key instead. Its DoD line about `prisma.config.ts`
  is void.

Logged in `docs/ai-log.md` as a rejected AI-generated decision — it is a concrete, verifiable
example for `AI-WORKFLOW.md`, which the brief grades specifically.

## D007 — R1 closed on **Plan A**. No jsdom, no mapper, `.docx` survives.

**Ruled 2026-09-01, W0/T03, inside the 30-minute box (used: ~6 minutes).**

`node scripts/spike-generate-json.mjs` exits `0` and prints `SPIKE PASS`. Every §5.2 assertion
holds: `doc` root, `heading` at level 1, `bold` / `italic` / `underline` marks, `bulletList`,
`orderedList`.

**`@tiptap/html` v3 works server-side as shipped.** Its `exports` map carries a `node`
condition — `"node": "./dist/server/index.js"` — plus an explicit `./server` subpath. Node
resolves the server build automatically, so `generateJSON` never touches a browser DOM.

Per `05-import-spec.md` §5.3, Plan A means: nothing to do, zero extra dependencies. `jsdom` and
`@types/jsdom` were speculatively added by T01 for Plan B and have been **removed**.
`lib/import/dom-polyfill.ts` is never created.

**`.docx` is no longer at risk.** It was cut-list item 7 only because it depended on the spike
outcome. Mammoth's HTML now flows through the same `generateJSON` path as Markdown.

### The reasoning that was wrong

`_toolchain-findings.md` TRAP-3 inferred from `npm view @tiptap/html dependencies` returning
empty that v3 had dropped v2's bundled `zeed-dom` and therefore needed a DOM supplied by the
caller. The premise was true and the conclusion did not follow: v3 has no DOM *dependency*
because its **server build does not need one**, not because it expects the caller to provide
one. The check that would have settled it in ten seconds — reading the package's `exports` map —
is the one the spike spec listed and the findings file skipped.

Cost of the error: zero. It was time-boxed, it made the spike start on Plan B, and Plan A was
tried first anyway and passed. That is the box working as designed.

### `lib/editor-extensions.ts` is frozen

Exports `schemaExtensions` (server-safe, used by the importer) and `editorExtensions`
(adds `Placeholder`, client-only). `heading` limited to levels 1–3; `codeBlock`, `code`,
`blockquote`, `horizontalRule`, `strike` and `link` explicitly disabled. `Underline` appears in
neither array — StarterKit provides it, verified by reading StarterKit's own extension list
(`... paragraph, strike, text, underline, trailingNode`), which is TRAP-2 confirmed empirically
rather than assumed.

`@tiptap/extensions@3.31.0` was added as a **direct** dependency: `Placeholder` lives there, and
pnpm's strict `node_modules` does not expose transitive packages.
