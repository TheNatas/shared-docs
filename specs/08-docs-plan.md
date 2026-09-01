# 08 — Documentation Plan

**Purpose.** This spec owns the four graded prose deliverables (`README.md`,
`ARCHITECTURE.md`, `AI-WORKFLOW.md`, `SUBMISSION.md`), the running build journal
(`docs/ai-log.md`) that makes the AI note truthful instead of reconstructed, and the
quality gate every one of them must pass before submission. It does **not** own the
walkthrough video, the Drive folder assembly, or the deploy itself — it only defines the
artifacts those depend on. Constraints inherited from `00-foundation.md`: ~8 hours total,
docs get **~2h15m** of it (§8 below), and roughly 15 minutes of that is spent *during* the
build, not at the end. Everything here is sized to be finished by a tired person at hour 7.

---

## 1. Deliverable inventory

| File | Location | Owner spec | Target size | When written |
|---|---|---|---|---|
| `README.md` | repo root | this spec | ~250–350 lines | hour 6.5 |
| `ARCHITECTURE.md` | repo root | this spec | **800–1200 words** (hard) | hour 6.75 |
| `AI-WORKFLOW.md` | repo root | this spec | 600–900 words | hour 7.25 |
| `SUBMISSION.md` | repo root | this spec | ~120 lines | hour 7.5 |
| `docs/ai-log.md` | repo | this spec | grows to ~8–12 entries | **continuously, from hour 0** |
| `live-url.txt` | repo root | deploy spec | 1 line | hour 2, updated at freeze |
| `walkthrough-video-url.txt` | repo root | video spec | 1 line | hour 7.75 |
| `docs/screenshots/` | repo | **`09-video-and-submission.md` §B.6** | **6 PNG, no GIF** | hour 7 |

All four prose files live at the repo root so a reviewer who clones sees them immediately,
and are copied (not moved) into the Drive folder at submission time.

**Placeholder convention.** Any value not yet known when a doc is drafted is written as the
literal token `TKTK` — never `TODO`, never `<placeholder>`, never a blank. `TKTK` is chosen
because it appears in no real English word, no URL, and no code identifier, so a single grep
finds every one of them. The quality gate in §7.1 is `grep -rn TKTK` returning nothing.

---

## 2. `README.md`

### 2.1 Section-by-section outline

Headings, in order. Anything marked **VERBATIM** is copy to ship as written below;
everything else is an outline the writer fills in at hour 6.5.

```markdown
# shared-docs
<one-paragraph what-it-is>                                    ← VERBATIM (§2.2)
<links block: live demo, demo login>                          ← VERBATIM (§2.2)

## Demo
<screenshot / GIF slot>                                       ← VERBATIM (§2.3)

## What it does
<bulleted capability list, 6–8 bullets>

## Tech stack
<table: layer | choice | why in five words>

## Prerequisites
<table with a Required? column>                               ← VERBATIM (§2.4)

## Quick start
<copy-pasteable clean-clone sequence>                          ← VERBATIM (§2.5)

## Environment variables
<table + .env.example note>                                    ← VERBATIM (§2.6)

## Database setup
<migrate + seed, and how to reset>                             ← VERBATIM (§2.7)

## Running the app
<dev, build, start>

## Running the tests
<unit vs integration, and the Docker caveat>                   ← VERBATIM (§2.8)

## Demo accounts
<the seeded accounts table, password in plain text>            ← VERBATIM (§2.9)

## File import
<IMPORT_LIMITS_COPY verbatim as the first line>                ← VERBATIM (§2.10)

## Project structure
<annotated tree, one line per directory>

## Known limitations
<the honest list>                                              ← VERBATIM (§2.11)

## Further reading
<links to ARCHITECTURE.md, AI-WORKFLOW.md, SUBMISSION.md>
```

Not included, deliberately: a contributing guide, a licence beyond one line, a badge row,
a roadmap, an FAQ. None of them earn a minute of the budget.

### 2.2 Header and links block — VERBATIM

```markdown
# shared-docs

A small collaborative document product: sign in, write rich text in the browser, import a
`.md` / `.txt` / `.docx` file into a new document, and share what you own with other users
as a **viewer** or an **editor**. Everything autosaves to Postgres and survives a refresh.

It is not a Google Docs clone, and it is not trying to be — see
[ARCHITECTURE.md](./ARCHITECTURE.md) for what was prioritised and what was deliberately cut.

| | |
|---|---|
| **Live demo** | TKTK |
| **Sign in as** | `alice@example.com` · password `demo1234` |
| **All demo accounts** | [see below](#demo-accounts) |
```

The `TKTK` is replaced with the Vercel URL the moment the deploy is green (hour 2), not at
the end. The live URL appears in exactly three places — here, `SUBMISSION.md`, and
`live-url.txt` — and §7.2 checks all three are byte-identical.

### 2.3 Demo slot — VERBATIM

```markdown
## Demo

![Dashboard: My documents and Shared with me](./docs/screenshots/02-dashboard-owned-and-shared.png)

<details>
<summary>More screenshots</summary>

| | |
|---|---|
| ![Sign-in with one-click demo accounts](./docs/screenshots/01-login-demo-accounts.png) | ![Editor with the formatting toolbar](./docs/screenshots/03-editor-formatting-toolbar.png) |
| ![Share dialog with viewer/editor roles](./docs/screenshots/04-share-dialog-role-select.png) | ![Read-only state shown to a viewer](./docs/screenshots/05-viewer-read-only-state.png) |
| ![Server-side 403 vs 404](./docs/screenshots/06-permission-403-vs-404.png) | |

</details>
```

**Paths and filenames are `09-video-and-submission.md` §B.6's**, which owns the capture list and the
build script that copies them into the Drive folder. This section previously embedded
`./screenshots/demo.gif`, `dashboard.png`, `editor.png`, `share-dialog.png` and `read-only.png` —
five files that nothing in the spec set ever produced, i.e. five broken images at the top of the
GitHub landing page.

**There is no GIF.** The brief says "screenshots **or** a short demo GIF"; the video already carries
motion, and a GIF is ~20 minutes for no additional marks. If a `README.md` image is ever missing, the
line is **deleted**, not left pointing at nothing — a broken image is the single most common thing a
reviewer notices first.

### 2.4 Prerequisites — VERBATIM

