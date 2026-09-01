# 09 — Walkthrough Video & Google Drive Submission

**Purpose.** This spec covers the last mile: the 3–5 minute walkthrough video (brief §"Walkthrough
Video") and the single Google Drive folder that constitutes the actual submission (brief
§"Deliverables" and §"Submission Format"). It is a *procedure* spec, not a code spec — it defines a
shot-by-shot video script with a timing budget, the exact Drive folder tree, the command that
produces the source zip, the screenshot list, and the pre-submission verification that stops the two
classic zero-score failures: an unshared Drive folder and a link the reviewer cannot open. Nothing
here changes the product; everything here decides whether the product gets seen. Budget for this
slice: **1h45 of the 8h**, spent after feature freeze (see `00-foundation.md` §9 R5).

> **Cross-references.** Permission semantics quoted in the script are canonical in
> `00-foundation.md` §6/§6a and expanded in `03-auth-and-permissions.md`. Seeded accounts are
> `00-foundation.md` §5. The siblings referred to below by role are `07-deployment-runbook.md`
> (deploy) and `08-docs-plan.md` (docs).

---

## Part A — The walkthrough video

### A.1 The five mandated beats, and where the marks actually are

The brief names five things the video must cover. They are not equally weighted in practice: three
of them are demonstrated for free by showing the app, and two are only earned by *saying them out
loud*. Those two are the ones candidates skip.

| # | Brief requirement | Covered by | Seconds | Risk if skipped |
|---|---|---|---|---|
| V1 | The main user flow | Live demo, 0:35–2:02 | 87s | Low — impossible to skip |
| V2 | What functionality works end to end | Live demo + one explicit sentence at 3:00 | 87s shared + 6s | **Medium** — reviewers want it *claimed*, not just shown |
| V3 | What you intentionally deprioritized | Spoken beat, 3:38–4:08 | 30s | **High — most-skipped, explicitly graded** ("strong candidates make deliberate scope cuts and explain them clearly") |
| V4 | Key implementation decisions | Spoken beat, 3:00–3:38 | 38s | Medium |
| V5 | How AI supported your workflow | Spoken beat, 4:08–4:44 | 36s | **High — most-skipped, explicitly graded** ("practical AI usage, not volume") |

**Consequence for the script:** V3 + V5 get **66 seconds of the 284**, roughly a quarter of the
video, with nothing on screen but a static slide or the dashboard. That feels wasteful while
recording. It is not. Do not trade those seconds back to the demo.

The scope thesis at 0:20 is V3 stated a second time, up front, because a reviewer who stops watching
at 1:00 should still have heard the cut list.

### A.2 Shot-by-shot script

Total runtime **4:44**. Hard cap **5:00**; hard floor **3:00** — a 2:50 video violates the brief
exactly as much as a 5:10 one. The 16 seconds of slack absorb one fumbled sentence, not three.

