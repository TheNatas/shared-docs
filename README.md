# shared-docs

A small collaborative document product: sign in, write rich text in the browser, import a
`.md` / `.txt` / `.docx` file as a new document, and open documents other people have shared
with you as a **viewer** or an **editor**. Everything persists to Postgres and survives a
refresh.

It is not a Google Docs clone and is not trying to be — [ARCHITECTURE.md](./ARCHITECTURE.md)
covers what was prioritised, what was cut, and why.

---

## Live demo

| | |
|---|---|
| **App** | <https://shared-docs-thenatas-projects.vercel.app> |
| **Password — every account** | `demo1234` |
| **Health check** | [`/api/health`](https://shared-docs-thenatas-projects.vercel.app/api/health) → `{"ok":true,"db":"up","users":3}` |
| **Source** | <https://github.com/TheNatas/shared-docs> |

The login page carries a one-click **Sign in as Alice / Bob / Carol** button per account, so
there is nothing to type. There is no signup — the three accounts below are the entire user
directory.

### Seeded accounts

| Name | Email | Password | Set up so that… |
|---|---|---|---|
| Alice | `alice@example.com` | `demo1234` | owns four documents and has shared three of them |
| Bob | `bob@example.com` | `demo1234` | **editor** on "Q3 Product Roadmap", **viewer** on "Imported: Product Brief", owns one document of his own |
| Carol | `carol@example.com` | `demo1234` | **viewer** on "Team Handbook", **editor** on "Imported: Product Brief", and has **no access** to "Alice — Private Draft" so the denial path is demonstrable |

These are demo credentials in a demo database. They are in this README on purpose. The table
is printed by `prisma/seed.ts` at the end of a seed run rather than hand-typed, so it cannot
drift from the data.

### Seeded share matrix

| Document | Owner | Bob | Carol |
|---|---|---|---|
| Q3 Product Roadmap | Alice | **Editor** | — |
| Team Handbook | Alice | — | **Viewer** |
| Imported: Product Brief | Alice | **Viewer** | **Editor** |
| Alice — Private Draft | Alice | — | — |
| Bob's Meeting Notes | Bob | *owner* | — |

Document ids are fixed and readable (`seed-doc-roadmap`, `seed-doc-handbook`,
`seed-doc-private`, `seed-doc-imported`, `seed-doc-bob-notes`), so any of them can be reached
directly at `/documents/<id>`.

---

## Review in 60 seconds

1. Open the app and click **Sign in as Alice**. The dashboard splits into **My documents**
   (four) and **Shared with me** (empty — Alice is the owner of everything she can see).
2. Open **Q3 Product Roadmap**. Select some text and use the toolbar: **Bold**, *Italic*,
   Underline, the text-style select (Paragraph / Heading 1 / Heading 2 / Heading 3), bulleted
   and numbered lists.
3. Click the title and rename the document inline.
4. Watch the status in the top strip go **Unsaved changes** → **Saving…** → **Saved**, then
   reload the page. The title and the formatting are still there — that is the persistence requirement,
   and nothing was clicked to make it happen.
5. Go back to the dashboard, click **Import file**, and pick
   [`samples/sample.md`](./samples/sample.md). A new document is created from the file, with
   its headings, marks and lists intact. The fenced code block and the link at the bottom of
   that file are dropped deliberately — see [File import](#file-import--supported-types-and-limits).
   [`samples/sample.txt`](./samples/sample.txt) and
   [`samples/sample.docx`](./samples/sample.docx) are there for the other two paths;
   `sample.docx` is a real Word file and keeps its underlines.
6. Open a private window (or **Sign out** from the user menu) and click **Sign in as Carol**.
   Her **My documents** is empty and **Shared with me** holds two rows, each tagged with her
   role.
7. Open **Team Handbook** as Carol. A **View only** banner appears, the canvas is read-only,
   and there is no save indicator — she is a viewer. Open **Imported: Product Brief** and it
   is writable, because on that one she is an editor.
8. Still as Carol, go to
   [`/documents/seed-doc-private`](https://shared-docs-thenatas-projects.vercel.app/documents/seed-doc-private).
   You get a **404, not a 403**. The API's response body for a document you cannot see is
   byte-identical to its response for an id that never existed, so no document's existence
   leaks — there is an integration case that compares the two bodies to each other.

> **Granting a new share, in the app.** Open any document you own, click **Share** in the top
> strip, type `carol@example.com`, choose **Viewer** or **Editor**, and click **Share**. The
> dialog lists current collaborators with their role, and re-inviting someone who already has
> access *updates* their role rather than adding a second row. The Share button only renders
> for the document's owner — an Editor never sees it, and the four share endpoints return
> **403** to a non-owner regardless of what the UI shows.
>
> The demo database is shared between reviewers and there is no per-visitor reset, so if you
> grant access to **Alice — Private Draft**, please revoke it afterwards — step 8 above depends
> on Carol *not* having access to that one document. Granting on any other document, or on one
> you create yourself, disturbs nothing. Running the same flow locally costs nothing:
> `pnpm db:seed` puts everything back.

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 16.3.4**, App Router | one deployable for UI and API, and Route Handlers give a real HTTP API rather than RPC glue |
| UI | **React 19**, **TypeScript** (strict) | |
| Styling | **Tailwind v4** + **shadcn/ui** (Radix) | accessible dialog / select / dropdown primitives without hand-writing focus traps |
| Editor | **TipTap v3.31** (ProseMirror) | a schema-constrained document model — the allowed node and mark set is also what filters imported HTML |
| Database | **Postgres** on **Neon** (AWS `us-east-1`) | free tier, no card, and co-located with the Vercel function region |
| ORM | **Prisma 6.19.3** | pinned deliberately: Prisma 7 removes `url`/`directUrl` from the datasource and requires a driver adapter |
| Validation | **Zod 4.5.4** | one schema per request body, reused by the client pre-check and the server handler |
| Auth | **jose** (HS256 JWT in an httpOnly cookie) + **bcryptjs** | verifiable in Edge middleware, and no session store for a reviewer to run |
| Tests | **Vitest 4** | two projects in one config — `unit` with no dependencies, `integration` against real Postgres |
| Hosting | **Vercel**, function region `iad1` | same region as the database |

---

## Prerequisites

| Tool | Version | Required? | Notes |
|---|---|---|---|
| Node.js | **22.x** | Yes | pinned in `.nvmrc`; `nvm use` picks it up |
| pnpm | **10.x** | Yes | `corepack enable && corepack prepare pnpm@10 --activate` |
| PostgreSQL | **16.x** | Yes | any instance; the Docker Compose file below is the quickest one |
| Docker + Compose | any recent | **No** | needed only for `pnpm test:integration` — and it is also the easiest way to get the Postgres above |

Nothing here needs a paid account.

---

## Setup from a clean clone

```bash
git clone https://github.com/TheNatas/shared-docs.git
cd shared-docs
corepack enable && corepack prepare pnpm@10 --activate
pnpm install

cp .env.example .env
# fill in the three values — see below

pnpm db:up        # Postgres 16 in Docker on port 55432 (skip if you have your own)
pnpm db:migrate   # apply the init migration
pnpm db:seed      # three users, five documents, four shares
pnpm dev          # http://localhost:3000
```

Then open <http://localhost:3000> and click **Sign in as Alice**.

Sanity check before you go looking for problems elsewhere:

```bash
curl -s localhost:3000/api/health
# {"ok":true,"db":"up","users":3}
```

### `.env`

Three values, all required. For the Docker Postgres started by `pnpm db:up`:

```dotenv
DATABASE_URL="postgresql://test:test@localhost:55432/shared_docs_dev"
DIRECT_URL="postgresql://test:test@localhost:55432/shared_docs_dev"
AUTH_SECRET="paste 32+ random characters here"
```

| Variable | What it is |
|---|---|
| `DATABASE_URL` | connection string used by the app at runtime. On Neon, the **pooled** endpoint, with `?sslmode=require&pgbouncer=true&connection_limit=1`. |
| `DIRECT_URL` | used **only** by `prisma migrate`. On Neon, the **direct** (unpooled) endpoint. Locally, the same value as `DATABASE_URL`. |
| `AUTH_SECRET` | HS256 signing key for the session cookie. Generate with `openssl rand -base64 32`. It must be **at least 32 characters** — the app throws at startup otherwise, by design, rather than falling back to a built-in key. |

`.env` is gitignored. There are no other settings, no feature flags and no optional services.
`.env.test` *is* committed — it addresses a throwaway container on a non-default port and
holds nothing of value.

### About the Docker database

`docker-compose.test.yml` starts one Postgres 16 container on port **55432** (not 5432, so it
cannot collide with a Postgres you already run) holding two databases: `shared_docs_dev` for
local development and `shared_docs_test` for the integration suite. One thing to start, one
thing to stop.

Its storage is a tmpfs, so **stopping the container discards local data**. That is fine — the
seed is idempotent, upserts by id and email, and restores the demo state in seconds:

```bash
pnpm db:seed              # safe to re-run any time; also the "reset the demo" button
pnpm prisma migrate reset # nuclear option: drop, re-migrate — follow with pnpm db:seed
pnpm db:test:down         # remove the container and its volumes
```

---

## Running the tests

```bash
pnpm test:unit          # 124 tests, ~0.5s
pnpm test:integration   # 45 tests, ~3.1s — needs Docker
pnpm test               # both
```

**`pnpm test:unit` needs nothing but `pnpm install`.** No `.env`, no database, no Docker, no
network. That is a property of the suite, not a hope: it was verified by moving every env
file aside, unsetting the three variables, and running it green. It covers the 24-cell
capability matrix (owner / editor / viewer / none × six capabilities), import validation,
Markdown and `.docx` parsing, HTML-to-ProseMirror conversion, title derivation, and
document-content shape validation — six files, all pure functions.

`pnpm test:integration` starts the Postgres container itself (`db:test:up` is part of the
script), pushes the schema, and calls the real route handlers against real Postgres: auth,
the document routes, the share routes and the import pipeline. If Docker is not running it
will fail to connect — expected, not a bug.

The integration global setup refuses to start unless `TEST_DATABASE_URL` parses to database
`shared_docs_test` on port `55432` of localhost. The suite truncates all three tables between
tests, so a URL pointed anywhere else is not a near-miss, it is data loss.

---

## File import — supported types and limits

Supported files: .md, .txt, .docx — maximum 2 MB per file.

That sentence lives once, in `lib/import/constants.ts` as `IMPORT_LIMITS_COPY`; the import
control in the app renders that same constant, and the two error messages about type and size
interpolate it, so the UI and this README cannot disagree.

Importing a file creates a **new document** from its contents. The file is parsed on the
server and then discarded — only the resulting document and the original filename are stored.
There is no blob storage and no attachment feature, so there is nothing for a reviewer to
configure and no bucket to leak.

| | |
|---|---|
| Accepted extensions | `.md`, `.txt`, `.docx` |
| Maximum file size | **2 MB** |
| Files per upload | 1 |

What survives:

- **`.md`** — H1–H3 headings, bold, italic, underline (raw `<u>`), bulleted lists including
  nested ones, numbered lists, paragraphs.
- **`.txt`** — paragraphs, split on blank lines. No formatting is inferred.
- **`.docx`** — H1–H3 headings, bold, italic, underline, bulleted and numbered lists.

What is dropped: code blocks, links (the mark goes, the link *text* stays), images, tables,
colours, fonts, and anything else outside the supported node and mark set. The filtering is
TipTap's schema itself rather than a sanitiser library — nothing is ever rendered as raw HTML.

Not supported: `.doc` (the pre-2007 binary format), `.pdf`, `.rtf`, `.odt`. Uploading one
returns a clear error naming the supported set, and the extension is authoritative — a `.pdf`
renamed to `.md` is caught when the bytes fail to decode as text.

Sample files to try live in [`samples/`](./samples/).

---

## Project structure

```
app/
  api/
    auth/            login · logout · me — cookie session
    documents/       list · create · read · update · delete · import
      [id]/shares/   grant · change role · revoke (owner-only)
    users/           the demo directory behind the share picker
    health/          {ok, db, users} — what the deploy gate asserts on
  documents/         dashboard (owned vs shared) and the editor page
  login/
components/
  auth/ dashboard/ documents/ editor/ layout/ share/
  ui/                shadcn primitives
lib/
  permissions.ts     resolveAccess + the capability matrix — the whole access model
  session.ts         session-token.ts  password.ts  env.ts
  api.ts             withSession, ApiError, JSON helpers used by every route
  schemas.ts         Zod request bodies
  documents/         content validation, queries, the conditional update
  import/            constants · validate · parsers · html-to-pm · title
  editor-extensions.ts   the one node/mark set, shared by editor and importer
hooks/               useAutosave, useDebouncedCallback
prisma/              schema.prisma · one migration · seed.ts
tests/
  fixtures/import/   the files the import tests parse
  integration/       route handlers against real Postgres
samples/             sample.md · sample.txt · sample.docx, for reviewers
specs/               the specification set, committed before any code
docs/ai-log.md       the running build journal AI-WORKFLOW.md is written from
```

Unit tests sit next to the code they cover (`lib/**/*.test.ts`); integration tests are
collected under `tests/integration/`.

---

## Known limitations

Deliberate scope cuts, not defects, except where marked. The reasoning is in
[ARCHITECTURE.md](./ARCHITECTURE.md).

- **No real-time collaboration.** Two people editing the same document do not see each
  other's keystrokes. Each save is *conditional* on the `updatedAt` the client loaded, so the
  second writer's save is rejected with a **409**, autosave suspends, and an amber banner
  reads *This document changed elsewhere.* with a **Reload** button. Reload is the only
  recovery — there is no merge. Last write wins, but never silently.
- **Sharing is user-to-user only.** There are no public/link shares, no "anyone with the
  link", and no email invitations — a share target must already be one of the three seeded
  accounts. An unknown address returns **404 `USER_NOT_FOUND`**, which is deliberate for a
  three-account demo but would become invite-by-exact-email in a real product.
- **No signup and no password reset.** The three seeded accounts are the whole user
  directory, which is what keeps the sharing flow reviewable in one sitting.
- **`GET /api/users` returns the entire demo directory** to any signed-in user, to power the
  share picker's autocomplete. With three seeded accounts and no real PII that is acceptable
  here; in production it would be invite-by-exact-email, returning a match or nothing.
- **No rate limiting on login**, and the session JWT has no server-side revocation — it
  simply expires. Both are demo-scale choices.
- **Formatting is limited** to bold, italic, underline, H1–H3, and bulleted/numbered lists.
  No tables, images, code blocks, colours or fonts, in the editor or through import.
- **Imported files are not retained** — only the parsed document and the original filename.
- **No public links.** Sharing is user-to-user only.
- **No comments, suggestions, presence indicators, or version history.**
- **No folders, tags, search, trash, or pagination.**
- **Desktop-first.** The editor is usable on a tablet but is not optimised for phones.

---

## Further reading

- [ARCHITECTURE.md](./ARCHITECTURE.md) — what was prioritised, the access model, the autosave
  and conflict story, and what I would build next.
- [AI-WORKFLOW.md](./AI-WORKFLOW.md) — which AI tools were used, where they helped, and what
  their output got rejected for.
- [SUBMISSION.md](./SUBMISSION.md) — the index of everything included in this submission.
- [`specs/`](./specs/) — the full specification set, committed before the implementation.
  [`specs/DECISIONS.md`](./specs/DECISIONS.md) is the ruling record: every decision that
  changed the plan mid-build, with the evidence for it.
- [`docs/ai-log.md`](./docs/ai-log.md) — the build journal.