```markdown
## Prerequisites

| Tool | Version | Required? | Notes |
|---|---|---|---|
| Node.js | **22.x** | Yes | `.nvmrc` pins it. `nvm use` picks it up. |
| pnpm | **10.x** | Yes | `corepack enable && corepack prepare pnpm@10 --activate` |
| PostgreSQL | **16.x** | Yes | Any instance. A free [Neon](https://neon.tech) database works and takes about a minute to create. |
| Docker + Compose | any recent | **No** | Only needed for `pnpm test:integration`. It is also the fastest way to get the Postgres above — see [Database setup](#database-setup). |

You do not need a paid account for anything in this project.
```

That last line answers the brief's "do not require reviewers to pay for a dependency or
service" explicitly rather than leaving the reviewer to infer it.

### 2.5 Quick start — VERBATIM

````markdown
## Quick start

From a clean clone, in order:

```bash
git clone https://github.com/TheNatas/shared-docs.git
cd shared-docs
corepack enable && corepack prepare pnpm@10 --activate
pnpm install

cp .env.example .env
# open .env and fill in DATABASE_URL, DIRECT_URL and AUTH_SECRET — see below

pnpm db:up                    # optional: local Postgres on :55432 (docker-compose.test.yml)
pnpm prisma migrate deploy    # create the schema
pnpm db:seed                  # create the three demo users + five documents
pnpm dev                      # http://localhost:3000
```

Open <http://localhost:3000>, click **Sign in as Alice**, and you are in.
````

Notes for the writer, not for the README:

- `migrate deploy`, not `migrate dev` — `dev` prompts interactively and can offer to reset
  the database, which is a terrible first experience for a reviewer.
- The compose line is the *optional* Postgres. If it is used, `DATABASE_URL` and `DIRECT_URL` both
  point at **`postgresql://test:test@localhost:55432/shared_docs_dev`** — port **55432**, user
  `test`, database `shared_docs_dev`. That is the one container `06-test-plan.md` §5.2 defines
  (`shared_docs_test` lives in it too, for `pnpm test:integration`). That exact string goes in
  `.env.example` as a commented-out line so it is one uncomment away. It is **not** 5433 and not
  `postgres:postgres`; those values appeared in an earlier draft and match no compose file in the
  repo.
- Every one of these commands is run for real in §7.3. If one of them needs an extra step,
  the extra step goes in the block — not in a paragraph underneath it.

### 2.6 Environment variables — VERBATIM

```markdown
## Environment variables

Copy `.env.example` to `.env` and fill in three values.

| Variable | Required | What it is |
|---|---|---|
| `DATABASE_URL` | Yes | Pooled Postgres connection string, used by the app at runtime. On Neon this is the connection string labelled **Pooled connection**. |
| `DIRECT_URL` | Yes | Unpooled connection string, used **only** by `prisma migrate`. On Neon this is the **Direct connection**. Running locally, set it to the same value as `DATABASE_URL`. |
| `AUTH_SECRET` | Yes | HS256 signing key for the session cookie. Any **32+** character random string: `openssl rand -base64 32`. The app refuses to boot without it, by design. |

`.env` is gitignored. Nothing else is configurable — there are no feature flags and no
optional services.

(`.env.test`, used only by `pnpm test:integration`, is committed and holds `TEST_DATABASE_URL`,
`DIRECT_URL` and a throwaway `AUTH_SECRET`. It contains no secret of value.)
```

### 2.7 Database setup — VERBATIM

````markdown
## Database setup

```bash
pnpm prisma migrate deploy   # apply migrations to an empty database
pnpm db:seed                 # insert the three demo users and their documents
```

The seed is **idempotent**: it upserts by email, so running it twice is safe and will not
duplicate users or documents.

To start over:

```bash
pnpm prisma migrate reset    # drops, re-migrates, and re-seeds
```
````

`prisma migrate reset` runs the seed automatically because `prisma.config.ts` registers it — on the
Prisma 7 pin (`00-foundation.md` §2a) a `prisma.seed` key in `package.json` is silently ignored.
Verify this during §7.3 rather than assuming it; a reset that quietly skips the seed leaves a
reviewer staring at an empty dashboard.

### 2.8 Running the tests — VERBATIM

````markdown
## Running the tests

```bash
pnpm test:unit          # permission matrix + import parsing — no database, no Docker
pnpm test:integration   # API route tests against a real Postgres (needs Docker)
pnpm test               # both
```

`pnpm test:unit` has **no external dependencies** and is the one to run if you only want to
run one thing. It covers the access-control matrix (owner / editor / viewer / no-access
against every capability), which is where the interesting logic lives.

`pnpm test:integration` starts a throwaway Postgres on port **55432** via
`docker-compose.test.yml`, pushes the schema into it, and exercises the API routes end to end. The
container is RAM-backed and disappears with `pnpm db:test:down`. If Docker is not running, this
suite will fail to connect — that is expected, not a bug.
````

The promise "no database, no Docker" for `test:unit` comes from `00-foundation.md` §9 R3
and is load-bearing for reviewers. If the unit suite ever grows a database dependency, this
paragraph is a lie and the suite is wrong, not the paragraph.

### 2.9 Demo accounts — VERBATIM

```markdown
## Demo accounts

All three accounts share the password **`demo1234`**. The login page has one-click buttons
for each, so you do not need to type them.

| Name | Email | Password | Set up so that… |
|---|---|---|---|
| Alice | `alice@example.com` | `demo1234` | owns four documents and has shared three of them |
| Bob | `bob@example.com` | `demo1234` | is an **editor** on "Q3 Product Roadmap" and a **viewer** on "Imported: Product Brief" — can edit one, cannot share or delete either — and owns one document of his own |
| Carol | `carol@example.com` | `demo1234` | is a **viewer** on "Team Handbook" and an **editor** on "Imported: Product Brief", and has **no access** to "Alice — Private Draft", so the denial path is demonstrable |

These are demo credentials in a demo database. They are in this README on purpose.
```

**Hard rule — this table is generated, not typed.** `prisma/seed.ts` ends by printing this
exact markdown table to stdout, and the README table is pasted from the output of a real
`pnpm db:seed` run. A hand-typed table drifts from the seed the first time a name or an
email changes, and a reviewer who cannot log in stops reviewing. This is a one-line
`console.log` in the seed script — request it from the spec that owns `prisma/seed.ts`.
Names, emails, and document titles are that spec's to decide; if they differ from the
placeholders above, the seed output wins.

