# Submission — shared-docs

A small full-stack document product: create and edit rich text in the browser, import a file
into a new document, and share documents with other users as **Viewer** or **Editor**.

**Natanael Alves Gabriel** · natanael@develblockchain.com

---

## 1. Google Drive folder

> ⬜ **PENDING — to be filled in before sending.**
> `<paste the Google Drive folder link here>`
>
> The folder must be shared as **"Anyone with the link → Viewer"**, and that setting must be
> verified from a logged-out incognito window before submitting.

Everything in that folder is also in the repository below, so the two are interchangeable if
the link ever fails.

## 2. Live deployment

**https://shared-docs-thenatas-projects.vercel.app**

No signup, no configuration, nothing to install. The login page has one-click buttons for all
three demo accounts.

Health check, if you want to confirm the backend and database before clicking anything:

```bash
curl https://shared-docs-thenatas-projects.vercel.app/api/health
# {"ok":true,"db":"up","users":3}
```

> ⚠️ The short name `shared-docs.vercel.app` is **not** this project — it belongs to an
> unrelated party and redirects elsewhere. Please use the full URL above.

**Source code:** https://github.com/TheNatas/shared-docs (public)

## 3. Credentials and seeded accounts

All three accounts share the password **`demo1234`**. The login page also has
**Sign in as Alice / Bob / Carol** buttons so you never have to type them.

| Account | Email | Password | What it is set up to demonstrate |
|---|---|---|---|
| **Alice** | `alice@example.com` | `demo1234` | The owner. Owns 4 documents and has shared 3 of them. Start here. |
| **Bob** | `bob@example.com` | `demo1234` | **Editor** on one document, **Viewer** on another, and owns 1 document of his own that Alice cannot see. |
| **Carol** | `carol@example.com` | `demo1234` | **Viewer** on one document, **Editor** on another, and **no access at all** to a third — which is the denial path. |

### The seeded access matrix

This is deliberately arranged so every access level is reachable in a few clicks.

| Document | Owner | Bob | Carol |
|---|---|---|---|
| Q3 Product Roadmap | Alice | **Editor** | — |
| Team Handbook | Alice | — | **Viewer** |
| Imported: Product Brief | Alice | **Viewer** | **Editor** |
| Alice — Private Draft | Alice | — | — |
| Bob's Meeting Notes | Bob | *(owner)* | — |

**"Alice — Private Draft" is the interesting one.** Carol has no access to it, and requesting
it as Carol returns **404, not 403** — the response body is byte-identical to the response for
an id that never existed, so a document's existence never leaks. There is an integration test
that asserts those two bodies equal *each other*.

### Reviewing the sharing flow with two users at once

Use a **normal window and a private/incognito window**. A second tab is not enough — it shares
the same cookie jar, so you would just be signing yourself out. Sign in as Alice in one and
Carol in the other.

## 4. Running it locally

### Prerequisites

| | Version | Needed for |
|---|---|---|
| Node | 22.x | everything |
| pnpm | 10.x | everything |
| Docker | any recent | **integration tests only** — the app and the unit tests do not need it |

### Setup, from a clean clone

```bash
git clone https://github.com/TheNatas/shared-docs.git
cd shared-docs
pnpm install
```

Create `.env` in the project root:

```bash
cat > .env <<'EOF'
DATABASE_URL="postgresql://test:test@localhost:55432/shared_docs_dev"
DIRECT_URL="postgresql://test:test@localhost:55432/shared_docs_dev"
AUTH_SECRET="replace-me-with-at-least-32-random-characters"
EOF

# generate a real secret
echo "AUTH_SECRET=\"$(openssl rand -base64 32)\"" 
```

`AUTH_SECRET` must be **at least 32 characters**. The app refuses to start otherwise, on
purpose, rather than falling back to a built-in signing key.

Start the database, apply the schema, load the demo data, and run:

```bash
pnpm db:up        # Postgres in Docker on port 55432
pnpm db:migrate   # apply the single init migration
pnpm db:seed      # 3 users, 5 documents, 4 shares — idempotent, safe to re-run
pnpm dev          # http://localhost:3000
```

Sign in with the same seeded accounts as above.

`pnpm db:seed` is the reset button. Run it any time to put the demo data back exactly as it
was; it upserts, so running it twice changes nothing.

### Running the tests

```bash
pnpm test:unit          # 124 tests — needs NOTHING but `pnpm install`
pnpm test:integration   # 45 tests against a real Postgres — needs Docker
pnpm test               # both
```

The unit suite is deliberately dependency-free: no `.env`, no Docker, no network. That was
verified by moving all env files aside and running it again, not by assuming. So there is
always something you can run immediately after cloning.

The integration suite refuses to run against any database that is not named
`shared_docs_test` on port `55432`. It `TRUNCATE`s every table between tests, so the guard
parses the URL and checks the database name, port and host exactly.

---

## Review in 60 seconds