| Timecode | Len | On screen | What is being said (beat, not verbatim) |
|---|---|---|---|
| 0:00–0:20 | 20s | Live deployed URL, `/login`, demo buttons visible | Name + one-sentence product statement. See A.3 for verbatim. |
| 0:20–0:35 | 15s | Same, or a single static "Scope" slide | The thesis: "8 hours. I went deep on **access control** and the **editing/persistence loop**, and cut real-time collab, comments, and blob storage on purpose. I'll come back to the cuts at the end." |
| 0:35–1:00 | 25s | Click **Log in as Alice** → `/documents` dashboard | Point at **My documents** vs **Shared with me** as two labelled sections with role badges. Click **New document**. |
| 1:00–1:30 | 30s | Editor: type a heading, bold/italic/underline, a bulleted list; save indicator flips *Saving… → Saved*; **hard reload** | Formatting + autosave + reload proves persistence. **Reload on camera — do not cut.** Say: "That's Postgres, not localStorage." |
| 1:30–2:02 | 32s | Dashboard → **Import** → pick `samples/sample.md` → lands in editor with headings/lists/bold intact | "Markdown, plain text or .docx becomes a new editable document. The file is parsed server-side into ProseMirror JSON — I keep the content, not the file, so there's no blob storage to configure." Show the stated file-type limit in the UI. |
| 2:02–2:35 | 33s | Share dialog: add **Bob → Editor**, then **Carol → Viewer**; both appear in the share list with role selects | Owner-only dialog. Mention re-sharing the same person updates their role instead of duplicating. |
| 2:35–2:52 | 17s | **Second browser profile**, already logged in as Carol → open the shared doc | Read-only banner, toolbar disabled, doc appears under **Shared with me** with a `Viewer` badge. |
| 2:52–3:00 | 8s | Terminal (large font) — pre-typed `curl` PATCH as Carol → `403`; second command on a doc she can't see → `404` | "The disabled toolbar is a courtesy. This is the actual control — and no-access returns 404, not 403, so we never leak that a document exists." |
| 3:00–3:38 | 38s | Editor or a static "Decisions" slide; optionally the `resolveAccess` function in the editor | V2 sentence first: *"Everything I just showed works end to end on the deployed URL — nothing is stubbed."* Then four decisions: ProseMirror JSON storage; one `resolveAccess` resolver every route calls; 403 vs 404; optimistic concurrency (`lastKnownUpdatedAt` → `409`) instead of fake real-time. |
| 3:38–4:08 | 30s | Static "Cut / Next" slide | V3: cut real-time collaboration (days of work; shipped an honest 409 conflict instead), comments/presence, tables/images, self-service signup, blob storage. Then: with 2–4 more hours — share revocation UX polish, document version history, and a Playwright end-to-end test for the share flow. |
| 4:08–4:44 | 36s | Same slide, or the repo's `specs/` folder | V5 + sign-off. See A.3 for verbatim. |

**Reconciliation notes vs the suggested allocation.** Three changes, all for the same reason —
buying slack:

1. The core flow is 55s instead of 60s; typing a paragraph on camera is dead air, so type *short*.
2. The sharing beat is split 33/17/8 rather than one 60s block, because the second-browser hand-off
   is where takes die. Have the Carol window already open on the correct URL, already logged in,
   *behind* the first window — switch to it, do not navigate to it.
3. The `curl` commands are **pre-typed in the terminal's scrollback**, so 2:52–3:00 is two `Enter`
   presses, not eight seconds of typing. Type them during prep, clear the screen, then `↑` on camera.

### A.3 Verbatim script — opening and closing

These are the two hardest passages to improvise and the two the reviewer remembers. Read them.
Pace target ~150 words/minute (≈2.5 words/second).

**Opening — 0:00 to 0:20 (48 words, ≈19s):**

> "Hi, I'm Natanael. This is **shared-docs**: sign in, write in a rich-text editor that autosaves,
> import a Markdown or Word file as a new document, and share it with someone as a viewer or an
> editor. Everything you're about to see is the deployed build, not localhost. Eight hours, start to
> finish."

**Closing — 4:08 to 4:44 (89 words, ≈36s):**

> ⚠️ **The two examples in this passage are PLACEHOLDERS.** They are the *shape* of the answer —
> one named speed-up, one named rejection — filled in at **hour 7**, after `AI-WORKFLOW.md` §3 is
> written, from what `docs/ai-log.md` actually recorded. Do not memorise them as written. A script
> that pre-commits to a rejection the build never made is a fabrication, and it is a fabrication in
> the one beat of the video the brief singles out as "practical AI usage, not volume".

> "On AI: I wrote the spec first and had Claude implement against it. The clearest win was
> ⟨**SPEED-UP — from `docs/ai-log.md`, an entry with a real artifact and a rough saving**; the
> placeholder was: the access-control test suite — I described the permission matrix once and got
> the table-driven Vitest suite and the Prisma seed back in one pass, maybe forty minutes saved⟩.
> The clearest rejection: ⟨**REJECTION — from a log entry with verdict `REJECTED`**; the placeholder
> was: its first draft of the document route re-derived permissions inline and returned 403 to users
> with no access at all, which leaks that the document exists. I replaced it with a single
> `resolveAccess` function that returns 404, and pinned it with a test⟩. Specs and tests are how I
> check AI output. The README has the seeded logins — thanks for watching."