### 2.10 File import — VERBATIM, and enforced by a test

The brief requires this to appear "in the UI and the README" (`00-foundation.md` §3, C8).
Two copies of the same rules drift, so there is only one copy:

> **Single-source rule.** The sentence lives in **`lib/import/constants.ts`** as
> `IMPORT_LIMITS_COPY` (`05-import-spec.md` §2.3, `00-foundation.md` §7b). The import dialog renders
> that constant. `README.md` contains a section headed exactly **`## File import`** whose **first
> line is that same string, character for character**, and `lib/import/limits-copy.test.ts` greps
> the README for it. If they differ, the unit suite is red on a clean clone — which is the whole
> point, and which is why the heading is `## File import` and not "Supported file types and limits".

The string, for reference (it is not retyped anywhere — the README line is pasted from the constant):

```
Supported files: .md, .txt, .docx — maximum 2 MB per file.
```

The em dash is part of it. If the R1 spike forces the `.docx` cut (`05-import-spec.md` §5.6), the
constant changes, the test goes red, and the README is updated — one edit, propagated by a failure.

```markdown
## File import

Supported files: .md, .txt, .docx — maximum 2 MB per file.

Importing a file creates a **new document** from its contents. The original file is parsed
and then discarded — nothing binary is stored, and there is no attachment feature.

| | |
|---|---|
| Accepted extensions | `.md`, `.txt`, `.docx` |
| Accepted MIME types | `text/markdown`, `text/plain`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| Maximum file size | **2 MB** |
| Files per upload | 1 |

What survives the import:

- **`.md`** — H1–H3 headings, bold, italic, bulleted lists, numbered lists, paragraphs.
- **`.txt`** — paragraphs, split on blank lines. No formatting is inferred.
- **`.docx`** — H1–H3 headings, bold, italic, underline, bulleted and numbered lists.

What is dropped: images, tables, code blocks, footnotes, comments, colours, fonts, embedded
objects, and any heading deeper than H3.

Not supported: `.doc` (the pre-2007 binary format), `.pdf`, `.rtf`, `.odt`, and Google Docs
links. Uploading one returns a clear error rather than a partial import.

The same limits are shown in the import dialog in the app.
```

Sample files for reviewers live in **`samples/`** (`sample.md`, `sample.txt`, `sample.docx`) so
nobody has to go hunting for a `.docx` to test with. They are copies of three committed import
fixtures and are created by `05-import-spec.md` §4, which now owns the directory — this section and
§6.2 both link to them, so they have to exist.

### 2.11 Known limitations — VERBATIM

```markdown
## Known limitations

These are deliberate scope cuts, not defects. The reasoning for each is in
[ARCHITECTURE.md](./ARCHITECTURE.md).

- **No real-time collaboration.** Two people editing the same document will not see each
  other's keystrokes. The second save is rejected with a `409`, autosave stops, and a banner
  offers a **Reload** — so you get a visible conflict instead of silent data loss. Reloading
  is the only recovery; there is no merge.
- **No public links.** Sharing is user-to-user only; there is no "anyone with the link" mode.
- **No comments, suggestions, or presence indicators.**
- **Formatting is limited** to bold, italic, underline, H1–H3, and bulleted/numbered lists.
  No tables, images, code blocks, colours, or fonts.
- **No signup or password reset.** The three seeded accounts are the entire user directory.
- **`GET /api/users` returns the whole demo directory** to any signed-in user, to power the
  share picker's autocomplete. In production this would be invite-by-exact-email with no
  enumeration.
- **Imported files are not retained** — only the parsed content and the original filename.
- **Desktop-first.** The editor is usable on a tablet but is not optimised for phones.
- **No folders, tags, search, trash, or pagination.**
```

---

## 3. `ARCHITECTURE.md`

The brief asks for "a short architecture note explaining what you prioritized and why".
**That question is answered in the first paragraph, before anything else.** A reviewer
reading three of these in a row decides in fifteen seconds whether the candidate has
judgement; burying the thesis under a stack list wastes the only paragraph guaranteed to be
read.

### 3.1 Structure and word budget

Hard total: **800–1200 words**. Checked with `wc -w ARCHITECTURE.md` in §7.2.

| # | Section | Words | Content |
|---|---|---:|---|
| — | Title + thesis paragraph | 130 | What was prioritised and why. No preamble. |
| 1 | `## Request flow` | 90 | ASCII diagram + a short walk-through of the numbered steps |
| 2 | `## Data model` | 130 | Three tables; why content is ProseMirror JSON, not HTML |
| 3 | `## Access control` | 150 | One resolver, the capability matrix, the 403-vs-404 rule |
| 4 | `## Autosave and conflicts` | 150 | The honest answer to "no real-time collab" |
| 5 | `## Import without blob storage` | 90 | Why parse-and-discard beats an S3 bucket here |
| 6 | `## What I deliberately cut` | 170 | Table, one reason per line |
| 7 | `## Known trade-offs` | 160 | Table: trade-off / why acceptable / production fix |
| 8 | `## What I would build next` | 100 | Ranked list of 4–5, with the reason each is ranked there |

### 3.2 Thesis paragraph — VERBATIM

```markdown
# Architecture note

I had about eight hours, so I spent them on the two things this brief actually grades
hardest and that are hardest to retrofit: **the access model** and **not losing anyone's
work**. Everything else was chosen to be boring on purpose. One Next.js app on Vercel with
Route Handlers as a real HTTP API, Postgres on Neon through Prisma, TipTap for the editor,
and seeded accounts instead of a signup flow — none of those decisions are interesting, and
that is the point: they cost almost no time and left the budget for a permission resolver
that every route goes through, an owner/editor/viewer matrix enforced on the server and
mirrored in the UI, and an autosave path that fails loudly rather than quietly. The two
places I chose depth over coverage are the ones a reviewer can actually probe: try to edit
a document you can only view, or open the same document in two browsers and save from both.
```

That paragraph names the priorities, names the trade, and hands the reviewer two concrete
things to try. It is the highest-leverage 130 words in the whole submission.

### 3.3 Request flow diagram — VERBATIM

