# Coverage review — adversarial read of the spec set against BRIEF.md

Reviewer role: coverage critic. Scope: does this spec set, as written, deliver the brief in 8 hours?
Only failures are recorded below. Nothing here is praise, and nothing here is a summary of what works.

**Verdict up front.**

1. **Brief coverage is nominally complete but operationally broken.** Every brief line has a spec that
   claims it. Six of them are claimed by *two specs that contradict each other*, which means the line
   is not actually covered — it is disputed, and the dispute is unresolved at implementation time.
2. **The budget is not credible.** The slices that state an hour figure sum to **14.25 h**. Two slices
   (`03`, `07`) state none and realistically cost **~2 h** more. Total **≈16 h against a stated 8 h**.
   This is not a rounding error; it is 2×.
3. **The spec set has a scope-creep problem measurable against its own acceptance criteria.**
   `00-foundation.md` §3 lists C1–C20. Six specced features map to **no C-row and no brief line**:
   optimistic concurrency / 409, `DELETE /api/documents/:id`, `GET /api/users` + autocomplete,
   `PATCH .../shares/:userId` role change, `/api/health`, and a nine-code import error taxonomy.
   Together they are **~2.5 h** — a third of the entire budget, spent on work nobody asked for.

---

## 1. Traceability: brief line → covered? → where → evidence or gap

### Task 1 — Document Creation and Editing

| Brief requirement | Covered | Where | Evidence / gap |
|---|---|---|---|
| "Create a new document" | **yes** | `02` §7.5, `04` §5.3 | `POST /api/documents` → `201` → `router.push`. |
| "Rename a document" | **yes** | `04` §6.4, `02` §7.8 | Inline title input, commits on blur/Enter, shares the `PATCH` route. |
| "Edit document content in a browser" | **partial** | `04` §6.3 | Specced, but see D3 — the extension list is defined **three times, differently** (`04` §3, `05` §3.3, `01` §7.4). If `_toolchain-findings.md` TRAP-2 is right, the specced list throws at editor init and **every document is a white screen**. Nobody owns resolving it; both `04` §12.6 and `05` §12.3 defer to "the spike". |
| "Save and reopen documents" | **yes** | `04` §7, `01` §5.3 | Autosave 800 ms / 5 s max-wait; server render supplies content on reopen. |
| "Bold" | yes | `04` §6.5 row 1 | |
| "Italic" | yes | `04` §6.5 row 2 | |
| "Underline" | **partial** | `04` §6.5 row 3 | Same TRAP-2 risk as above. `04` and `05` both `pnpm add @tiptap/extension-underline` and push `Underline` into the array; the toolchain findings say StarterKit v3 already registers it and double registration is a duplicate-name throw. |
| "Headings or text size variation" | yes | `04` §6.5 BlockTypeSelect | H1–H3 + Paragraph. |
| "Bulleted or numbered lists" | yes | `04` §6.5 rows 5–6, `04` §6.7 CSS | Nested-list CSS specified. |
| "the editing flow should feel usable and coherent" | yes | `04` §11 | 35 min of polish aimed at canvas + dashboard. |

### Task 2 — File Upload

| Brief requirement | Covered | Where | Evidence / gap |
|---|---|---|---|
| "upload at least one file into the product workflow" | **yes** | `05` §1 | `.md`/`.txt`/`.docx` → new document. |
| "it should be product-relevant" | yes | `05` §1.1 | Parse-and-discard; no blob storage. Well argued. |
| **"If you limit supported file types, state that clearly in the UI and README"** | **PARTIAL — will fail as written** | `05` §2.3, `04` §5.5, `08` §2.10 | Three different statements of the limit. `05` pins `IMPORT_LIMITS_COPY = 'Supported files: .md, .txt, .docx — maximum 2 MB per file.'` and ships a **committed test asserting that exact string appears in `README.md`**. `08` §2.10's VERBATIM README block is a table that does **not** contain that string → the test is red on day one. `04` §5.5's dialog copy says **"max 1 MB"** and pre-checks `file.size <= 1_048_576`, i.e. the UI rejects files the server accepts, with copy contradicting both the server and the README. |

### Task 3 — Sharing

| Brief requirement | Covered | Where | Evidence / gap |
|---|---|---|---|
| "A document owner" | yes | `00` §5, `04` §8.4 OwnerRow | Owner row always rendered. |
| "A way to grant another user access" | yes | `02` §7.10, `04` §8 | |
| "A visible distinction between owned and shared documents" | **partial** | `04` §5.2 | Four distinct signals specced, but one of them — `Shared with {shareCount} people` — reads `DocumentListItem.shareCount`, which **`02`'s `DocumentSummary` does not have**. `04` §12.1 requested it; `02` never adopted it. The card cannot render as specced. |
| "simulate users with seeded accounts / mocked auth / lightweight login" | yes | `03` §5, `04` §4.4 | Seeded + one-click demo buttons. |

### Task 4 — Persistence

| Brief requirement | Covered | Where | Evidence / gap |
|---|---|---|---|
| "Documents remain available after refresh" | yes | `01`, `06` §9 step 8 | |
| "Formatting or structure is preserved in a reasonable way" | yes | `01` §4 | ProseMirror JSON in `jsonb`; lossless by construction. Strongest argument in the set. |
| "Shared access behavior can be demonstrated" | yes | `01` §7.3 | Seed matrix makes all four access levels clickable. |
| "any practical storage approach… if well documented" | yes | `01`, `07` | |

### Task 5 — Product and Engineering Quality