That closing satisfies V5 with **one named speed-up** and **one named rejection**, which is exactly
what the brief asks for ("where AI materially sped up your work" / "what AI-generated output you
changed or rejected"). **Both examples must be the same two stories, in the same words, as
`AI-WORKFLOW.md` §3** — `08-docs-plan.md` §4 owns them, and this script follows it. Dependency:
`T28` cannot be recorded before `T24` (`AI-WORKFLOW.md`) is written.

### A.4 Pre-recording checklist

Work top to bottom. Budget **20 minutes**. Do not start take 1 until every box is ticked.

- [ ] **Restore the seeded data** against the database the demo will run on: **`pnpm db:seed`**.
      The seed is upsert-only and contains no `deleteMany` (`01-data-and-persistence.md` §7.6), so
      re-running it restores the five canonical documents, titles, content and shares while leaving
      anything a reviewer created in place. That *is* the reset. **Do not use `pnpm db:reset`
      here** — it is `prisma migrate reset --force`, it drops the database, and it is local-only;
      running it against Neon destroys the deployment a reviewer may be looking at.
      Then confirm: **Alice owns four documents and has shared three**, Bob is `EDITOR` on
      "Q3 Product Roadmap", Carol is `VIEWER` on "Team Handbook", and **nobody but Alice can see
      "Alice — Private Draft"** — that last one is the 404 demo.
- [ ] **Record against the live Vercel URL**, not `localhost`. It doubles as proof of C14. Only fall
      back to localhost if the deployment is broken at record time, and say so on camera if you do.
- [ ] **Two independent sessions.** Chrome profile "Demo A" logged in as Alice; Chrome profile
      "Demo B" (or a private window) logged in as Carol, already on the shared document's URL. Two
      *windows*, sized and positioned, not two tabs — tab switching on video is unreadable.
- [ ] **Browser zoom 110–125%** on both windows, screen captured at 1080p. Anything at 100% zoom is
      illegible after YouTube re-encodes it. Check by squinting at a paused frame.
- [ ] **Terminal font 18–20pt**, dark theme, window ~100 columns. Pre-type both `curl` commands (see
      A.5), verify they return `403` and `404`, then `clear`.
- [ ] **Notifications off** — OS Do Not Disturb, Slack/Discord/mail quit, phone face down.
- [ ] **Close every unrelated tab and window.** Bookmarks bar hidden if it has anything personal.
- [ ] **Scratch import file ready** — use the committed **`samples/sample.md`** (`05-import-spec.md`
      §4), not an ad-hoc file on the Desktop: it is the same file `README.md` and `SUBMISSION.md`
      tell the reviewer to try, so the video shows exactly what they will do. ~15 lines with an `#`
      heading, an `##` subheading, `**bold**`, `*italic*` and a `-` list, so the
      formatting-preserved claim is visible on screen without scrolling.
- [ ] **One dry run, out loud, timed**, with the recorder off. If it lands over 4:50, cut sentences
      now — not in the edit.
- [ ] Static "Scope" and "Cut / Next" slides ready if you're using them (a plain full-screen text
      file in the editor at 24pt is fine; do not build a deck).

### A.5 Pre-typed terminal commands

Run these during prep to confirm they work, then `clear` and recall with `↑` on camera. Emails
follow the seed convention `<name>@example.com`; if the data/seed spec fixed different addresses,
those win.

```bash
BASE=https://shared-docs.vercel.app
DOC=<id of a doc Carol can VIEW>
HIDDEN=<id of a doc Carol has NO access to>

# Log in as Carol and keep the session cookie
curl -s -c /tmp/carol.txt -X POST "$BASE/api/auth/login" \
  -H 'content-type: application/json' \
  -d '{"email":"carol@example.com","password":"demo1234"}' -o /dev/null -w '%{http_code}\n'
# → 200

# Viewer tries to write → 403 (she can see it, but not do that)
curl -s -b /tmp/carol.txt -X PATCH "$BASE/api/documents/$DOC" \
  -H 'content-type: application/json' \
  -d '{"title":"nope","lastKnownUpdatedAt":"2026-01-01T00:00:00.000Z"}' \
  -w '\n→ HTTP %{http_code}\n'
# → {"error":{"code":"FORBIDDEN",...}}  → HTTP 403

# No access at all → 404, never 403 (existence is not leaked)
curl -s -b /tmp/carol.txt "$BASE/api/documents/$HIDDEN" -w '\n→ HTTP %{http_code}\n'
# → {"error":{"code":"NOT_FOUND",...}}  → HTTP 404
```