Plain ASCII in a fenced block. Not Mermaid: it renders identically on GitHub, in the Drive
PDF export, and in any plain-text viewer, and it costs zero debugging time.

```
  Browser  ─ React + TipTap, fetch() with same-origin cookies
     │
     ▼
  Edge middleware ──── no valid session ────►  302  /login
     │  session cookie verified (jose, HS256)
     ▼
  Route Handler  /api/documents/[id]
     │
     │  1. getSessionFromRequest(req) →  session.id
     │  2. schema.parse(body)         →  400 VALIDATION_FAILED on failure
     │  3. resolveAccess(userId, id)  →  OWNER | EDITOR | VIEWER | NONE
     │  4. capability check           →  404 if NONE, 403 if role lacks it
     │  5. lastKnownUpdatedAt guard   →  409 CONFLICT on mismatch
     │
     ▼
  Prisma  ─────────────────────────────────►  Postgres (Neon, pooled)
```

Steps 3 and 4 are the paragraph to expand: every mutating route runs the same five steps in
the same order, so there is exactly one place where permissions are decided.

### 3.4 Section guidance

**§2 Data model — why ProseMirror JSON.** Three points, one sentence each: it is the
editor's native format so there is no lossy conversion on either read or write; it is
structured, so a future diff, version history, or export is a tree walk rather than HTML
parsing; and it never becomes an XSS vector, because nothing is ever `dangerouslySetInnerHTML`'d
— TipTap renders the tree. Name the cost honestly: querying the content in SQL is awkward,
and full-text search would need a generated column. We do not have search, so we do not pay
that cost. Cross-reference `00-foundation.md` §5 rather than re-pasting the schema.

**§3 Access control — the 403-vs-404 rule.** State it as a rule, then justify it:

> A user with no access to a document gets `404`, not `403`. `403` means "you can see this
> exists, but you cannot do *that* to it" — which is only ever true for someone who already
> has read access. Returning `403` for a document you cannot read leaks that the document
> exists, and with cuid ids that is a real, if small, enumeration oracle. The unit suite has
> a case for exactly this, because it is the kind of rule that is correct on day one and
> quietly wrong after the third handler is added.

Then: one resolver, no route re-derives permissions inline, the read-only editor is UX and
the server `403` is the control, and both are tested. See `03-auth-and-permissions.md` for
the resolver's signature and the full matrix.

**§4 Autosave and conflicts — the honest answer.** This section is where the "no real-time
collaboration" cut is *defended* rather than confessed. Structure: what we do (debounced
autosave sends the document with the `updatedAt` it was loaded at; the server makes the write
*conditional* on that token and rejects a stale one with `409`; the client suspends autosave
and shows an inline banner with a **Reload**), what that gets us (last write wins, but never
silently — the second writer is told rather than quietly overwritten), what it does not get us
(two people typing at once still means one of them reloads), and what a real implementation
would need (ProseMirror **steps** rather than whole-document snapshots, a monotonic **version
column** on the document, and a **transform/rebase** path that replays a client's steps on top
of the ones it missed — days of work and a websocket server, and a wrong one is worse than
none). Close on the line that makes it a judgement call rather than a shortcut:
*stating the limit and handling it beats pretending it does not exist.*

**Do not describe a conflict dialog, a merge UI, or a "copy my text" escape hatch** — none of
them ship (`DECISIONS.md` D002). The banner and its **Reload** are the entire recovery
affordance, and the paragraph is graded on being true about the build in front of the reviewer.

**§5 Import without blob storage.** Parse server-side, persist the result as document
content, keep only `sourceFilename` as provenance. Consequences worth naming: zero
infrastructure for a reviewer to configure, no signed-URL or lifecycle policy to get wrong,
no bucket to leak — and, honestly, no way to re-download the original, which is the right
trade when the product is "turn this file into a document" rather than "store my files".

**§6 What I deliberately cut.** Table, sourced from `00-foundation.md` §4, one reason line
each — real-time collaborative editing, public link sharing, comments/suggestions/presence,
tables/images/code blocks/colours/fonts, self-service signup and password reset, blob
storage, folders/tags/search/trash/pagination, mobile-optimised editing. Lead the section
with one framing sentence: *cutting well is the skill this exercise is testing, so these are
listed with their reasons rather than left for the reviewer to discover.*

**§7 Known trade-offs.** Table with three columns. Minimum rows:

| Trade-off | Why it is acceptable here | What production needs |
|---|---|---|
| `GET /api/users?q=` returns the whole demo directory | Three seeded accounts, no real PII, and the share picker needs autocomplete | Invite by exact email only — server returns a match or nothing, never a list — plus rate limiting |
| Last-write-wins with a `409` instead of CRDT/OT | Correct multiplayer is days of work; a broken CRDT is worse than none | Y.js or Automerge over a websocket, or a hosted service |
| Autosave sends the whole document body | Documents here are a few KB | Send ProseMirror steps, not snapshots |
| Session JWT has no revocation | Demo accounts, short expiry | Server-side session records, rotation on password change |
| No rate limiting on `/api/auth/login` | Demo | Per-IP and per-account throttling with lockout |
| No audit trail on share changes | Not graded, and it is a table plus a writer | A `ShareAudit` row per grant/change/revoke |

The `/api/users` row is required — `00-foundation.md` §7 commits to documenting it here.

**§8 What I would build next.** Ranked, 4–5 items, each with the reason it sits at that rank:

1. **Presence indicators** — cheapest fix for the biggest known gap. A heartbeat on
   `GET /api/documents/:id` and an avatar row turns the `409` from a surprise into an
   expectation, without any of the cost of real collaborative editing.
2. **Version history** — a `DocumentVersion` snapshot every N autosaves makes
   last-write-wins recoverable, which is the real risk of the current design.
3. **Export to Markdown / PDF** — closes the loop with import and is a tree walk over
   content we already store structurally.
4. **Playwright happy path** — one browser test over the three seeded accounts covering
   create → share → view-as-viewer → denied, which is the flow most likely to break silently.
5. **Invite-by-exact-email** — removes the one deliberate security simplification.

Ranked by *risk reduced per hour*, not by how interesting they are, and say so.

---

## 4. `AI-WORKFLOW.md`

### 4.1 Structure — exactly the brief's four questions, in the brief's order

The brief asks four specific things. The document has four sections that answer them, in
that order, with headings that visibly map to the question. A reviewer scoring against a
rubric should never have to hunt.