| Brief requirement | Covered | Where | Evidence / gap |
|---|---|---|---|
| "Clear setup and run instructions" | **PARTIAL — will fail on a clean clone** | `08` §2 | `08` §2.6 tells the reviewer to set **`SESSION_SECRET`**; `03` §2.3 and `07` §3 read **`AUTH_SECRET`** and `03` §2.2 makes the app *refuse to boot* without it. Following the README verbatim produces a crash at module evaluation. `08` §2.9's VERBATIM demo table uses **`alice@shared-docs.dev`**; the seed (`01` §7.1) creates **`alice@example.com`** — a reviewer typing the README credentials cannot log in. `08` §2.5 and §2.8 say the local/test Postgres is on **:5433**; `06` §5.2 puts it on **:55432**. |
| "A working deployment reviewers can access" | **PARTIAL** | `07` | Runbook is strong, but **Vercel Deployment Protection is not owned by `07`**. It appears only as `09` §Open-Q2, an *unaccepted proposal*. A protected production deployment shows a Vercel SSO wall to the reviewer, looks perfectly healthy to the owner, and zeroes C14. This is the highest-consequence unowned item in the set. |
| "Basic validation and error handling" | yes (over-covered) | `02` §2, `05` §6.2 | 15 API codes + 12 import rows. See §4 — this is one of the scope-creep lines. |
| "At least one meaningful automated test" | **yes, but the flagship suite does not compile** | `06` §3 | See D1/D2. The permission matrix suite in `06` §3.3 imports `ROLES`, `CAPABILITIES` and a 4-role `can()` that `03` §6 explicitly refuses to export. Survivable — the brief needs *one* test — but the suite advertised as "the single highest-value test file in the repo" is written against a module that does not exist. |
| "A short architecture note explaining what you prioritized and why" | yes | `08` §3 | Thesis-first, 800–1200 words, hard-checked. |

### AI-Native Workflow Note

| Brief requirement | Covered | Where | Gap |
|---|---|---|---|
| "Which AI tools you used" | yes | `08` §4.1 §1 | |
| "Where AI materially sped up your work" | yes | `08` §4.1 §2 | |
| "What AI-generated output you changed or rejected" | yes | `08` §4.1 §3 + §5 log | The `docs/ai-log.md` protocol is the correct answer to this line. |
| "How you verified correctness, UX quality, and implementation reliability" | **partial** | `08` §4.1 §4 | The "correctness" answer is "the test suites and what they actually cover — the permission matrix, the import parsers, the `409` path". If the integration suite cannot run (D2), two of those three claims are false at the time the note is written. |

### Walkthrough Video

| Brief requirement | Covered | Where | Gap |
|---|---|---|---|
| "The main user flow" | yes | `09` §A.2 0:35–2:35 | |
| "What functionality works end to end" | yes | `09` §A.2 3:00 (V2 sentence) | |
| "What you intentionally deprioritized" | yes | `09` §A.2 3:38–4:08 | ≥25 s enforced in DoD. |
| "Key implementation decisions" | yes | `09` §A.2 3:00–3:38 | |
| "How AI supported your workflow" | yes | `09` §A.3 closing verbatim | |
| "3–5 minute" / "unlisted Loom or YouTube" | yes | `09` §A.6 | Loom 5-min truncation trap named. |

### Deliverables (the Drive folder)

| Brief deliverable | Covered | Where | Gap |
|---|---|---|---|
| "The source code" | yes | `09` §B.3 `git archive` | |
| "A README.md with local setup and run instructions" | partial | `08` §2 | See Task 5 row 1. |
| "A short architecture note in Markdown or PDF" | yes | `08` §3 | |
| "Your AI workflow note in Markdown or PDF" | yes | `08` §4 | |
| "A SUBMISSION.md file listing exactly what is included" | yes | `08` §6 | |
| "A live product URL we can test" | partial | `07`, `09` §B.1 | Deployment Protection gap above. |
| "A text file with the walkthrough video URL" | yes | `09` §B.1 | |
| **"Screenshots or a short demo GIF if setup requires extra steps"** | **PARTIAL — README will show broken images** | `08` §2.3 vs `09` §B.6 | `08`'s VERBATIM README block references `./screenshots/demo.gif`, `./screenshots/dashboard.png`, `editor.png`, `share-dialog.png`, `read-only.png`. `09` §B.6 puts the source of truth at **`docs/screenshots/`** with **different filenames** (`01-login-demo-accounts.png` …) and states **"No GIF"**. Every image reference in the README as written points at a file `09`'s build script never produces. A broken image is the first thing a reviewer sees. |

### Submission Format

| Brief requirement | Covered | Where | Gap |
|---|---|---|---|
| "One Google Drive folder link" | yes | `09` §B.1, §B.5 | Sharing-permission procedure is the best-specified risk in the set. |
| "A live deployment link" | partial | as above | |
| **"Any credentials, seeded users, or test accounts needed to review sharing flows"** | **PARTIAL** | `08` §2.9, `09` §B.1.2 | Email domain conflict: `shared-docs.dev` (`08`) vs `example.com` (`01`, `02` §12, `04` §4.4, `09` §A.5). This is a graded submission-format line and it is wrong in the file the reviewer reads first. |
| "Clear instructions for how to run the project locally" | partial | as above | |
| "If any feature is partial… what is working / what is incomplete / what you would build next with another 2–4 hours" | yes | `08` §6.4 | All three headings ship unconditionally. Correct call. |

### Constraints

| Brief constraint | Met? | Gap |
|---|---|---|
| "Keep the project intentionally scoped" | **NO** | 16 h of spec for an 8 h budget; six features outside the authors' own C1–C20. See §4. |
| "Do not try to build every Google Docs feature" | yes | `00` §4 non-goals are genuine. |
| "Prioritize depth in a few important areas over shallow coverage everywhere" | partial | Depth is real on access control. But import ships a **12-row error taxonomy with 9 bespoke codes**, and the API ships a full optimistic-concurrency protocol — that is depth in areas the brief did not name, funded out of the areas it did. |
| "You may use any language, framework, editor library, or tooling stack" | yes | |
| "You may use AI coding tools and assistants" | yes | |
| **"Do not require reviewers to pay for a dependency or service"** | yes, asserted | `08` §2.4 states it explicitly. Minor: `00` §2 claims Neon free tier is "always-on, no cold-start penalty for reviewers" — free-tier computes suspend when idle and take a moment to wake. Not a violation, but the claim as stated is false and it is the justification for a locked decision. |

