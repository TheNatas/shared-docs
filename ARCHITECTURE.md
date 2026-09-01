# Architecture note

I had about eight hours, and spent them on the two things this brief grades hardest and that
are hardest to retrofit: **the access model** and **the editing experience, including not
losing anyone's work**. Breadth was sacrificed on purpose. Everything else is boring by choice
— Next.js on Vercel, Route Handlers as a real API, Postgres on Neon via Prisma, TipTap, seeded
accounts instead of signup — which left the budget for a permission resolver every route goes
through, a role matrix enforced on the server and mirrored in the UI, and autosave that fails
loudly rather than quietly. That bought two things a reviewer can probe in a minute: edit a
document you can only view, or save the same document from two browsers. It cost search,
comments and version history.

## Request flow

```
Browser — React + TipTap, same-origin session cookie
   │
Edge middleware ── no session ──► 307 /login?next=%2Fdocuments
   │
   ├─► Server Component — calls lib/documents/queries.ts DIRECTLY, no self-fetch
   │
   └─► Route Handler /api/…
          1. session from the signed cookie (jose HS256)   → 401
          2. Zod parse of body or query                    → 400
          3. resolveAccess(userId, docId) → OWNER|EDITOR|VIEWER|NONE
          4. can(role, capability)        → 404 if NONE, 403 if not allowed
          5. conditional write on lastKnownUpdatedAt       → 409
                 ▼
          Prisma ──► Postgres (Neon us-east-1; Vercel functions iad1)
```

Every mutating route runs those five steps in that order, so permissions are decided in one
place. Pages are Server Components reading the database through the *same* module the handlers
use — nothing self-fetches its own API.

## Data model, and why content is ProseMirror JSON

`User`, `Document`, `DocumentShare`, with `@@unique([documentId, userId])`: one role per user
per document. Content is a `Json` column holding the ProseMirror document node.

The strong reason is security: **the editor's schema is the sanitizer.**
`lib/editor-extensions.ts` is one frozen allow-list — bold, italic, underline, headings 1–3,
both list types; `codeBlock`, `link`, `blockquote`, `strike` and `horizontalRule` are disabled
— and both the editor and the server-side importer build from it, so anything outside that set
is dropped on the way in. Verified against a fixture with a fenced code block and a Markdown
link: the code block and the `link` mark are both dropped, while the link's *text* survives as
plain text. No sanitizer library is involved, and nothing is `dangerouslySetInnerHTML`'d. JSON
is awkward to query in SQL; with no search, we never pay that.

## Access control

One resolver, one pure function. `resolveAccess(userId, documentId)` is a single query whose
`OR` covers ownership and share membership and whose filtered `include` returns only this
caller's share row; it answers `OWNER | EDITOR | VIEWER | NONE` and carries the row out with
it. `can(role, capability)` is a lookup into a 4×6 table over `read`, `update`, `rename`,
`delete`, `viewShares` and `manageShares` — no database, no clock, no request context, which is
why all 24 cells are asserted in the unit suite with no Postgres.

**No access returns `404`, never `403`.** `403` means "this exists but you may not do *that*",
which is only true of someone who already has read access; returning it for a document you
cannot read confirms it exists — an enumeration oracle. The resolver therefore answers `NONE`
for both cases, and an integration test asserts the no-access body *deep-equals* a nonexistent
id's: that equality is the property. The read-only editor a VIEWER sees is UX; the server's
`403` is the control.

## Autosave and conflicts

There is no real-time collaboration; the honest substitute is optimistic concurrency. Autosave
is debounced, sends title and content in one patch, and carries the `updatedAt` the document
was loaded at. The server makes the write *conditional* on that token — one `updateMany({
where: { id, updatedAt } })`, so Postgres evaluates the predicate and takes the row lock in one
statement — and zero rows affected becomes `409 CONFLICT`, which suspends autosave and raises
an inline banner whose only action is **Reload**. The token advances only from a success body,
and one PATCH per document is in flight at a time — without that guard a lone user editing for
two minutes would 409 against themselves.

Last write wins, but never *silently*. What it does not give you is two people typing at once;
one of them reloads. A real implementation needs ProseMirror **steps** rather than snapshots, a
**version column**, and a **rebase** path replaying a client's steps over the ones it missed —
days of work, and a wrong one is worse than none.

## Import without blob storage

Uploads are parsed server-side and stored as document content; only `sourceFilename` survives,
as provenance on the card. `.docx` goes through mammoth, `.md` through marked, `.txt` becomes
paragraph nodes; all three land in the same `generateJSON` call against the frozen schema, so
imports obey the same allow-list as typed text.

Supported files: .md, .txt, .docx — maximum 2 MB per file.

This is the decision that removed a whole dependency: no S3, no Vercel Blob, no signed URLs,
nothing to provision. The trade: the original cannot be re-downloaded — right for "turn this
file into a document" rather than "store my files".

## What I deliberately cut

| Cut | Reason |
|---|---|
| Real-time collaborative editing | Days of work; the `409` + Reload path replaces it |
| Public link sharing | Sharing is user-to-user; a link is a second auth path |
| Comments, suggestions, presence | Stretch items in the brief, not core |
| Version history | Needs a snapshot table and a restore UI |
| Tables, images, code blocks, colours | Every allowed node is one the importer handles |
| Signup, password reset, email | The graded flow is *sharing*; seeding is faster |
| Folders, tags, search, pagination | Three users, five seeded documents |
| Mobile-optimised editing | Responsive-tolerant, desktop-first |

## Known trade-offs

| Trade-off | Acceptable because | Production fix |
|---|---|---|
| `GET /api/users?q=` is a demo directory | Three seeded accounts, no real PII | Invite by exact email — one match or nothing, never a list |
| No rate limiting on login | Demo accounts, published password | Per-IP and per-account throttling |
| Session JWTs are not revocable | 7-day expiry, no password-change flow | Server-side sessions, rotated on password change |
| No audit trail on shares | The matrix is visible in the share dialog | A `ShareAudit` row per grant, change and revoke |

## What I would build next, in 2–4 hours

Ranked by risk reduced per hour, not interest.

1. **Presence indicators** — cheapest fix for the biggest gap; an avatar row turns the
   `409` from a surprise into an expectation.
2. **Version history** — a snapshot every N autosaves makes last-write-wins *recoverable*,
   the real residual risk here.
3. **Export to Markdown and PDF** — closes the loop with import; a tree walk over content
   already stored structurally.
4. **A Playwright happy path** — create → share → view as VIEWER → denied. The server logic
   is covered; the wiring between screens is not.
5. **Invite by exact email** — removes the one deliberate security simplification; last
   because nothing a reviewer can break depends on it.