```markdown
# AI workflow note
<two-sentence framing: what the workflow was, and the honest headline>

## 1. Which AI tools I used
## 2. Where AI materially sped up my work
## 3. What AI output I changed or rejected
## 4. How I verified correctness, UX quality, and reliability

## Appendix: build log
<link to docs/ai-log.md>
```

Target 600–900 words. Section 3 is the longest.

**§1 Which tools.** A table, not prose: tool, model, what it was used for, roughly how much.
Include the non-obvious one — the `specs/` directory in this repo was produced by a
multi-agent Claude Code session *before any code was written*, with one agent per spec and
`00-foundation.md` as the locked contract they all wrote against. That is the most
distinctive thing about this workflow and it belongs in §1 and §2, not hidden. Also name
what was **not** AI-assisted, if anything (the Neon and Vercel setup, the video). Naming a
boundary is more credible than claiming total coverage.

**§2 Where it materially sped things up.** Three or four items, each tied to a named
artifact and a rough saving. Candidates, to be replaced by whatever the log actually shows:
spec-first parallel planning; the Prisma schema and seed script; the permission matrix
tests (generating the exhaustive 4-roles × 6-capabilities table is exactly the tedium AI is
good at); the shadcn share-dialog wiring. The word "materially" is the brief's — an item
that saved five minutes does not belong here.

**§3 What I changed or rejected — the highest-signal section.** Say this to the writer
plainly: *this is the section that separates a real answer from a generated one, and it is
the easiest to fake.* Anyone can write "I reviewed AI output carefully and corrected it
where necessary". That sentence scores zero. What scores is a specific artifact, a specific
defect, and the specific thing that shipped instead — which is only writable if
`docs/ai-log.md` (§5) exists.

Table template. Three to five rows, all real, drawn from log entries with verdict `CHANGED`
or `REJECTED`:

```markdown
| # | What AI produced | What was wrong with it | What shipped instead |
|---|---|---|---|
| 1 | TKTK | TKTK | TKTK |
| 2 | TKTK | TKTK | TKTK |
| 3 | TKTK | TKTK | TKTK |
```

Rules for the rows:

- At least one must be a **rejection**, not a correction — something thrown away entirely.
- At least one should be a case where the AI output *looked* correct and passed a test.
  A generated test that passed against broken code is the single most valuable row available.
- "What was wrong with it" must be a technical reason a reader can check, not a taste claim.
  "It re-derived ownership inline instead of calling `resolveAccess`, so the permission rule
  now had two homes" is a reason. "It was not clean" is not.
- Name the file. A row without a path is unverifiable.

**§4 How I verified.** Three sub-answers, because the brief asks three things:

| Asked | Answer with |
|---|---|
| Correctness | The test suites and what they actually cover — the permission matrix, the import parsers, the `409` path. Include one bug the tests caught. |
| UX quality | Manual walkthrough as all three seeded users, the specific flows checked (read-only banner, share dialog, the conflict banner and its **Reload**, import errors), and the clean-clone README run (§7.3 of this spec). |
| Reliability | Deploying at hour 2 rather than hour 7, the first failed deploy and what it taught, `pnpm build` clean, and the honest limits (no load testing, no error monitoring). |

### 4.2 Tone

The brief's own line — *"We are evaluating practical AI usage, not volume of AI usage"* —
is a screening statement. It is worth quoting once in the framing paragraph and then
obeying. Concretely:

| Do | Do not |
|---|---|
| Give the model and the task together | Drop tool names with nothing attached |
| Quantify with a number you can defend | "10x", "90% of the code", "massively" |
| Name where AI was wrong or slower | Imply everything worked |
| Let the log do the boasting | Adjectives |

Measured, not promotional. A note that admits AI cost time somewhere reads as written by
someone who was actually there.

---

## 5. The evidence-capture protocol — `docs/ai-log.md`

**This is the most important part of this spec.** `AI-WORKFLOW.md` §3 cannot be written
honestly at hour 7.5 from memory. What actually happens without a log is well understood:
the writer remembers that AI "helped a lot", cannot recall a single specific rejection, and
produces exactly the vague, promotional note the brief is screening against. The log is
~15 minutes spread across the whole build and it is the only input that makes §3 writable.

### 5.1 The file

`docs/ai-log.md`, committed to the repo, append-only, written **during** the build. It is
committed rather than kept as a scratch file for two reasons: git timestamps it, so it is
independently checkable rather than something written after the fact; and a reviewer who
opens it finds the raw material behind `AI-WORKFLOW.md`, which corroborates the note instead
of asking to be trusted.

Header, written once at hour 0:

```markdown
# Build log

Appended to while building, not after. Raw material for AI-WORKFLOW.md — entries are
unedited and in the order they happened. Verdicts: ACCEPTED (shipped as generated),
CHANGED (shipped after edits), REJECTED (thrown away).
```

### 5.2 Entry format

| Field | Required | Content |
|---|---|---|
| Heading `### HH:MM — <task>` | Yes | 24-hour local time, task in a few words |
| `**Tool:**` | Yes | Product + model, and a rough cost (prompts, or minutes) |
| `**Asked for:**` | Yes | One line — what you actually asked for |
| `**Generated:**` | Yes | One line — the *approach* it took, not the diff |
| `**Verdict:**` | Yes | `ACCEPTED` / `CHANGED` / `REJECTED` |
| `**Why:**` | If CHANGED or REJECTED | The real technical reason. Paste the error if there was one. |
| `**Shipped:**` | If CHANGED or REJECTED | What went in instead, with a file path |
| `**Verified by:**` | Yes | The command you ran, or the manual check you did |

### 5.3 Worked example — a `CHANGED` entry

```markdown
### 09:41 — R1 spike: TipTap generateJSON on the server

- **Tool:** Claude Code (Opus 5) — 2 prompts, ~6 min
- **Asked for:** a server-side `markdownToProseMirror(md: string)` usable from a Route Handler
- **Generated:** called `@tiptap/html`'s `generateJSON()` directly inside the route
- **Verdict:** CHANGED
- **Why:** `generateJSON` needs a DOM. Under `node --run` it threw
  `ReferenceError: document is not defined`. This is exactly risk R1 in 00-foundation §9,
  and the first answer did not know about it — it had no way to.
- **Shipped:** `lib/import/parsers.ts` + `lib/import/html-to-pm.ts` — marked → `generateJSON`
  against the shared `schemaExtensions`, with a `jsdom` global installed once in
  `lib/import/dom-polyfill.ts`; the import route declares `export const runtime = 'nodejs'` so it
  never lands on Edge.
- **Verified by:** `pnpm vitest run lib/import/html-to-pm.test.ts` — 5 cases (H1–H3,
  bold, italic, bulleted, numbered). Also confirmed on the deployed build with samples/sample.md.
```

