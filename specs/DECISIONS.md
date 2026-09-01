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

## D008 — Amendment fallout: three corrections and one closed unknown.

**Ruled 2026-09-01, after the D002/D003 amendment's verification pass.**

### 1. D002 above misnames a section. The banner is `04-ui-spec.md` **§6.9**, not §11.

D002's "Consequence for the specs" says "§11's `ConflictDialog` wireframe becomes a banner".
Wrong: §11 is the visual polish budget and always was; the wireframe is **§6.9** and the
component tree is **§3**. Two editors copied the bad number out of this file into
`02-api-contract.md` and `10-task-graph.md` before the verifier caught it.

This record is append-only, so D002's text stands as written and **this entry is the
correction**. Anyone citing the banner cites §6.9.

Worth naming the mechanism, because it will recur: a ruling that carries a wrong detail
propagates it to every file that applies the ruling faithfully. Rulings are copied, not
re-derived — that is the point of them — so a factual error in one is amplified rather than
caught. Cite section *numbers* sparingly in future entries; cite section *names*.

### 2. `useEditorState` is available. The last open human item is closed.

`04-ui-spec.md` §12 item 7 and `10-task-graph.md` Appendix A row 55 were the only remaining ⏳.
Checked directly against the installed package:

```
@tiptap/react@3.31.0 exports:
  useCurrentEditor, useEditor, useEditorState, useReactNodeView, useTiptap, useTiptapState
```

`useEditorState` ships. The toolbar uses it for active-state derivation as specced. The
`onTransaction` + `useState`-bump fallback is **not** needed and must not be built — it re-renders
the whole toolbar on every transaction, which is the cost `useEditorState` exists to avoid.

**The open-decisions list is now empty.** Nothing in the spec set is waiting on a human.

### 3. `_review-coverage.md` and `_review-consistency.md` stay stale. Confirmed.

Both still describe `ConflictDialog` and "Copy my text" as shipping. They are **dated adversarial
findings from before the rulings**, not specifications, and the same logic that protects
`_toolchain-findings.md` protects them: editing an evidence file so it agrees with a later
decision destroys its value as evidence. Their filenames start with `_` for exactly this reason.
No implementer builds from them.

### 4. Applying D005/D006/D007 to the spec set is deferred, and the lead owns it.

The verifier correctly declined to apply these — the repo moved underneath it mid-audit (W0
landed and this file grew by two entries while it was reading), and editing files that a
concurrent wave might also touch is how two vocabularies get created.

Still stale in the specs, to be reconciled **after W1 completes**:

| Where | What is stale | Ruling |
|---|---|---|
| `10-task-graph.md` §2 chokepoint table | `docker-compose.test.yml` row still owned by T04/W1 | D005 — split the row; compose + initdb are T01/W0 |
| `10-task-graph.md` T04 DoD | requires `prisma.config.ts`, warns about the Prisma 7 seed key | D006 — void; `package.json#prisma.seed` is correct and already present |
| `10-task-graph.md` T03 DoD, R1 row, §7 item 7 | R1 open, spike starts on Plan B, `.docx` cuttable | D007 — R1 closed on Plan A; `.docx` is no longer at risk |
| `01`, `07` — Prisma version references | assume the 7.10.0 pin | D006 — 6.19.3; datasource `url`/`directUrl` are correct as written |

**This staleness is currently harmless**: W1's three agents were each given the overrides
directly in their briefs, so no agent is building from a stale line. It stops being harmless at
W3, so it is reconciled before W3 starts.

## D009 — Neon is live. Pooled/direct split verified, not assumed.

**Ruled 2026-09-01. Closes risk R2's database half.**

Project created in **AWS us-east-1** per D003. Endpoint `ep-frosty-union-auizxcxe`, database
`neondb`, role `neondb_owner`.

### What was verified, and how

| Check | Result |
|---|---|
| Direct endpoint (no `-pooler`) resolves and accepts DDL | `prisma migrate deploy` applied `20260901185848_init` |
| Pooled endpoint (`-pooler`) reachable at runtime | all three tables queried through it |
| Pooled endpoint survives **concurrency** | 12 simultaneous queries, all consistent |

The concurrency check is the one that matters. A single sequential query succeeds against
*either* endpoint, which is exactly why R2 says a swapped pair "works" until a reviewer's
concurrency produces `too many connections`. Twelve parallel queries through PgBouncer also
exercises the `pgbouncer=true` flag — without it, transaction-mode pooling hands each query a
different server connection and prepared statements go missing as a sporadic
`prepared statement "s0" does not exist`.