Browser devtools is an acceptable substitute for the 403 (Network tab, click the failed `PATCH`,
show the status), but the terminal shows **403 and 404 side by side in one frame**, which is the
whole point of the beat. Prefer the terminal.

### A.6 Recording, hosting, and the link

| Item | Decision |
|---|---|
| Resolution | 1920×1080 minimum, 30fps |
| Audio | **Mic on, system audio off.** No music. |
| Tool | Loom desktop, or OBS → unlisted YouTube |
| Loom caveat | The free plan caps recordings at 5 minutes and **truncates** rather than warning. Targeting 4:44 is also insurance against losing the closing beat — which is the graded V5 beat. |
| YouTube caveat | Set visibility to **Unlisted**, not Private. Private is invisible to the reviewer and is functionally a broken link. |
| Editing | Trim head/tail only. No cuts, no captions, no zooms. |
| Verification | **Open the final link in a logged-out incognito window and play 10 seconds of it.** A link the reviewer cannot open scores zero, and it fails silently for you because you are logged in. |
| Filename/title | `shared-docs walkthrough — Natanael Alves Gabriel` |

### A.7 The two-take rule

**Maximum two takes. Timebox the whole recording block to 45 minutes.**

Take 1 is the real attempt; if it is watchable, it ships. Take 2 exists for one structural failure
(wrong data state, dead mic, a broken feature discovered on camera). There is no take 3 — at 8 hours
total, a third take costs more than every polish item still on the list.

If you fumble mid-take: **stop, pause two seconds, and say the sentence again.** Do not restart. A
reviewer grading "verbal communication quality" is judging clarity and structure, not radio polish,
and a fluent re-take with a missing V3 beat scores worse than a rough take with all five.

---

## Part B — The Google Drive submission

### B.1 Folder name and exact contents

Drive folder name, exactly:

```
shared-docs — Natanael Alves Gabriel
```

Contents, one-to-one with the brief's deliverables list:

```
shared-docs — Natanael Alves Gabriel/
├── SUBMISSION.md                    ← read-me-first index; brief: "listing exactly what is included"
├── README.md                        ← brief: local setup and run instructions
├── ARCHITECTURE.md                  ← brief: short architecture note
├── AI-WORKFLOW.md                   ← brief: AI workflow note
├── live-url.txt                     ← brief: live product URL
├── walkthrough-video-url.txt        ← brief: text file with the video URL
├── source-code.zip                  ← brief: the source code
└── screenshots/                     ← brief: screenshots / demo GIF
    ├── 01-login-demo-accounts.png
    ├── 02-dashboard-owned-and-shared.png
    ├── 03-editor-formatting-toolbar.png
    ├── 04-share-dialog-role-select.png
    ├── 05-viewer-read-only-state.png
    └── 06-permission-403-vs-404.png
```

| Deliverable | Brief line | File |
|---|---|---|
| Source code | "The source code" | `source-code.zip` **and** the GitHub link inside `SUBMISSION.md` |
| Setup/run | "A README.md with local setup and run instructions" | `README.md` |
| Architecture note | "A short architecture note in Markdown or PDF" | `ARCHITECTURE.md` |
| AI note | "Your AI workflow note in Markdown or PDF" | `AI-WORKFLOW.md` |
| Index | "A SUBMISSION.md file listing exactly what is included" | `SUBMISSION.md` |
| Live URL | "A live product URL we can test" | `live-url.txt` (also first line of `SUBMISSION.md`) |
| Video URL | "A text file with the walkthrough video URL" | `walkthrough-video-url.txt` |
| Screenshots | "Screenshots or a short demo GIF" | `screenshots/` |

Exact contents of the two text files — one line each, nothing else, so nobody has to interpret them:

```text
# live-url.txt
https://shared-docs.vercel.app

# walkthrough-video-url.txt
https://www.loom.com/share/<id>
```

Both files are **committed at the repo root** (`live-url.txt` is written at the hour-2 deploy,
`walkthrough-video-url.txt` after the upload) and *copied* into `submission/` by the build script.
One source, two destinations — the same rule the screenshots follow.