### 5.4 Worked example — a `REJECTED` entry

```markdown
### 13:12 — Share role-change endpoint

- **Tool:** Claude Code (Opus 5) — 1 prompt
- **Asked for:** `PATCH /api/documents/[id]/shares/[userId]`, owner-only
- **Generated:** a handler that checked ownership inline with
  `if (doc.ownerId !== session.id) return 403`
- **Verdict:** REJECTED
- **Why:** two problems. It put a second copy of the permission rule outside
  `resolveAccess`, which is precisely how these drift apart (00-foundation §6, rule 2). And
  it returned `403` for a document the caller cannot see at all, leaking existence — the
  rule is `404` for NONE.
- **Shipped:** rewrote against the resolver: a single
  `requireAccess(session.id, id, 'manageShares')`, in
  `app/api/documents/[id]/shares/[userId]/route.ts`.
- **Verified by:** `pnpm test:unit` — the case "stranger PATCHing a share gets 404, not 403"
  in `lib/permissions.test.ts` fails against the generated version and passes
  against the rewrite. Kept both runs.
```

Note what makes both entries usable: a file path, a real error or rule, and a command
anyone could re-run. Neither takes more than two minutes to write.

### 5.5 When to write an entry

Do **not** log every prompt — that is volume, which the brief explicitly is not grading, and
it will not survive contact with hour four. Log every *decision*. The natural capture
moments:

| Moment | Roughly | Why it is high-signal | Likely verdict |
|---|---|---|---|
| After the spec-writing session | hour 0 | The multi-agent spec workflow is the most distinctive thing here and it happens before the code | ACCEPTED |
| After the **R1 spike** | 0.5 | The one genuinely uncertain integration — whatever comes back first will be partly wrong | CHANGED |
| After the **first failed deploy** | ~2 | Deploy failures are the most concrete evidence of AI not knowing the runtime (Prisma generate, Edge vs Node, pooled URLs) | CHANGED |
| After **each parallel implementation wave** | 3, 4, 5 | Bulk generation is where "accepted without reading" creeps in. One entry per wave, even if the verdict is ACCEPTED. | mixed |
| Every time a **generated test caught a real bug** | any | Direct, checkable answer to the brief's question 4 | ACCEPTED |
| Every time a **generated test passed against broken code** | any | The most valuable entry available. Write it down immediately — it will be forgotten within the hour. | REJECTED |
| **Feature freeze sweep** | 6 | One entry listing anything shipped without being read line by line. Honest, and cheap. | — |

Discipline rules:

1. **Append only.** Never edit an earlier entry to make it read better. If you were wrong,
   add a later entry that supersedes it — that is itself good evidence.
2. **Two minutes, hard cap.** Longer than that and you are writing prose instead of capturing
   evidence. Stop and move on.
3. **Write it before starting the next task,** while the error is still on screen. Ten
   minutes later you will have the gist and not the specifics, and the specifics are the
   whole value.
4. **"Verified by: I looked at it and it seemed fine" is a valid entry.** Write it. It is
   true, it is more credible than a fabricated test name, and §4 of the note is better for
   admitting that some things were eyeballed.

### 5.6 What happens without it

Stated plainly, because it is the justification for the whole section: without the log,
`AI-WORKFLOW.md` §3 gets reconstructed from memory at hour 7.5 by someone who has been
working for eight hours. Reconstructed memory produces generalities — "I corrected the AI's
output where it was wrong" — and the brief is explicitly grading the specifics. It is one of
four graded documents and the one the role is named after. Fifteen minutes of logging across
the build is the cheapest defensible spend in the entire eight hours.

---

## 6. `SUBMISSION.md`

### 6.1 Structure

```markdown
# Submission — shared-docs

## Links
<table: live app, repo, walkthrough video, this Drive folder>

## Review in 60 seconds
<numbered path a reviewer can follow without reading anything else>

## What is included
<inventory table: brief deliverable → artifact → location>

## Status
### What is working
### What is incomplete
### What I would build next with 2–4 more hours

## Test accounts
<same table as README §Demo accounts, or a link to it>

## Deliberate scope cuts
<one-line pointer to ARCHITECTURE.md — not repeated here>
```

### 6.2 "Review in 60 seconds" — VERBATIM shape

Cheap to write, disproportionately valuable: it drives the reviewer straight through the
graded flows including the negative path.

```markdown
## Review in 60 seconds

1. Open TKTK and click **Sign in as Alice** (password `demo1234`, pre-filled).
2. Open **TKTK-document-title**. Edit a heading, apply bold — watch the save indicator.
3. Reload. The content and the formatting are still there.
4. Click **Share**. Bob is an **editor**, Carol is a **viewer**.
5. Sign out, sign in as **Carol**. The same document opens read-only with a banner, and the
   toolbar is gone. **TKTK-third-document** is not in her list, and its URL returns "not found".
6. Sign back in as Alice, click **Import**, and drop `samples/sample.docx`. It becomes a new
   document with its headings and lists intact.
```

Step 5 is the important one — it is the access-control demonstration, and it is the step
reviewers of these exercises most often find missing.

### 6.3 Inventory table — VERBATIM shape

Every row of the brief's deliverables list, mapped to a real artifact and a real location.
Sourced from `00-foundation.md` §10 plus the brief's "Deliverables" and "Submission Format"
sections.