### Connection-string handling

- `DATABASE_URL` — pooled, plus `?sslmode=require&pgbouncer=true&connection_limit=1`.
- `DIRECT_URL` — direct endpoint, `?sslmode=require`. Migrations only.
- **`channel_binding=require` was dropped** from Neon's copy-paste string. It is a libpq
  parameter that Prisma's Rust driver does not consume; `sslmode=require` already forces TLS.
- Both live in `.env.production.local` (mode `600`, matched by `.gitignore`'s `.env*.local`).
  Confirmed with `git check-ignore` rather than assumed. The local `.env` still points at the
  Docker Postgres and was **not** touched — W1's agents are using it.
- A fresh production `AUTH_SECRET` was generated with `openssl rand -base64 32`. It is **not**
  the local one; the local secret never reaches production.

### ⚠️ Credential rotation — an action for the human

The pooled connection string was pasted into the assistant transcript, so it exists outside the
password manager. **Rotate the `neondb_owner` password in the Neon console once the assessment
is submitted** (Neon → project → Roles → reset password), then update `DATABASE_URL` and
`DIRECT_URL` in Vercel and in `.env.production.local`.

Not urgent — the database holds only seeded demo data, and the brief requires reviewers to reach
a live deployment — but it should not outlive the review. This is added to
`07-deployment-runbook.md` in the D005/D006/D007 reconciliation pass.

### Still open for W2

Vercel: import the repo, set the three env vars in **both** Production and Preview, set the
function region to **`iad1`** explicitly, and turn **Deployment Protection off** (R7 — an SSO
wall looks perfectly healthy to the owner and blocks every reviewer). Seeding production waits
on T04's `prisma/seed.ts`, currently in flight.

## D010 — Mammoth silently drops underline. `styleMap: ['u => u']` is MANDATORY.

**Found 2026-09-01 while building the import fixtures, before T12 was written.**

`mammoth.convertToHtml()` with default options **discards underline formatting entirely**.
Verified against the real `sample.docx` fixture:

```
default:                 ... an <em>italic run</em> and an underlined run in the same sentence.
styleMap: ['u => u']:    ... an <em>italic run</em> and an <u>underlined run</u> in the same sentence.
```

Bold (`<strong>`) and italic (`<em>`) survive by default; underline does not. Mammoth omits it
deliberately, because Word documents frequently use underline as link decoration rather than as
semantic emphasis. That reasoning does not apply here — our editor exposes Underline as a
first-class formatting control.

### Why this mattered enough to rule on

**Underline is requirement C5.** Without the style map, importing a `.docx` loses every underline
with no error, no warning and no failing test — the import returns `201`, the document opens, and
the formatting is simply gone. It is precisely the class of bug that survives to a demo.

### Binding on T12

```ts
const { value: html } = await mammoth.convertToHtml(
  { buffer },
  { styleMap: ['u => u'] },   // REQUIRED — see D010. Do not remove as "unnecessary config".
);
```

The comment is part of the ruling: a later reader tidying up an options object that looks
redundant reintroduces the bug.

### The full pipeline is verified, not assumed

Both import paths were run end to end against the committed fixtures, through the real
`schemaExtensions` from `lib/editor-extensions.ts`:

| Path | Result |
|---|---|
| `.docx` → mammoth (with styleMap) → `generateJSON` | doc root · heading 1 · heading 2 · bold · italic · **underline** · bulletList |
| `.md` → `marked` → `generateJSON` | headings 1–3 · bold · italic · underline · bulletList · orderedList |
| `.md` unsupported constructs | `codeBlock` **dropped** · `link` mark **dropped** · link *text* survives as plain text |

That last row is the security claim from `05-import-spec.md` §6 demonstrated rather than
asserted: TipTap's schema filtering — not a sanitizer library — is what removes anything outside
the allowed node and mark set.

### Fixtures committed

`tests/fixtures/import/`: `valid-all-constructs.md`, `plain.txt` (CRLF, trailing whitespace,
internal single newlines), `sample.docx` (a genuine Word 2007+ file authored via LibreOffice,
6.5 KB), `whitespace-only.md`, `empty.txt` (0 bytes), `fake.md` (an `MZ`-magic stub, 299 bytes,
**not** a real executable), and `make-oversized.ts` which generates the over-cap file at test
setup rather than committing 2 MB of filler into every clone.

`samples/` holds reviewer-facing copies plus a README, so `SUBMISSION.md`'s "Review in 60
seconds" points at files that exist.