`SUBMISSION.md` is owned by the docs spec, but this spec asserts three things it **must** contain,
because they are submission-format requirements from the brief rather than documentation:

1. The **live URL** and **video URL** repeated in the first ten lines.
2. The **seeded credentials** — `alice@ / bob@ / carol@example.com`, password `demo1234` — stated in
   full, plus who owns/shares what, so the sharing flow is testable without reading code. The brief
   asks for this explicitly under "Submission Format".
3. The **"working / incomplete / next 2–4 hours"** section the brief mandates for partial features.

### B.2 Why both a zip and a GitHub link

The brief says "one Google Drive folder containing… the source code", so a folder with only a link
is arguably non-compliant. But a zip is a dead artifact: no history, no diffs, and Drive cannot
preview it — the reviewer must download and unpack before reading a single line.

Ship both, and make them provably the same thing:

- `source-code.zip` — literal compliance, self-contained, immune to the repo being renamed or made
  private.
- `github.com/TheNatas/shared-docs` (public, per `00-foundation.md` §2) — browsable in one click,
  and the commit history is the evidence for "delivery discipline", which is on the evaluation list.
- `SUBMISSION.md` states the **commit SHA** the zip was cut from, so the two cannot silently drift.

### B.3 Producing the source zip

`git archive` is the correct tool here precisely because it exports **tracked content at a commit**:
`node_modules/`, `.next/`, `.env` and every other ignored path are excluded by construction rather
than by a hand-maintained exclude list, and `.git/` is never included.

```bash
cd /home/thenatas_/Documents/natas/shared-docs
git archive --format=zip --prefix=shared-docs/ -o submission/source-code.zip HEAD
```

One `.gitattributes` entry keeps the staging directory out of the archive it lives in:

```gitattributes
# .gitattributes
submission/ export-ignore
```

`specs/` is deliberately **kept** in the zip and in the public repo: a spec set written before the
code is the strongest available evidence for the AI-workflow requirement, and `AI-WORKFLOW.md`
points at it.

**Expected size: 200 KB – 1 MB** (source + `pnpm-lock.yaml`, which is most of it). Anything over
**5 MB** means something ignored got tracked — stop and inspect.

Verification, run every time the zip is cut:

```bash
# must print nothing
unzip -l submission/source-code.zip \
  | grep -E 'node_modules/|\.next/|/\.env$|\.env\.local|\.git/' \
  && echo 'LEAK — do not ship' || echo 'clean'

# sanity: file count and size
unzip -l submission/source-code.zip | tail -1
du -h submission/source-code.zip

# must be present
unzip -l submission/source-code.zip | grep -E 'README.md|prisma/schema.prisma|\.env\.example'
```