The shortest path through everything the brief asks about:

1. Open the [live app](https://shared-docs-thenatas-projects.vercel.app) → **Sign in as Alice**.
2. The dashboard has two clearly separated sections: **My documents** and **Shared with me**.
3. Open **Q3 Product Roadmap**. Select some text and use the toolbar — **bold, italic,
   underline, H1/H2/H3, bulleted and numbered lists**. The status in the top-right moves through
   *Unsaved → Saving → Saved* on its own.
4. **Reload the page.** The formatting is still there. Content is stored as structured
   ProseMirror JSON, not HTML.
5. Back on the dashboard, click **Import file** and pick `samples/sample.md` from the repo
   (or any `.md` / `.txt` / `.docx` under 2 MB). It becomes a new, editable document with its
   formatting intact, and the card shows where it came from.
6. In the editor, click **Share**, enter `carol@example.com`, choose **Viewer**, click
   **Share**.
7. In a **private window**, sign in as **Carol**. The document appears under **Shared with me**
   with a *Viewer* badge, the editor is read-only, and a banner says so.
8. Still as Carol, visit `/documents/seed-doc-private`. You get a **404, not a 403**.

> The demo database is shared between reviewers and there is no per-visitor reset. Sharing a
> document you created yourself disturbs nothing. If you grant someone access to
> **Alice — Private Draft**, please revoke it afterwards, since step 8 depends on Carol not
> having access to that one document.

---

## What is included

| Deliverable | Where |
|---|---|
| Source code | [github.com/TheNatas/shared-docs](https://github.com/TheNatas/shared-docs) · `source-code.zip` in the Drive folder |
| `README.md` | repo root — setup, run, limits, project structure |
| Architecture note | [`ARCHITECTURE.md`](./ARCHITECTURE.md) — what I prioritised and why |
| AI workflow note | [`AI-WORKFLOW.md`](./AI-WORKFLOW.md) — tools, speed-ups, what I rejected, how I verified |
| This file | `SUBMISSION.md` |
| Live product URL | https://shared-docs-thenatas-projects.vercel.app |
| Walkthrough video | ⬜ **PENDING** — `walkthrough-video-url.txt` in the Drive folder |
| Screenshots | ⬜ **PENDING** — `screenshots/` in the Drive folder |

## What is working

- **Documents** — create, rename inline, edit, autosave with a visible save state, reopen with
  formatting preserved, delete.
- **Rich text** — bold, italic, underline, H1–H3, bulleted and numbered lists, undo/redo. Every
  control has a keyboard shortcut and an `aria-label`.
- **File import** — `.md`, `.txt` and `.docx` up to 2 MB become new editable documents.
  The limits are stated in the UI and in the README, in the same words. Rejections are specific:
  wrong type, too large, empty, and unparseable are four different errors.
- **Sharing** — an owner grants access by email as **Viewer** or **Editor**, changes a role, or
  revokes. Re-inviting someone updates their role instead of duplicating them. Only the owner
  sees the Share button, and every share endpoint returns 403 to a non-owner regardless.
- **Access control** — one resolver, one pure capability function, four roles
  (Owner/Editor/Viewer/None) across six capabilities. No access returns 404, never 403.
- **Persistence** — Postgres on Neon via Prisma. Survives refresh and redeploy.
- **Tests** — 169 automated tests (124 unit, 45 integration).
- **Deployment** — live on Vercel, no login wall, seeded and ready.

## What is incomplete

Stated plainly, because the brief asks:

- **No real-time collaboration.** Two people editing simultaneously do not see each other's
  keystrokes. Each save is conditional on the `updatedAt` the client loaded, so a second writer
  gets a **409**, autosave suspends, and a banner offers **Reload**. Last write wins, but never
  silently. There is no merge.
- **No signup or password reset.** Three seeded accounts only.
- **No version history, comments, or export.**
- **No end-to-end browser test.** Playwright was scoped out; coverage is unit + API integration
  plus a manual QA pass.
- **Desktop-first.** It does not break on a narrow screen, but it was not designed for one.
- **`GET /api/users`** returns the three-account directory for the share autocomplete. Fine for
  a demo, would be invite-by-exact-email in a real product.

## What I would build next, with 2–4 more hours

1. **A Playwright end-to-end test** of the two-browser sharing flow. It is the one gap where an
   integration suite cannot see a regression — a component can be built, tested at the API
   level, and still not be mounted in the page. That happened during this build.
2. **Version history.** The schema change is small and the write already happens on a settle;
   the cost is the restore UI.
3. **Invite by exact email**, removing the user-directory endpoint.
4. **Rate limiting on login**, which is the one genuinely missing security control.

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the reasoning behind each.

---

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind v4 · shadcn/ui ·
TipTap v3 (ProseMirror) · Prisma 6 · PostgreSQL on Neon · Vercel · Vitest 4 · Zod 4 ·
`jose` for sessions · `bcryptjs` for password hashing.