```markdown
## What is included

| Brief deliverable | Artifact | Location |
|---|---|---|
| The source code | Public GitHub repo | TKTK-repo-url |
| " | `source-code.zip` | this Drive folder |
| `README.md` with local setup and run instructions | `README.md` | repo root / Drive folder |
| A short architecture note | `ARCHITECTURE.md` | repo root / Drive folder |
| Your AI workflow note | `AI-WORKFLOW.md` | repo root / Drive folder |
| A `SUBMISSION.md` listing what is included | this file | repo root / Drive folder |
| A live product URL | Vercel deployment | `live-url.txt`, and the Links table above |
| A text file with the walkthrough video URL | `walkthrough-video-url.txt` | Drive folder |
| Screenshots or a short demo GIF | `screenshots/` | repo + Drive folder |
| Credentials / seeded users for the sharing flow | Demo accounts table | `README.md` and below |
| Build log backing the AI note | `docs/ai-log.md` | repo |
```

### 6.4 The mandated "if any feature is partial" triple

The brief requires *what is working / what is incomplete / what I would build next with
another 2–4 hours*. **All three headings ship even if nothing is partial** — an absent
heading reads as a missed instruction, and a reviewer scanning for it should find it.

Writing rules:

- **What is working** — trace the acceptance criteria C1–C20 in `00-foundation.md` §3.
  Claim only what has been clicked on the *deployed* build, not on localhost.