### What We Will Evaluate

| Evaluation line | Risk | Gap |
|---|---|---|
| "turn an open-ended prompt into a coherent product slice" | ok | |
| "Full stack execution across frontend, backend, persistence, and access logic" | **at risk** | The dashboard and editor read path is **RSC → `lib/documents.ts`** (`04` §1, §12.2), while the tested path is **the route handlers** (`06` §5). `lib/documents.ts` is named by `04` and specified by **nobody**. Access logic will therefore be implemented twice and tested once — the exact drift `00` §6 rule 2 forbids. |
| "Quality of the document editing experience within the chosen scope" | at risk | TRAP-2 / extension-list split. |
| "Practical handling of file upload and sharing behavior" | at risk | Import limit copy + share DTO shape mismatches. |
| "Basic infrastructure and deployment judgment, including ability to ship a testable build" | at risk | Deployment Protection; `01` vs `07` disagree on whether `build` runs `prisma generate`. |
| **"Code clarity, maintainability, and delivery discipline"** | **actively damaged** | Two error classes (`ApiError` / `AppError`), two error funnels (`toResponse` / `toErrorResponse`), two code vocabularies (`VALIDATION_FAILED` / `VALIDATION_ERROR`, `SELF_SHARE` / `CANNOT_SHARE_WITH_SELF`), two Prisma singletons (`@/lib/db` / `@/lib/prisma`), two session modules, three capability vocabularies. A reviewer reading this repo sees indecision, not discipline. |
| "Prioritization and tradeoff awareness under time pressure" | **damaged** | This is graded, and the spec set is 2× the budget with no pre-agreed cut order. |
| "Written and verbal communication quality" | ok | `08` and `09` are the strongest slices. |
| "Mature use of AI tools without sacrificing engineering standards" | ok | `docs/ai-log.md` is the right artifact. |

### Optional Stretch

| Brief line | Assessment |
|---|---|
| "you may add **one small enhancement**" | Role-based permissions was chosen (`00` §2). Defensible — it deepens a graded requirement. |
| **"Do not sacrifice core functionality to pursue stretch work"** | **At risk, structurally.** The stretch is not separable: `ShareRole`, the 6-capability matrix, role badges, per-row role selects, `PATCH .../shares/:userId`, and a 24-cell test suite are all downstream of it. If hour 6 arrives short, **there is no lever to pull** — you cannot drop the stretch without unpicking the schema, the resolver and the tests. A stretch that cannot be cut is not a stretch. |

---

## 2. MISSING / PARTIAL items, ranked by cost at review time