`.env.example` must be **in** the zip (the README's setup steps reference it); `.env` must not.

### B.4 Local staging in `submission/`

Everything is assembled locally into `submission/` first, then uploaded as a unit. This makes the
submission reviewable before it is public, reproducible if it has to be re-cut after a late fix, and
diffable against this checklist.

**Decision: `submission/` is gitignored except for `submission/README.md`.** Justification:

- The zip is a *build output of `HEAD`* — committing it is circular (the zip of a commit can never
  contain itself) and adds a ~500 KB binary to the repo on every re-cut.
- Screenshots are also binaries, but they have a second use: the repo `README.md` embeds them so the
  GitHub page looks like a product. So screenshots live **committed** at `docs/screenshots/` and are
  *copied* into `submission/screenshots/` by the build script. One source, two destinations.
- `submission/README.md` is committed so the folder's purpose and the rebuild command survive in the
  repo, which is the reproducibility half of the requirement.

```gitignore
# .gitignore
submission/*
!submission/README.md
```

`submission/README.md` (three lines, committed):

```markdown
# submission/ (generated)

Staging area for the Google Drive deliverable. Everything here except this file is
generated — rebuild with `./scripts/build-submission.sh`, then upload the folder's
contents to the Drive folder named `shared-docs — Natanael Alves Gabriel`.
```

`scripts/build-submission.sh` — committed, ~20 lines, idempotent, worth the 10 minutes:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf submission
mkdir -p submission/screenshots

git archive --format=zip --prefix=shared-docs/ -o submission/source-code.zip HEAD
cp README.md ARCHITECTURE.md AI-WORKFLOW.md SUBMISSION.md submission/
cp docs/screenshots/*.png submission/screenshots/

# Copy the COMMITTED files rather than echoing literals: 07-deployment-runbook.md's DoD
# and 08-docs-plan.md §7.2 both check the repo-root live-url.txt, and a hardcoded URL here
# drifts the moment the deployment changes.
cp live-url.txt walkthrough-video-url.txt submission/

# leak check
if unzip -l submission/source-code.zip | grep -qE 'node_modules/|\.next/|/\.env$'; then
  echo 'LEAK in source-code.zip — aborting' >&2; exit 1
fi

echo "built from $(git rev-parse --short HEAD) — $(du -h submission/source-code.zip | cut -f1)"
ls -R submission
```

Re-run it after **any** late code change, so the zip and the repo never disagree.

### B.5 Sharing permissions — the highest-risk step in the entire project

**Say it plainly: an unshared Drive folder is the single most common way a submission like this
fails.** The work is complete, the reviewer clicks the link, gets "You need access", and the
evaluation ends there. It fails silently for the submitter because the submitter is logged in as the
owner and the link works perfectly for them.

Procedure:

1. Upload the *contents* of `submission/` into the Drive folder `shared-docs — Natanael Alves
   Gabriel` (keep `screenshots/` as a subfolder).
2. Right-click the folder → **Share** → **General access** → **Anyone with the link** → role
   **Viewer**. Not "Restricted", not "Commenter", not "Editor".
3. **Use a personal Google account.** A Workspace/organisation account can have an admin policy that
   silently blocks or downgrades "Anyone with the link", including one that scopes it to the
   organisation only. If the option is greyed out or reads "Anyone at <org>", move the folder to a
   personal account and redo it.
4. Set sharing on the **folder before** — and again after — uploading, then spot-check individual
   files. Files uploaded into an already-shared folder inherit its access, but a file *moved in* from
   elsewhere can retain its own stricter permission.
5. Copy the share link with the **Copy link** button (not the browser address bar, which yields a
   URL that only works while signed in).

**Verification — non-negotiable, do it last, after every upload is finished:**

- [ ] Open a **logged-out incognito window** (verify you are logged out — Drive is aggressive about
      restoring sessions; use a private window in a *different browser* if unsure).
- [ ] Paste the folder link. The file list must render with **no sign-in prompt**.
- [ ] Open **every file**: the four `.md` files preview in Drive, `live-url.txt` and
      `walkthrough-video-url.txt` open, `screenshots/` expands and each PNG previews.
- [ ] **Download `source-code.zip`** from that incognito window. Download, not preview — a zip that
      cannot be downloaded anonymously is the same as a missing zip.
- [ ] From that same incognito window, click the **live URL**, the **video URL** and the **GitHub
      URL** out of `SUBMISSION.md`. All three must open.

Three adjacent link traps, each of which produces the same "reviewer sees nothing" outcome:

| Trap | Symptom for the reviewer | Fix |
|---|---|---|
| **Vercel Deployment Protection** | The live URL shows a Vercel SSO login wall | Project → Settings → Deployment Protection → **disabled** for production. Verify in incognito. |
| **GitHub repo still private** | 404 on the repo link | Settings → Change visibility → Public (`00-foundation.md` §2 already requires this) |
| **YouTube set to Private, or Loom set to "Only people invited"** | Video unavailable | Unlisted / "Anyone with the link". Verify in incognito. |

### B.6 Screenshots

Six PNGs, captured at **1920×1080** (or the browser viewport at ≥1600×1000 on a HiDPI screen), from
the **live deployed URL** with seeded data, browser zoom 110–125%, no personal bookmarks or
extensions visible. Naming convention: `NN-kebab-case-description.png`, zero-padded, ordered to
match the narrative of the demo. Target ≤1 MB each.

| File | Screen | Must be visible in frame |
|---|---|---|
| `01-login-demo-accounts.png` | `/login` | The credential form **and** the one-click demo buttons **and** the stated demo password |
| `02-dashboard-owned-and-shared.png` | `/documents` as Alice | Both labelled sections — **My documents** and **Shared with me** — with role badges, in one frame |
| `03-editor-formatting-toolbar.png` | `/documents/[id]` | Toolbar with an **active** bold/heading state, applied H1 + bold + italic + underline + a bulleted and a numbered list, and the *Saved* indicator |
| `04-share-dialog-role-select.png` | Share dialog, mid-flow | The dialog **open**, an email entered, the Viewer/Editor role select expanded, and the existing share list behind it |
| `05-viewer-read-only-state.png` | Same doc as Carol | Read-only banner, disabled toolbar, `Viewer` badge |
| `06-permission-403-vs-404.png` | Terminal | The `403` and the `404` responses from A.5 in one frame |

Screenshots 1–5 are the brief's list; 6 is the evidence for the claim that permissions are enforced
server-side, and costs one extra terminal capture. Source of truth is `docs/screenshots/`
(committed, embedded in the repo `README.md`); `scripts/build-submission.sh` copies them into the
Drive staging folder. No GIF — the video already covers motion, and a GIF is 20 minutes for zero
additional marks.

---

## Time budget for this slice

| Block | Minutes |
|---|---|
| Script rehearsal + environment prep (A.4, A.5) | 20 |
| Screenshots (six, A.6) | 15 |
| Recording, ≤2 takes, + upload + incognito link check (A.6, A.7) | 45 |
| `build-submission.sh`, zip cut, leak verification (B.3, B.4) | 15 |
| Drive upload + sharing + logged-out verification (B.5) | 15 |
| Final checklist + 10-minute reviewer simulation (below) | 15 |
| **Total** | **125 min ≈ 1h45** |

Writing `README.md`, `ARCHITECTURE.md`, `AI-WORKFLOW.md` and `SUBMISSION.md` is **not** in this
budget — that is the docs spec's slice. This spec only requires that they exist, and copies them.

---

## Final pre-submission checklist

Every line is verifiable. Do the **logged-out** ones from a single incognito session, in order, and
do them **last**.

**Artifacts exist**

- [ ] `source-code.zip` present, 200 KB – 1 MB, leak check clean, contains `README.md`,
      `prisma/schema.prisma`, `.env.example`
- [ ] `README.md`, `ARCHITECTURE.md`, `AI-WORKFLOW.md`, `SUBMISSION.md` all present in the Drive folder
- [ ] `live-url.txt` and `walkthrough-video-url.txt` present, one URL each, no placeholder text
- [ ] `screenshots/` contains all six PNGs, correctly named and ordered
- [ ] `SUBMISSION.md` names the commit SHA the zip was cut from, and it matches `git rev-parse HEAD`

**Content requirements from the brief**

- [ ] Seeded credentials (`alice@`/`bob@`/`carol@example.com`, `demo1234`) stated in **both**
      `README.md` and `SUBMISSION.md`, with who owns and who is shared what
- [ ] Supported import file types (`.md`, `.txt`, `.docx`) stated in the UI **and** the README (C8)
- [ ] `SUBMISSION.md` contains the "what works / what is incomplete / next 2–4 hours" section
- [ ] `ARCHITECTURE.md` names the deliberate cuts from `00-foundation.md` §4 and the
      `GET /api/users` enumeration trade-off

**Video**

- [ ] Runtime between **3:00 and 5:00** — check the actual player duration, not your stopwatch
- [ ] All five mandated beats present, and V3 (deprioritized) and V5 (AI) are each ≥25 seconds
- [ ] Audio audible throughout; no notification appears on screen
- [ ] Video link opens and plays **from a logged-out incognito window**

**Links, all verified logged-out**

- [ ] Drive folder opens with no sign-in prompt; every file previews; `source-code.zip` downloads
- [ ] Live Vercel URL loads with **no Vercel SSO wall** (Deployment Protection off — re-verify here
      even though it was checked at hour 2), login as Alice works, dashboard shows both sections,
      one edit saves and survives a reload — a real smoke test, not a page load
- [ ] GitHub repo loads and is **public**
- [ ] Video URL loads

**Final act — the 10-minute reviewer simulation.** In one incognito session, open only the Drive
link and behave like the reviewer: read `SUBMISSION.md` top to bottom, click every link it names,
log into the live app as Alice, create and format a document, log in as Carol in a second private
window, confirm read-only. If anything requires knowledge you have and the reviewer does not, fix
the document, not the reviewer.

- [ ] Reviewer simulation completed end to end with no dead ends
- [ ] Drive folder link pasted into the submission channel

---

## Open questions / proposed changes to 00-foundation

1. ✅ **R5 now freezes features at 5:30 and reserves 2.5 h.** `00-foundation.md` §9/R5 was
   rewritten: this slice measures 1 h 45 and `08-docs-plan.md` measures 2 h 15, which never fit the
   old 2 h window. `07-deployment-runbook.md` §0's timeline moved with it. Written communication
   quality is on the evaluation list and is no longer funded out of the last 15 minutes.
2. ✅ **Vercel Deployment Protection is now R2b in `00-foundation.md` §9**, owned by
   `07-deployment-runbook.md` §0/§4a step 7b, and checked from a **logged-out incognito window at
   the hour-2 deploy** — not at hour 7:50. It was previously proposed only here and owned by
   nobody, which made it the highest-consequence unowned item in the set: it fails silently for the
   author, who is always signed in, and zeroes C14 for the reviewer.
3. ✅ **The demo database is shared and mutable, and that stands** — the reviewer friction of any
   alternative is worse. Two requirements came out of it: **`pnpm db:seed` is run immediately before
   recording and before submitting** (the seed is restorative, not destructive —
   `01-data-and-persistence.md` §7.6), and `README.md` notes that the demo database is shared and
   re-seedable. Note the correction: the script is **`db:seed`**, not `db:reset` —
   `prisma migrate reset --force` is local-only and would drop the deployed database.
4. ✅ **`@example.com` is pinned in `00-foundation.md` §5**, with the three fixed user ids and the
   five fixed document ids. `08-docs-plan.md`'s README table, which said `@shared-docs.dev`, was
   corrected — a reviewer following those credentials could not have logged in.
5. ✅ **`00-foundation.md` §10 now lists `docs/screenshots/`, `docs/ai-log.md` and the gitignored
   `submission/` staging directory.** This spec's `docs/screenshots/` naming and its "no GIF"
   decision are the ones that ship; `08-docs-plan.md` §2.3 and §7.4 were rewritten against them,
   which removes five broken images from the top of the README.

---

## Definition of done

- [ ] A walkthrough video exists whose player-reported duration is **≥3:00 and ≤5:00**.
- [ ] The video demonstrably covers all five mandated beats, with the deprioritization beat and the
      AI beat each occupying **≥25 seconds**.
- [ ] The AI beat's speed-up and rejection are the **same two stories, in the same words**, as
      `AI-WORKFLOW.md` §3, and both trace to a real `docs/ai-log.md` entry. The placeholders in
      §A.3 were replaced, not recited.
- [ ] The video shows a **server-side 403 and a 404** (terminal or devtools), not only a disabled UI.
- [ ] The video was recorded against the **live deployed URL** with freshly seeded data.
- [ ] No more than **two takes** were recorded.
- [ ] `scripts/build-submission.sh` exists, is committed, and rebuilds `submission/` from a clean
      checkout in one command.
- [ ] `submission/source-code.zip` is cut with `git archive` from `HEAD`, is 200 KB – 1 MB, and the
      leak check for `node_modules/`, `.next/` and `.env` prints nothing.
- [ ] `.gitignore` ignores `submission/*` except `submission/README.md`; `.gitattributes` marks
      `submission/` as `export-ignore`.
- [ ] The Drive folder is named `shared-docs — Natanael Alves Gabriel` and contains exactly the eight
      entries in the B.1 tree.
- [ ] The Drive folder's General access is **Anyone with the link — Viewer**.
- [ ] From a **logged-out incognito session**: the Drive folder opens, all six screenshots and all
      four `.md` files preview, `source-code.zip` downloads, and the live / video / GitHub links in
      `SUBMISSION.md` all open.
- [ ] The live URL passes a real smoke test from that same session: log in as Alice, edit, reload,
      content persists.
- [ ] The GitHub repository is public and its `HEAD` SHA matches the SHA recorded in `SUBMISSION.md`.
- [ ] Seeded credentials appear in both `README.md` and `SUBMISSION.md`.
- [ ] The 10-minute reviewer simulation was completed with no dead ends.