- **What is incomplete** — reserved for things that were *started and not finished*, or that
  work with a caveat. If that list is empty, say so in one line and point at the cuts:
  > Nothing from the core scope is half-built. The features that are absent were cut
  > deliberately at planning time, not abandoned mid-way — they are listed with their
  > reasons in [ARCHITECTURE.md](./ARCHITECTURE.md#what-i-deliberately-cut).
  Do **not** relabel deliberate cuts as "incomplete". Conflating a decision with a failure
  gives away the exact judgement the brief says it is grading.
- **What I would build next with 2–4 hours** — the same ranked list as `ARCHITECTURE.md` §8,
  trimmed to what genuinely fits in 2–4 hours (realistically the top two or three), with an
  hour estimate each. The two lists must not contradict each other.

---

## 7. Doc-quality bar

Run as one pass at hour 7.5. Every item is checkable — no item says "read it over".

### 7.1 No placeholder survives

```bash
grep -rn "TKTK" README.md ARCHITECTURE.md AI-WORKFLOW.md SUBMISSION.md docs/ && echo "FAIL" || echo "ok"
grep -rniE "TODO|FIXME|lorem ipsum|coming soon|<placeholder>" *.md docs/*.md
```

Both must come back empty. The second grep is allowed to hit `.env.example`, which is
excluded from the glob on purpose.

### 7.2 Checklist

- [ ] `grep -rn TKTK` over the four docs and `docs/` returns nothing.
- [ ] Every link in every doc has been **clicked in a private/incognito window** — this
      catches links that only work because you are signed into GitHub, Drive, or Vercel.
- [ ] The Drive folder link is set to "anyone with the link can view", verified from a
      logged-out browser.
- [ ] The walkthrough video link is unlisted-but-playable, verified from a logged-out browser.
- [ ] **Every fenced command block in `README.md` has been run once**, in order, in the
      clean-clone temp directory (§7.3). Not skimmed — run.
- [ ] The live URL string is byte-identical in `README.md`, `SUBMISSION.md`, and
      `live-url.txt`. `diff <(...)` it rather than eyeballing.
- [ ] The demo accounts table matches the actual output of `pnpm db:seed`, pasted, not typed.
- [ ] The `## File import` first line in `README.md` is byte-identical to `IMPORT_LIMITS_COPY` and
      to the string the import dialog renders.
- [ ] `wc -w ARCHITECTURE.md` is between 800 and 1200.
- [ ] `AI-WORKFLOW.md` has exactly four numbered top-level sections, in the brief's order,
      and §3 contains at least three rows with a file path in each.
- [ ] `SUBMISSION.md` contains all three of "What is working", "What is incomplete", and
      "What I would build next".
- [ ] Prerequisite versions in `README.md` match `.nvmrc` and the `packageManager` field in
      `package.json`.
- [ ] All screenshots were taken **from the deployed Vercel build**, not localhost, and after
      the last commit that changes the UI. See §7.4.
- [ ] Every markdown table renders — preview the files on GitHub, not just in the editor.
- [ ] No file contains a real secret. `git grep -iE "AUTH_SECRET=|postgres://|postgresql://"`
      returns only `.env.example` / `.env.test` placeholders and README examples.

### 7.3 Clean-clone verification — this is a task, not a vibe

**Hard rule: `README.md` is not done until it has been executed from a fresh clone in a
temporary directory, by someone with no project state.** Budget 20 minutes at hour 7. It is
the single highest-value QA action in the submission, because "the setup instructions do not
work" is the one failure that stops a review dead.

```bash
cd "$(mktemp -d)"
git clone --depth 1 https://github.com/TheNatas/shared-docs.git
cd shared-docs
# now follow README.md top to bottom, pasting each block, changing nothing
```

Rules for the run:

1. **Fresh shell.** No project environment variables inherited. Do not reuse the dev
   `node_modules`, `.env`, or `.next`.
2. **Fresh database.** A new Neon branch or a `docker compose down -v` first — a
   pre-migrated database hides a missing migration step.
3. **Change nothing in the terminal.** If a command fails or needs an undocumented step,
   the fix goes in the **README**, then the run restarts from that block. Fixing it in the
   shell and moving on is how broken setup instructions ship.
4. **Log the result** as an entry in `docs/ai-log.md` — it is a real verification and it
   feeds `AI-WORKFLOW.md` §4.
5. Finish by signing in as Alice on `localhost:3000` and opening one document. Install
   succeeding is not the same as the app working.

### 7.4 Screenshots

**Owned by `09-video-and-submission.md` §B.6, not by this spec.** Six PNGs at
`docs/screenshots/01..06-*.png`, captured from the **deployed** build at the final UI commit,
1920×1080, zoom 110–125%, no personal bookmarks or extensions in frame. This spec's only
responsibility is that `README.md` references exactly those six paths and no others (§2.3).

**No GIF.** The brief says "screenshots **or** a short demo GIF"; the video carries motion, and a
GIF is ~20 minutes for zero additional marks. The earlier plan here (3–5 stills *plus* a GIF, at
`screenshots/` in the repo root, with different filenames) produced neither a compatible set nor a
working README.

A screenshot of localhost showing a UI that differs from the live URL is worse than no screenshot.

---

## 8. Time budget for this slice

| Task | Minutes | When |
|---|---:|---|
| `docs/ai-log.md` header + entries during the build | 15 | continuous, hours 0–6 |
| `ARCHITECTURE.md` | 30 | 6.75 |
| `README.md` | 25 | 6.5 |
| `AI-WORKFLOW.md` (assembled from the log) | 20 | 7.25 |
| `SUBMISSION.md` | 10 | 7.5 |
| Clean-clone verification (§7.3) | 20 | 7.0 |
| Screenshots + GIF | 10 | 7.0 |
| Quality-bar pass (§7.2) | 10 | 7.6 |
| **Total** | **140 min ≈ 2h15m** | |

Only about **2 hours** of that lands inside the final documentation window from
`00-foundation.md` §9 R5, because the log is amortised across the build and the clean-clone
run is mostly waiting on `pnpm install`. This fits R5's reserved two hours **only if the
video is recorded outside it** — see §9.

Why this is affordable at all: three of the four documents are *derivative*, not original.
`ARCHITECTURE.md` is a rewrite of `00-foundation.md` §2, §4, §6 and §7 for an external
reader. `SUBMISSION.md` is §10 plus links. `AI-WORKFLOW.md` is a distillation of
`docs/ai-log.md`. Only `README.md` is written from scratch. Drop the log and
`AI-WORKFLOW.md` stops being derivative and becomes a 45-minute act of creative writing that
scores badly — which is the whole argument for §5.

---

## 9. Open questions / proposed changes to 00-foundation

1. ✅ **R5 now says freeze at 5:30 and reserve 2.5 h.** `00-foundation.md` §9/R5 was rewritten:
   this slice measures 2 h 15 and `09-video-and-submission.md` measures 1 h 45, which never fit a
   2 h window. R5 also now states the parallelism the 8 h depends on, and what to do when working
   solo (start cutting at hour 3, from `10-task-graph.md` §7).
2. ✅ **`prisma/seed.ts` prints the demo-accounts markdown table to stdout.**
   `01-data-and-persistence.md` §7.5 adopted it and `00-foundation.md` §5 records it, so §2.9's
   "generated, not typed" hard rule is satisfiable rather than aspirational.
3. ✅ **`samples/` is adopted** by `05-import-spec.md` §4 — three copies of committed fixtures,
   ~5 minutes, and it removes a dead path from the "Review in 60 seconds" list a reviewer follows
   first.
4. ✅ **The import limits are settled at 2 MB** and the canonical sentence is `IMPORT_LIMITS_COPY`
   in `lib/import/constants.ts` (`00-foundation.md` §7b). §2.10 now reproduces it as the first line
   of a `## File import` section, which is what makes `lib/import/limits-copy.test.ts` pass instead
   of shipping red.
5. ✅ **Sibling filenames are fixed**: `01-data-and-persistence.md` (seed), `02-api-contract.md`,
   `06-test-plan.md`, `07-deployment-runbook.md`, `09-video-and-submission.md`,
   `10-task-graph.md`.
6. ✅ **`docs/ai-log.md` is in the deliverables map** (`00-foundation.md` §10), alongside
   `docs/screenshots/` and the gitignored `submission/` staging directory.

7. ⚠️ **Two paths in this spec are owned elsewhere and were corrected, not merely reconciled** —
   worth knowing because both were silent failures: the demo credentials here said
   `@shared-docs.dev` while the seed creates `@example.com` (a reviewer following the README's
   headline link could not log in), and the env table said `SESSION_SECRET` while `lib/env.ts`
   requires `AUTH_SECRET` and refuses to boot without it (a clean clone crashed at module
   evaluation). Both are now `00-foundation.md` §5 and §2b.

---

## Definition of done

Verifiable statements for this slice. All must be true before submission.

- [ ] `README.md` exists at the repo root and contains all fourteen headings listed in §2.1,
      in that order.
- [ ] `README.md` contains the demo accounts table with the password `demo1234` in plain
      text, and the table matches the output of a real `pnpm db:seed`.
- [ ] `README.md` has a `## File import` section whose **first line** is `IMPORT_LIMITS_COPY`
      character for character, and `pnpm test:unit` (which includes
      `lib/import/limits-copy.test.ts`) is green on a clean clone.
- [ ] `README.md` has been executed end to end from a fresh `git clone` in a temp directory,
      on a fresh database, with no undocumented steps (§7.3), and an entry recording that run
      exists in `docs/ai-log.md`.
- [ ] `ARCHITECTURE.md` exists, answers "what did you prioritise and why" in its **first**
      paragraph, and `wc -w` reports between 800 and 1200.
- [ ] `ARCHITECTURE.md` contains all eight sections from §3.1, including the 403-vs-404 rule,
      the autosave/optimistic-concurrency answer — conditional update → `409` → banner with
      **Reload**, plus what a real implementation would need, and **no** conflict dialog and no
      "copy my text" (`DECISIONS.md` D002) — the deliberate-cuts table sourced from
      `00-foundation.md` §4, a trade-offs table containing the `/api/users` enumeration row,
      and a ranked "what I would build next" list.
- [ ] `AI-WORKFLOW.md` exists with exactly four top-level numbered sections matching the
      brief's four questions in the brief's order.
- [ ] `AI-WORKFLOW.md` §3 contains a changed/rejected table with **at least three real rows**,
      each naming a file path, at least one of which is a full rejection.
- [ ] `docs/ai-log.md` exists, is committed, and contains **at least six entries** whose git
      commit timestamps are spread across the build rather than clustered at the end.
- [ ] Every `docs/ai-log.md` entry has all required fields from §5.2 for its verdict.
- [ ] `SUBMISSION.md` exists and contains the Links table, "Review in 60 seconds", the
      inventory table covering every brief deliverable, and all three of "What is working",
      "What is incomplete", "What I would build next with 2–4 more hours".
- [ ] `grep -rn "TKTK"` over the four docs and `docs/` returns no matches.
- [ ] The live URL string is byte-identical in `README.md`, `SUBMISSION.md`, and
      `live-url.txt`.
- [ ] Every link in the four docs has been opened successfully in a private window.
- [ ] `docs/screenshots/` contains the six PNGs named in `09-video-and-submission.md` §B.6, taken
      from the deployed build at the final UI commit, and **every image path in `README.md`
      resolves** — checked by previewing the file on GitHub, not by reading the markdown.
- [ ] The full §7.2 checklist has been walked once, with every box ticked.