| # | Item | Cost if it ships wrong | Fix |
|---|---|---|---|
| **1** | **Vercel Deployment Protection is unowned.** Only `09` §Open-Q2 (unaccepted). | **Total.** Reviewer sees an SSO wall, cannot test anything, C14 = 0. Invisible to the author, who is logged in. | Add to `07` §6 as step 3b and to `07`'s DoD: *"Settings → Deployment Protection → disabled for Production; verified from a logged-out incognito window at the hour-2 deploy."* 2 minutes. |
| **2** | **README demo credentials do not match the seed** (`alice@shared-docs.dev` vs `alice@example.com`). | Reviewer cannot log in locally. Directly fails the graded "Any credentials… needed to review sharing flows" line. | Delete the domain from `08` §2.9's VERBATIM block; make `prisma/seed.ts` print the table (`08` §9.2 already asks for this) and paste it. Pin `@example.com` in `00` §5. |
| **3** | **Extension-list split + TRAP-2 (`Underline` double registration).** `04` §3 ≠ `05` §3.3 ≠ `01` §7.4; toolchain says separate install throws. | **Total.** White screen on `/documents/[id]` for every document — kills C3–C7, the editor demo, the video, and the screenshots. | Delete `@tiptap/extension-underline` from `04` and `05`. One module at one path (`lib/editor-extensions.ts`), `05` §3.3's disabled set wins, `Placeholder` in the client-only array. Verify in the first 5 minutes, not "during the spike". |
| **4** | **Import limits stated three ways** — 1 MB (`04` UI) vs 2 MB (`05`, `06`, `08`); `IMPORT_LIMITS_COPY` absent from `08`'s README block. | Fails C8's "state that clearly in the UI **and** README"; ships a red committed test; UI rejects files the server accepts. | Pick 2 MB. Replace `08` §2.10's first line with the literal `IMPORT_LIMITS_COPY`. Change `04` §5.5 copy and the `1_048_576` pre-check. |
| **5** | **Screenshot path/name/GIF conflict** (`./screenshots/*.png` + `demo.gif` in `08` vs `docs/screenshots/NN-*.png`, no GIF, in `09`). | Broken images at the top of the README — the first thing a reviewer sees. | `09` wins (it owns the build script). Rewrite `08` §2.3 against `docs/screenshots/01..06`, delete the GIF line. |
| **6** | **Session-secret env var is `AUTH_SECRET` in `03`/`07` and `SESSION_SECRET` in `02`/`06`/`08`.** | Clean clone crashes at module evaluation (`03` §2.2 is fail-fast by design). Caught only by `08` §7.3's clean-clone run — at hour 7. | `AUTH_SECRET` wins (`03` owns it, `07` deploys it). Fix `08` §2.6, `06` §2.2, `02` §7.1. Also: `06`'s `.env.test` value `test-secret-not-for-production` is **30 chars** and `03` requires ≥32 — integration tests fail at import. |
| **7** | **`06`'s integration harness is incompatible with `03`'s session layer.** `06` §5.1/§11.4 requires handlers to never import `next/headers`; `03` §3.3 builds `readSession`/`requireSession` on `cookies()` and `02` §4's `withSession` calls `getSession()`. | The entire integration suite — the evidence for the access-control thesis — cannot run. `06`'s degradation ladder then drops to unit-only, and the DoD checkboxes in `02`, `03` and `06` that assert integration coverage all fail. | Decide now. Cheapest: `03` exports `getSessionFromRequest(req)` reading `req.headers.get('cookie')`; `withSession` uses it; only Server Components use `cookies()`. ~15 min if decided before code, ~1 h if discovered at hour 5. |
| **8** | **Permission vocabulary defined three incompatible ways.** `02` §4.1 `read\|write\|delete\|manageShares` (4, role incl. `NONE`); `03` §6 `read\|update\|rename\|delete\|viewShares\|manageShares` (6, role excl. `NONE`); `06` §3.1 `document:read\|…\|shares:manage` (6, role incl. `NONE`, 24 cells). Resolver returns `AccessRole` / `ResolvedAccess\|null` / `Role` respectively. | The flagship test file does not compile against the module it tests. Every route's guard call is ambiguous. | `03` owns `lib/permissions.ts`; adopt its 6 capabilities and its `null`-for-NONE. Then `06` §3 becomes an 18-cell matrix plus a separate "resolver returns null" integration case, and `02` §4.1 is deleted in favour of a pointer. |
| **9** | **`src/` vs no `src/`.** `01` uses `src/lib/**` (13 refs), `08` uses `src/lib/import/limits.ts`; `02`/`03`/`04`/`05`/`06`/`07` all use bare `lib/`, `app/`, `components/`. | Every `@/` import is wrong in one half of the set; `06`'s unit `include: ['lib/**/*.test.ts']` collects nothing from `src/lib/**`. No spec owns `tsconfig.json` or the alias. | Pick bare `lib/` (6 specs vs 2). Rewrite `01` §1 and §8. Add `tsconfig.json` ownership to `01` or `02`. |
| **10** | **Unit tests live in four different places.** `06` collects only `lib/**/*.test.ts`; `03` writes `tests/unit/permissions.test.ts`; `05` writes `tests/unit/import/*.test.ts` and `tests/unit/import-limits-copy.test.ts`; `01` writes `src/lib/documents/content.test.ts`. | Three specs' unit tests are collected by **no Vitest project** and silently never run. `pnpm test:unit` reports green on a suite that is mostly absent. | Adopt `06`'s convention (`lib/**/*.test.ts`, colocated) everywhere, or widen the glob. Either way, one sentence in `00`. |
| **11** | **`docker-compose.test.yml` is fully specified twice, incompatibly.** `01` §6.1: port 5433, user `shared_docs`, dev DB + init-script test DB, named volume. `06` §5.2: port 55432, user `test`, `shared_docs_test` only, tmpfs. `08` §2.5/§2.8 documents 5433. | One file, one path. Whichever ships, the other spec's setup instructions and `.env.test` are wrong, and `06`'s global-setup safety rail (`url.includes(':55432/')`) throws. | `06` wins for the test DB (tmpfs + safety rail is the better design). `01` adds a second `docker-compose.yml` for dev, or reuses 55432. Fix `08` §2.5/§2.8. |
| **12** | **`204` vs "there are no `204`s".** `02` I1: *"Every response — success and failure — has a JSON body. There are no `204`s."* `03` §6 (DELETE document) and §9.4 (DELETE share) both return `204`. `04` §8.4: *"waits for the `204`"*. | A stated global invariant that the code violates is worse than no invariant — a reviewer reading `02` §1 and then `03` §9.4 sees a contract nobody enforced. | `02` wins (its `ok()`/`fail()` plumbing assumes a body). Rewrite `03` §6 and §9.4 to `200 {ok:true,…}` and `04` §8.4. |
| **13** | **Double-revoke semantics are opposite.** `02` §7.11: `404 SHARE_NOT_FOUND`, explicitly *"not idempotent"*, in its DoD. `03` §9.4: `deleteMany`, `204` twice, in its DoD. `06` DoD asserts *"DELETE of a share returns 204 on the second call too"*. | Two DoD checklists cannot both be satisfied. A reviewer double-clicking Remove hits whichever shipped. | `03`'s idempotent version is the better UX and the cheaper code. Rewrite `02` §7.11 and its DoD row. |
| **14** | **Import status codes are opposite.** `05` §6.2 and `02` §1.1: `415` unsupported type, `413` too large. `06` §5.7 **P0** cases 16/17 and §5.6 table: **`400`** for both. | Two P0 test rows are red whatever ships. | `415`/`413` win. Rewrite `06` §5.6 and cases 16/17. |
| **15** | **Import error codes are two disjoint sets.** `02` §2: `FILE_MISSING`, `UNSUPPORTED_FILE_TYPE`, `FILE_TOO_LARGE`, `PARSE_FAILED`. `05` §6.2: `IMPORT_NO_FILE`, `IMPORT_UNSUPPORTED_TYPE`, `IMPORT_FILE_TOO_LARGE`, `IMPORT_EMPTY_FILE`, `IMPORT_NOT_TEXT`, `IMPORT_CORRUPT_FILE`, `IMPORT_EMPTY_RESULT`, `IMPORT_CONTENT_TOO_LARGE`, `IMPORT_UNSUPPORTED_CONTENT`. `05` §12.1 concedes "**02 wins**" but nobody applied it. | `ApiErrorCode` is a compile-time union; the import route will not typecheck against `lib/api-types.ts`. | Apply `05` §12.1: collapse to `02`'s four codes. Deletes ~5 error paths and ~25 min of work (see §4). |
| **16** | **`ShareEntry` has two shapes** — `02` §3 `{userId, user: UserSummary, role, grantedAt}` vs `04` §1.1 `{userId, name, email, role}`. And `DocumentDetail.shares` is `ShareEntry[] \| null` (`02`, "null not `[]`, deliberately") vs `shares?: ShareEntry[]` (`04`) vs `expect(body.shares).toBeUndefined()` (`06` case 2). | Share dialog renders `undefined.name`; `06` case 2 fails because `JSON.stringify({shares:null})` is `null`, not `undefined`. | `02` wins. Rewrite `04` §1.1 and `06` case 2. |
| **17** | **`DocumentSummary` has no `shareCount`**, but `04` §5.2 renders "Shared with 2 people" from it and lists it in its DoD. | The owned-vs-shared distinction (C11, graded, "must be obvious in a screenshot") is one signal short. | Adopt `04` §12.1: add `shareCount` via `_count.shares` to `02` §3 and §7.4. ~5 min. |
| **18** | **`session.id` vs `session.userId`.** `02` §4, `03` §3.2 use `.id`; `04` §2, `05` §6.3, §7.4 use `.userId`. | Trivial to fix, guaranteed to waste 10 minutes at hour 4 if not fixed now. | `.id` wins (`03` owns `SessionUser`). |
| **19** | **The RSC read path is unspecified and untested.** `04` §1 mandates Server Components call `lib/documents.ts` (`listDocumentsFor`, `getDocumentFor`) directly; no spec defines that module. `06` tests only the route handlers, which `04` §12.2 concedes the app's own pages never call. | The access-control code a reviewer actually exercises by browsing has **zero** automated coverage. Two implementations of "what may this person do", which `00` §6 rule 2 forbids. | Either (a) assign `lib/documents.ts` to `02` and require both handlers and RSC to call it, so one test covers both; or (b) drop the RSC direct-read rule and let pages fetch the API. (a) is cheaper. |
| **20** | **Version pins contradict the only registry-verified document.** `_toolchain-findings.md` (checked against npm, and states it *overrides* other specs): Next **16.3.4**, Prisma **7.10.0**, Vitest **4.1.11**, `marked` **18.0.11**, `mammoth` **1.12.2**. Against: `00` §2 "Next.js 15"; `03` §5.3 "we pin a patched Next.js 15"; `01` §2 "**stay on the Prisma 6.x line for the whole assessment**"; `07` §5.1 "assumes Prisma 6.x"; `06` §2 vitest `^3.2.4`; `05` §3.1 `marked ^15`, `mammoth ^1.9`. | Prisma 6 vs 7 is not cosmetic — `01` §2 warns Prisma 7 moves seed registration into `prisma.config.ts`, so `package.json#prisma.seed` (used by `01`, `07`, `08`) silently stops working. Vitest 3 vs 4 changes `test.projects`. | One reconciliation pass over `00` §2 before any `pnpm add`. 10 minutes now, an hour later. |
| **21** | **Zod is pinned three ways.** `01` §2: "**Zod 4, not 3**", uses `z.looseObject()`. `02` §8: "`zod@3.25.76` — exact, not `^`… every schema in this document is Zod v3". `06` §2: `^4.0.0`, and its content schema uses Zod 4 `ctx.addIssue({code:'custom'})` and `z.record(k,v)`. | Whichever ships, one spec's schemas do not compile and one spec's `details` shape (`flatten()`) is wrong. | Zod 4 (2 specs to 1, and `01`'s guard is the smaller rewrite). `02` §8's worked `details` example and `.datetime()` need updating to `z.iso.datetime()`. |
| **22** | **`build` script conflict.** `01` §2: `"build": "prisma generate && next build"`, with an explicit rationale that a cached `node_modules` skips `postinstall`. `07` §5.1/§5.3: `"build": "next build"`, "the build command stays `next build`". | `07` is the deployment authority but has the weaker argument — and `07` §8's own troubleshooting table lists exactly the failure `01` is defending against ("cached `node_modules` skipped it"). | `01` wins. One-word fix in `07` §5.1 and its DoD row. |
| **23** | **Content guard specified twice, incompatibly.** `01` §5 is a deliberate ~10-line root-shape guard, with §5.2 giving five reasons *not* to validate deeper. `06` §4.3 specifies a recursive `z.lazy` `NodeSchema` + `MAX_CONTENT_DEPTH` + 12 test rows — approximately the hour `01` refused to spend. Byte-size measured as `Buffer.byteLength` (`01`) vs `JSON.stringify(...).length` (`02`, `06`). | ~30 min of unbudgeted work, plus a second source of truth for the document schema. | `01` wins. Cut `06` §4.3 to `01`'s guard and 5 test rows. |
| **24** | **`00`'s C-list has no owner for two shipped behaviours.** No C-row covers delete or conflict handling, yet both are specced in depth and both appear in the video script and the smoke test. | The acceptance criteria are supposed to be the definition of done; if they do not cover what ships, they cannot be used to decide what to cut at hour 6. | Either add C21/C22 or (better, see §4) cut both features. |
| **25** | **`00` §9 R5 reserves 2 h for "docs, video, and submission"; `08` measures 2 h 15 and `09` measures 1 h 45 — 4 h against a 2 h reserve.** Both specs flag it (`08` §9.1, `09` §Open-Q1); neither is resolved. | Docs and video are five graded brief lines and the last thing done by a tired person. This is where the overrun actually lands. | Freeze features at **hour 4:30**, not 6. See §5. |
| 26 | Minor, but real: `05` §6.3's route sketch calls `requireSession()` then `if (!session)` — `03`'s `requireSession` throws, so the branch is dead; and it returns `Response.json({id}, {status:201})`, bypassing `ok()`/`fail()` and violating `02`'s DoD ("no route constructs an error body by hand") and its `201 DocumentSummary` contract. | 10 min of rework. | Rewrite `05` §6.3 against `02` §4's plumbing. |
| 27 | `.nvmrc` is asserted by `08` §2.4 and §7.2 and requested by `06` §11.7 but owned by no spec. `engines` appears only in `07` §5.1. `next.config.ts` is owned only incidentally by `05` §3.1. `tsconfig.json` / `@/*` alias — owned by nobody, depended on by `06` §2. | Small individually; collectively they are the files that make a clean clone work. | Assign all four to `01` (project-setup owner by default) in one line. |
| 28 | `06` §4.1 accepts **`.markdown`** (`deriveTitle` table row 5, `checkImportFile` table row 5). `05` §2.1 rule 1: *"We deliberately do not accept `.markdown`"*. Function is `deriveTitle` in `06`, `titleFromFilename` in `05`. | Two red test rows, one duplicated function. | `05` wins. Rewrite `06` §4.1/§4.2. |
| 29 | `06` case 13 expects `201` for a new share; `02` §7.10 and `03` §9.3 both mandate always-`200`. `06` §11.2 flags it. | One P1 row red. | `200` wins; delete `06` case 13's status assertion. |
| 30 | `09` §A.4 requires a `pnpm db:reset` script ("truncates `Document`/`DocumentShare`, re-runs the seed"). No spec defines it, and `01` §7.6 forbids `deleteMany` anywhere in the seed and forbids `migrate reset` against Neon. | Pre-recording reset either does not exist or violates `01`. | Define `db:reset` in `01` as a separate script (not the seed), or drop it and rely on the seed's restore-to-canonical `update` branch, which `01` §7.6 says is already the feature. |

---

## 3. Contradiction register (one-line index)

Every row is two specs asserting incompatible things about the same artifact. Count: **22**.

| Artifact | Spec A | Spec B |
|---|---|---|
| Extension list module + contents | `04` §3 `lib/editor/extensions.ts` (+Placeholder, nothing disabled) | `05` §3.3 `lib/editor-extensions.ts` (6 nodes disabled) / `01` §7.4 `src/lib/editor/extensions.ts` |
| `@tiptap/extension-underline` | `04`, `05` install it | `_toolchain-findings` TRAP-2: throws |
| Import size cap | `04` §5.5 1 MB | `05` §2.2 / `06` §4.2 / `08` §2.10 2 MB |
| Import limits copy | `05` §2.3 exact string, test-enforced | `08` §2.10 table, string absent |
| Import error codes | `02` §2 (4 codes) | `05` §6.2 (9 codes) |
| Import status codes | `02`/`05` 415/413 | `06` §5.6, cases 16/17 400/400 |
| `.markdown` accepted | `06` §4.2 yes | `05` §2.1 no |
| Title function | `05` `titleFromFilename` | `06` `deriveTitle` |
| Capability vocabulary | `02` §4.1 (4) | `03` §6 (6) / `06` §3.1 (6, prefixed) |
| `NONE` in the role union | `02`, `06` yes | `03` §6 no (`null`) |
| Resolver signature | `02` `Promise<AccessRole>` | `03` `Promise<ResolvedAccess\|null>` / `06` `Promise<Role>` |
| Guard function name | `02` `requireAccess` | `03` `requireCapability` |
| Error class | `02` `ApiError` + `toResponse` | `03` `AppError` + `toErrorResponse` |
| Validation code | `02` `VALIDATION_FAILED` | `03`/`06` `VALIDATION_ERROR` |
| Self-share code | `02` `SELF_SHARE` | `03`/`04`/`06` `CANNOT_SHARE_WITH_SELF` |
| Cookie name | `02` §7.1 `sd_session` | `03` §3.1 `shared_docs_session` |
| Session secret var | `02`/`06`/`08` `SESSION_SECRET` | `03`/`07` `AUTH_SECRET` |
| Session read | `03` `cookies()` | `06` §11.4 forbids `next/headers` in handlers |
| Prisma singleton path | `01`/`06` `@/lib/db` | `03`/`07` `@/lib/prisma` |
| Source root | `01`/`08` `src/lib/**` | all others bare `lib/**` |
| `204` responses | `02` I1 forbids | `03` §6/§9.4, `04` §8.4 use |
| `docker-compose.test.yml` | `01` §6.1 :5433 | `06` §5.2 :55432 |
| Zod major | `01` v4 | `02` v3 exact / `06` v4 |
| Prisma major | `01` §2 6.x, `07` 6.x | `_toolchain` 7.10.0 |
| Next major | `00`/`03` 15 | `_toolchain` 16.3.4 |
| `build` script | `01` `prisma generate && next build` | `07` `next build` |
| Content guard depth | `01` §5 root only | `06` §4.3 recursive + depth cap |
| Seed emails | `01`/`02`/`04`/`09` `@example.com` | `08` `@shared-docs.dev` |
| Screenshots | `08` `./screenshots/*` + GIF | `09` `docs/screenshots/NN-*`, no GIF |
| Share DTO | `02` `{userId,user,role,grantedAt}` | `04` `{userId,name,email,role}` |
| `shares` when not owner | `02` `null` | `04` optional / `06` `undefined` |
| Double revoke | `02` `404`, non-idempotent | `03`/`06` `204`, idempotent |
| New-share status | `02`/`03` always `200` | `06` case 13 `201` |
| Session user field | `02`/`03` `.id` | `04`/`05` `.userId` |

`03` also references three specs by filenames that do not exist in this set (`04-api-and-validation.md`,
`05-editor-and-autosave.md`, `07-testing.md`), and `06`/`08`/`09` refer to siblings "by role" because
numbering was unfixed. An implementation agent following `03`'s cross-references reaches nothing.

---

## 4. Specced but not asked for — scope creep, with hours

Measured against **`00-foundation.md` §3 C1–C20**, which is the authors' own traceability to the brief.
Nothing below maps to a C-row or to a brief line.

| Feature | Where | Est. | Why it is creep |
|---|---|---|---|
| **Optimistic concurrency / 409 conflict** — `lastKnownUpdatedAt` on every PATCH, conditional `updateMany`, `ConflictDetails`, sequence diagram, client token ref + serialised in-flight PATCH, `conflict` state, `ConflictDialog`, "Copy my text", integration case 6, video beat 3:00 | `01` §5.3, `02` §6 (whole section), `04` §6.6/§6.9/§7.3, `06` case 6, `09` §A.2 | **~1 h 15** | The brief asks for "Save and reopen documents" and "Basic validation and error handling". It never asks for concurrency control. The *argument* for it — honesty about not building realtime — is worth making, and costs **one paragraph in `ARCHITECTURE.md`**, not 75 minutes of client and server state machine. This is the single largest unasked-for feature in the set. |
| **`DELETE /api/documents/:id`** + `⋯` menu + confirm dialog + toast + `router.refresh()` + 2 tests | `02` §7.9, `04` §5.3, `06` case 8 | **~25 min** | No brief line, no C-row. `04` §11 already lists it as descope lever 2. |
| **`GET /api/users` + `UserAutocomplete`** (hand-rolled combobox, ~50 lines, AbortController, arrow-key nav, "Already shared" suffix, debounce) | `02` §7.12, `04` §8.3 | **~35 min** | The brief needs "a way to grant another user access". A plain email input does that. This endpoint additionally creates a user-enumeration hole that then costs three paragraphs of defence in `ARCHITECTURE.md` (`02` §7.12 note, `03` §5.1 note + §11 + §12.2, `08` §3.4 required row). Cutting it removes the feature *and* the apology. `04` §11 lists it as descope lever 1. |
| **`PATCH /api/documents/:id/shares/:userId`** + per-row role `Select` + optimistic update + rollback toast | `02` §7.11, `03` §9.5, `04` §8.4 | **~20 min** | Revoke-and-re-share achieves the same outcome with endpoints that already exist. |
| **Import error taxonomy**: 9 bespoke codes, 12-row table, binary NUL sniff + strict UTF-8 decode, node/char budget (20k/400k) with a recursive `measure()` walk, decompression-bomb analysis, `IMPORT_EMPTY_RESULT`, `IMPORT_UNSUPPORTED_CONTENT` | `05` §3.8, §6.2, §7.3 | **~40 min** | Brief: "Basic validation and error handling". Four checks (missing / unsupported extension / too large / parse failed) satisfy it. |
| **`06` §4.3 deep content guard** — recursive `z.lazy` node schema, `MAX_CONTENT_DEPTH`, 12 test rows | `06` §4.3 | **~30 min** | `01` §5.2 spends five numbered paragraphs explaining why not to build this, then `06` builds it. |
| **`beforeunload` + `keepalive` unmount flush + route-change interception on two link components** | `04` §7.3 | **~20 min** | Blur-flush already covers the realistic case. |
| **`loading.tsx` skeletons for two routes** (header + 2 headings + 6 skeleton cards; skeleton toolbar + 6 text lines) | `04` §2.1 | **~25 min** | Server render is fast; the skeletons are never seen. (`not-found.tsx` earns its place — it is the UI half of the 403/404 story — and should stay.) |
| **Undo / Redo toolbar buttons** with `canUndo`/`canRedo` derived in the `useEditorState` selector | `04` §6.5 rows 7–8 | **~15 min** | Not in the brief's formatting list. ⌘Z works regardless. `editor.can().chain()...` in a selector runs on every transaction. |
| **`scripts/build-submission.sh`** | `09` §B.4 | **~15 min** | Automating a five-command operation performed once. |
| **`tests/unit/import-limits-copy.test.ts`** (README-contains-string test) | `05` §2.3 | **~10 min** | Currently guaranteed red (see D4). |
| **`samples/` with a hand-authored `sample.docx`** | `08` §9.3 | **~10 min** | |
| **`/api/health`** | `07` §0 | ~5 min | The one piece of creep that pays for itself — it answers all four hour-2 checkpoint questions in one request. **Keep.** |
| **Six screenshots (`09`) + four screenshots and a GIF (`08`)** | `08` §2.3, `09` §B.6 | **~30 min** for the union | Brief: "Screenshots **or** a short demo GIF". Four stills is compliance. |

**Creep total: ≈ 4 h 25 of a stated 8 h budget.**

---

## 5. Is 8 hours credible? No.

**Stated slice budgets:**

| Slice | Stated | Source |
|---|---:|---|
| `01` data & persistence | 1.25 h | §"Slice budget" |
| `02` API contract | 2.00 h | §14 |
| `03` auth & permissions | **not stated** | — |
| `04` UI | 3.50 h | §"Slice budget" / §11 |
| `05` import | 2.00 h | §11 |
| `06` tests | 1.50 h (self-measured **1.9 h**) | §10 |
| `07` deployment | **not stated** | — |
| `08` docs | 2.25 h | §8 |
| `09` video & submission | 1.75 h | §"Time budget" |
| **Sum of stated** | **14.25 h** | |

`03` owns `lib/env.ts`, two session modules, `lib/password.ts`, `lib/permissions.ts`, `lib/errors.ts`,
`middleware.ts`, three auth routes and two test files — **≥1.25 h**. `07` owns Neon setup, Vercel setup,
three deploys and three smoke-test runs — **≥0.75 h** of wall clock that cannot be parallelised with
anything.

> **Realistic total: ≈16 h. Overrun: 2×.**

Two specs already noticed and neither resolved it: `08` §9.1 ("R5's two-hour reserve does not fit docs
*and* video") and `09` §Open-Q1 ("This slice alone measures at 1h45, which leaves ~15 minutes for
README + ARCHITECTURE + AI-WORKFLOW + SUBMISSION"). Their proposed fix — freeze at 5:30 and reserve
2.5 h — closes a 2 h gap in an 8 h overrun. It is not enough.

`00` §9 R5's schedule ("deploy at hour 2, freeze features at hour 6, reserve the last 2 h") is
therefore already false on its own numbers before a line is written.

### Recommended cuts, in the order to take them

Take **1–7** unconditionally, before implementation starts. They are ~4 h and none of them touches a
brief line or a C-row.

| # | Cut | Saves | Brief impact |
|---|---|---:|---|
| 1 | **The entire optimistic-concurrency / 409 system.** Server: drop `lastKnownUpdatedAt`, plain `update`. Client: drop the token ref, the `conflict` state, `ConflictDialog`, "Copy my text". Drop `02` §6, `06` case 6, `09`'s 409 beat. | **1 h 15** | None. Replace with one `ARCHITECTURE.md` paragraph: "last write wins; here is the failure mode; here is what I would build". The brief grades the *reasoning*, and the reasoning is free. |
| 2 | **`GET /api/users` + `UserAutocomplete`.** Share by typed email only. Deletes the enumeration trade-off from `02` §7.12, `03` §5.1/§11/§12.2 and the required row in `08` §3.4. | **35 min** + ~10 min of prose | None. |
| 3 | **Collapse the import error taxonomy to `02`'s four codes.** Drop the NUL sniff, the node/char budget, `IMPORT_EMPTY_RESULT`, `IMPORT_UNSUPPORTED_CONTENT`, the bomb analysis. Keep `assertLoadableByEditor` — it is the one check that prevents a white screen. | **40 min** | None. Also resolves D14 and D15. |
| 4 | **`06` §4.3 → `01` §5's ten-line guard**, 5 test rows not 12. | **30 min** | None. Also resolves D23. |
| 5 | **`DELETE` document + `PATCH` share role**, and their UI, dialogs and tests. | **45 min** | None. |
| 6 | **`loading.tsx` skeletons, undo/redo buttons, `beforeunload`/keepalive flush, `build-submission.sh`, the README-copy test, `samples/`.** | **1 h 35** | None. Keep `not-found.tsx`. |
| 7 | **One screenshot set: four stills from `09`'s list, no GIF.** | **15 min** | "Screenshots **or** a GIF" — either satisfies it. |
| **Subtotal 1–7** | | **≈5 h 25** | |

That brings ≈16 h to ≈10.5 h. The remaining 2.5 h must come from the two largest surviving slices:

| # | Cut | Saves | Brief impact |
|---|---|---:|---|
| 8 | **Drop the integration suite; ship the unit suite only** (permission matrix + import validators + content guard). This is `06`'s own §8 degradation ladder, taken at hour 0 instead of hour 6. | **50 min** + it deletes contradictions 7, 11, 14, 16, 29 outright | C16 says "**at least one** meaningful automated test". The matrix is the meaningful one. State the gap in `SUBMISSION.md` under "what I would build next" — `06` §6 already has the wording. |
| 9 | **Cut `04`'s share-dialog polish**: no optimistic role update + rollback, no per-row spinner/`aria-busy`, no skeleton share rows. | **25 min** | None. |
| 10 | **Docs slice 2 h 15 → 1 h 30**: `ARCHITECTURE.md` 600–800 words and 5 sections, not 800–1200 and 8. Keep `docs/ai-log.md` — it is 15 min and it is the only thing that makes the AI note (a graded deliverable) writable. | **45 min** | Low. The brief says "**short** architecture note". |
| 11 | **Video slice 1 h 45 → 1 h 15**: one take, four screenshots, no build script, prep folded into the manual-QA run that `06` §9 already requires. | **30 min** | None. |
| **Subtotal 8–11** | | **≈2 h 30** | |

**Result: ≈8 h**, with the deploy at hour 2 and a feature freeze that can actually be at hour 5:30.

### The one cut to take if you take only one

**Cut the optimistic-concurrency system (#1).** It is the largest single block of work in the set that
maps to no brief line and no C-row; it is the source of the `409` plumbing in five specs; and its entire
value — demonstrating awareness that you did not build realtime collaboration — is captured by a
paragraph in `ARCHITECTURE.md` and one sentence in the video, both of which you are writing anyway.

### The one thing to fix if you fix only one

**Vercel Deployment Protection (D1).** Everything else in this document degrades the submission. That
one silently zeroes it.

---

## 6. Do this before writing any code (≈45 minutes, in this order)

1. Amend `00-foundation.md` §2 with the reconciled versions from `_toolchain-findings.md` (Next, Prisma,
   Vitest, Zod, marked, mammoth) and settle **Zod 4** and **bare `lib/`**.
2. Amend `00-foundation.md` §3 with the cut list from §5 above, so C1–C20 remain the definition of done.
3. Delete `@tiptap/extension-underline` from `04` and `05`; one extension module at `lib/editor-extensions.ts`.
4. Pin `AUTH_SECRET`, `@/lib/prisma`, `session.id`, `@example.com`, `200`-not-`204`, `415`/`413`,
   `02`'s four import codes, `03`'s 6-capability matrix with `null`-for-NONE — one table in `00` §2.
5. Add "Deployment Protection disabled, verified from incognito" to `00` §9 R2 and `07` §6.
6. Decide the session-read shape (`getSessionFromRequest` vs `cookies()`) **or** take cut #8 and make the
   question moot.
7. Assign owners for `tsconfig.json`, `.nvmrc`, `next.config.ts`, `engines`, and `lib/documents.ts`.

Every one of these is a five-minute edit now and an hour of debugging at hour 5.
