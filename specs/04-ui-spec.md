# 04 — UI / Frontend spec

**Purpose.** This document specifies every screen, component, and interaction of
**shared-docs** in enough detail that an implementer can build it without design
guesswork: the four routes from `00-foundation.md` §8 with their Server/Client
boundaries and data sources, the component tree with real file paths, wireframes and
behaviour for the login page, dashboard, editor and share dialog, the autosave hook
and its save-status state machine, the read-only and 409-conflict experiences, the
exact shadcn/ui primitives to install, and an accessibility floor that is actually
achievable in the budget. Server-side contracts (auth, `resolveAccess`, route
handlers, import parsing) live in `00-foundation.md` §§6–7 and
`03-auth-and-permissions.md`; this file only says how the client consumes them.
**Slice budget: 3.5 h of the 8 h total.**

---

## 1. Ground rules for the whole frontend

| Rule | Detail |
|---|---|
| Default is Server | Every file is a Server Component unless it needs state, effects, or DOM events. `'use client'` is pushed to the leaves (`LoginForm`, `DocumentEditor`, `ShareDialog`, …), never to a page. |
| Server reads go through `lib/`, not `fetch` | Server Components call **`lib/documents/queries.ts`** (`listDocumentsFor`, `getDocumentFor`) directly. They do **not** `fetch('/api/documents')` against themselves — self-fetch costs a network hop, forces absolute URLs, and needs cookie forwarding. **The route handlers call the same two functions** (`02-api-contract.md` §4.3 owns the module), so there is exactly one implementation of every read *and* the integration tests that exercise the handlers also cover the path the pages take. Without that, the access-control code a reviewer exercises by browsing would have zero automated coverage. |
| Client writes go through `/api` | All mutations (`PATCH` document, share CRUD, login, logout, import) are `fetch` calls from Client Components to the Route Handlers in `00-foundation.md` §7. That keeps the HTTP API the real, testable surface. |
| No client-side data library | No SWR / React Query / Redux. `fetch` + `useState` + `router.refresh()`. At four screens the abstraction costs more than it saves. |
| Revalidation | After a mutation that changes server-rendered data (create, delete, import, rename), call `router.refresh()`. Dashboard pages are dynamic (`export const dynamic = 'force-dynamic'`) because they are per-user and cookie-dependent. |
| Styling | Tailwind v4 utilities + shadcn/ui primitives. No custom CSS files except `app/globals.css` (Tailwind entry, theme tokens, and the `.prose-doc` editor typography block in §6.7). |
| Dates | Server-rendered lists use a pure helper `formatRelativeTime(iso: string): string` in `lib/format.ts` (~15 lines over `Intl.RelativeTimeFormat`) and render `<time dateTime={iso} title={absolute}>`. The value is computed **only on the server** for list views, so there is no hydration mismatch. Client-side relative time is used only inside `SaveStatus`. |

### 1.1 Shared types — imported, not redeclared

**There is no `lib/types.ts`.** Every shape below is imported from **`lib/api-types.ts`**, which
`02-api-contract.md` §3 owns and both the server and the client compile against. A second copy of a
DTO in the UI layer is how `share.name` ends up rendering `undefined` against a wire shape of
`share.user.name`.

The shapes the UI actually consumes, restated for reference only:

```ts
import type {
  MyRole, ShareRole, UserSummary, ProseMirrorDoc,
  DocumentSummary, DocumentDetail, ShareEntry, PatchDocumentResponse,
  ListDocumentsResponse,
} from '@/lib/api-types';

// DocumentSummary  — the dashboard row (both sections). Carries `owner`, `myRole`,
//                    `sourceFilename`, `updatedAt` and `shareCount`. No `content`.
// ListDocumentsResponse = { owned: DocumentSummary[]; sharedWithMe: DocumentSummary[] }
//
// ShareEntry       — { userId, user: UserSummary, role: ShareRole, grantedAt: string }
//                    NESTED, not flat: a row renders `share.user.name`, never `share.name`.
//
// DocumentDetail   — DocumentSummary & { content: ProseMirrorDoc; shares: ShareEntry[] | null }
//                    `shares` is `null` for a non-owner, NOT `undefined` and NOT `[]` —
//                    an editor must be able to tell "not allowed to see this" from
//                    "there are none". Render with `doc.shares ?? []` only inside the
//                    owner-only dialog, never as a visibility test.
//
// PatchDocumentResponse — { id, title, updatedAt }. Imported, not redeclared with a
//                         narrower shape.
```

The types the UI once named locally map as: `DocumentListItem` → `DocumentSummary`,
`Role` → `MyRole`, `DashboardPayload` → `ListDocumentsResponse`, `JSONContent` → `ProseMirrorDoc`
(TipTap's `JSONContent` is still what `useEditor` takes; the two are structurally compatible and the
wire type is the one that crosses a boundary).

`lib/client.ts` (owned by `02-api-contract.md` §9 — **not** `lib/api-client.ts`) wraps `fetch`:

```ts
export class ApiClientError extends Error {
  constructor(
    readonly code: ApiErrorCode,   // note the order: code, message, status, details
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) { super(message); }
}
/** Throws ApiClientError on non-2xx; returns parsed JSON otherwise. */
export async function apiFetch<T>(input: string, init?: RequestInit): Promise<T>;
```

Every client component branches on `err.code` (or `err.status`), never on message text.

---

## 2. Route map

From `00-foundation.md` §8. Edge middleware (`middleware.ts`) already redirects
unauthenticated hits on `/documents/*` to `/login`; page-level checks are a belt-and-braces
second line, not the primary control.

| Route | File | Boundary | Data | Notes |
|---|---|---|---|---|
| `/` | `app/page.tsx` | Server, no UI | reads session cookie via `readSession()` (`lib/session.ts`) | `redirect('/documents')` or `redirect('/login')`. Renders nothing. |
| `/login` | `app/login/page.tsx` | Server shell → Client `LoginForm` + `DemoAccountPanel` | none | If `readSession()` is non-null, `redirect('/documents')` so a logged-in reviewer never sees a dead form. |
| `/documents` | `app/documents/page.tsx` | Server page → Server sections → one Client button per action | `await listDocumentsFor(session.id)` (Prisma, direct) | `force-dynamic`. The session field is **`session.id`** — `session.userId` does not exist and would silently be `undefined` (`00-foundation.md` §7c). |
| `/documents/[id]` | `app/documents/[id]/page.tsx` | Server page → Client `DocumentEditor` | `await getDocumentFor(session.id, params.id)`; returns `null` → `notFound()` | `force-dynamic`. Whole `DocumentDetail` is passed as props; **no client fetch on mount**, so the editor paints filled, not empty. |

### 2.1 Per-route loading / empty / error states

| Route | Loading | Empty | Error | Not found |
|---|---|---|---|---|
| `/` | none (instant redirect) | n/a | n/a | n/a |
| `/login` | button shows `Signing in…` + disabled while the POST is in flight | n/a | inline `Alert` above the submit button (§4.3) | n/a |
| `/documents` | `app/documents/loading.tsx` — header + two section headings + 3 `Skeleton` cards each | per-section empty states (§5.4) | `app/documents/error.tsx` (`'use client'`): "Something went wrong loading your documents." + `Try again` → `reset()` | n/a |
| `/documents/[id]` | `app/documents/[id]/loading.tsx` — skeleton title bar, skeleton toolbar strip, 6 skeleton text lines at prose width | a document with an empty body shows the TipTap placeholder "Start writing…" | `app/documents/[id]/error.tsx`: "Couldn't open this document." + `Try again` + `← Back to documents` | `app/documents/[id]/not-found.tsx`: "Document not found — it may have been deleted, or you don't have access to it." + `← Back to documents`. This is the UI half of the `NONE → 404` rule in `00-foundation.md` §6.1; see `03-auth-and-permissions.md`. |

---

## 3. Component tree

```
app/
├── layout.tsx                          Server  root html/body, Tailwind, <Toaster />
├── globals.css                                 Tailwind v4 entry + .prose-doc block
├── page.tsx                            Server  redirect only
├── login/
│   └── page.tsx                        Server  shell; redirects if already signed in
└── documents/
    ├── layout.tsx                      Server  <AppHeader /> + <main>
    ├── page.tsx                        Server  dashboard, direct Prisma read
    ├── loading.tsx                     Server  skeletons
    ├── error.tsx                       Client  reset() boundary
    └── [id]/
        ├── page.tsx                    Server  loads DocumentDetail, notFound() on null
        ├── loading.tsx                 Server  skeletons
        ├── error.tsx                   Client
        └── not-found.tsx               Server

components/
├── auth/
│   ├── LoginForm.tsx                   Client  email+password, POST /api/auth/login
│   └── DemoAccountPanel.tsx            Client  3 one-click sign-in buttons + password
├── layout/
│   ├── AppHeader.tsx                   Server  brand link + <UserMenu />
│   └── UserMenu.tsx                    Client  DropdownMenu → Sign out
├── dashboard/
│   ├── DocumentSection.tsx             Server  heading + count + grid + empty slot
│   ├── DocumentCard.tsx                Server  one card; variant="owned"|"shared"
│   ├── RoleBadge.tsx                   Server  pure: Owner | Editor | Viewer
│   ├── ProvenanceLine.tsx              Server  "Imported from <file>"
│   ├── EmptyState.tsx                  Server  icon + copy + optional CTA slot
│   ├── NewDocumentButton.tsx           Client  POST /api/documents → router.push
│   ├── ImportDialog.tsx                Client  file input + POST /api/documents/import
│   └── DocumentCardMenu.tsx            Client  ⋯ menu: Delete (owner only)
├── editor/
│   ├── DocumentEditor.tsx              Client  ROOT: owns TipTap editor + useAutosave
│   ├── EditorHeader.tsx                Client  back link, SaveStatus, Share, ⋯
│   ├── EditorTitle.tsx                 Client  inline-editable <input> / static <h1>
│   ├── EditorToolbar.tsx               Client  role="toolbar"
│   ├── ToolbarButton.tsx               Client  <button aria-pressed aria-label>
│   ├── BlockTypeSelect.tsx             Client  Paragraph / H1 / H2 / H3
│   ├── SaveStatus.tsx                  Client  state machine renderer, aria-live
│   ├── ReadOnlyBanner.tsx              Server  Alert, rendered for VIEWER
│   └── ConflictDialog.tsx              Client  409 recovery
├── share/
│   ├── ShareDialog.tsx                 Client  Dialog shell + data orchestration
│   ├── ShareInviteForm.tsx             Client  email combobox + role select + Share
│   ├── UserAutocomplete.tsx            Client  GET /api/users?q= combobox
│   ├── CollaboratorRow.tsx             Client  role Select + remove
│   └── OwnerRow.tsx                    Client  static "Owner" row
└── ui/                                         shadcn/ui primitives (§9)

hooks/
├── useAutosave.ts                      the save state machine (§7)
└── useDebouncedCallback.ts             tiny generic debounce with maxWait

lib/                                    (all owned by other specs — this one imports)
├── api-types.ts                        DTOs + ApiErrorCode          (02 §3)
├── client.ts                           apiFetch + ApiClientError    (02 §9)
├── schemas.ts                          loginSchema and friends      (02)
├── format.ts                           formatRelativeTime, formatBytes
├── documents/queries.ts                listDocumentsFor / getDocumentFor (02 §4.3)
├── import/constants.ts                 IMPORT_LIMITS_COPY, MAX_FILE_BYTES (05 §2.3)
└── editor-extensions.ts                the single TipTap extension list  (05 §3.3)
```

**This slice creates no `lib/` module of its own** except `lib/format.ts`. Everything else it
imports. That is deliberate: every one of those files was, at some point in this spec set, defined
twice under two names.

**TipTap dependencies** (all MIT, pinned in `00-foundation.md` §2a, installed once by `T01`):

```jsonc
"@tiptap/react": "3.31.0",
"@tiptap/pm": "3.31.0",
"@tiptap/starter-kit": "3.31.0",
"@tiptap/extension-placeholder": "3.31.0"
```

**`@tiptap/extension-underline` is NOT installed.** StarterKit v3 already depends on it and
registers it; adding it a second time throws a duplicate-name error at editor init, which is a white
screen on `/documents/[id]` for **every** document (`_toolchain-findings.md` TRAP-2). Underline is
available from StarterKit with no extra entry.

**This spec does not define the extension list.** It lives in `lib/editor-extensions.ts`, owned by
`05-import-spec.md` §3.3, and the editor imports it:

```ts
import { editorExtensions } from '@/lib/editor-extensions';
```

`editorExtensions` is `schemaExtensions` (StarterKit with `codeBlock`, `code`, `blockquote`,
`horizontalRule`, `strike` and `link` **disabled**, per `00-foundation.md` §4) plus the client-only
`Placeholder`. The disabled set is load-bearing in both directions: if the editor's schema were
wider than the importer's, a reviewer typing ` ``` ` or `>` would create nodes the importer's
`assertLoadableByEditor` rejects and that `00-foundation.md` §4 says we are not building; if it were
narrower, imported documents would fail to mount. One array, two consumers, no exceptions.

`EMPTY_DOC` is **not** defined here either — it is in `lib/documents/content.ts`
(`00-foundation.md` §5a).

---

## 4. `/login`

### 4.1 Wireframe

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│                        shared-docs                               │
│                 Sign in to your documents                        │
│                                                                  │
│   ┌────────────────────────────────────────────────────────┐     │
│   │ Email                                                  │     │
│   │ [ alice@example.com                                 ]  │     │
│   │ Password                                               │     │
│   │ [ ••••••••                                          ]  │     │
│   │                                                        │     │
│   │ ⚠  Email or password is incorrect.        ← error slot │     │
│   │                                                        │     │
│   │ [               Sign in                             ]  │     │
│   └────────────────────────────────────────────────────────┘     │
│                                                                  │
│   ┌─ Demo accounts ────────────────────────────────────────┐     │
│   │ This is a review build. All three accounts use the     │     │
│   │ password  demo1234                                     │     │
│   │                                                        │     │
│   │ [ Sign in as Alice ]  owns four documents, shares three│     │
│   │ [ Sign in as Bob   ]  editor on "Q3 Product Roadmap"   │     │
│   │ [ Sign in as Carol ]  viewer on "Team Handbook"        │     │
│   └────────────────────────────────────────────────────────┘     │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

Layout: centred column, `max-w-sm`, vertically centred (`min-h-dvh grid place-items-center`),
`Card` for the form, a second `Card` (muted background, `border-dashed`) for the demo panel.

### 4.2 Form

| Field | Input | Attributes |
|---|---|---|
| Email | `Input` | `type="email" name="email" autoComplete="username" required autoFocus` |
| Password | `Input` | `type="password" name="password" autoComplete="current-password" required` |
| Submit | `Button` | `type="submit"`, full width; label `Sign in` → `Signing in…` + `disabled` while pending |

Validation runs client-side with the **same Zod schema the route uses** — `loginSchema` from
**`lib/schemas.ts`** (`02-api-contract.md` §7.1), literally imported by both, not re-declared. That
means `email: z.email()` and `password: z.string().min(1).max(200)`. There is **no `min(8)` rule**:
a short wrong password must reach the server and come back as the `401` the demo is built to show,
not be swallowed by a client-side field error. Field errors render in a
`<p id="email-error" className="text-sm text-destructive">` under the field, with
`aria-invalid="true"` and `aria-describedby="email-error"` on the input. A failed
client parse does not fire a request.

### 4.3 Error display

| Cause | Status / code | Where | Copy |
|---|---|---|---|
| Empty or malformed field | client Zod | under the field | "Enter a valid email address." / "Enter your password." |
| Wrong credentials | `401 INVALID_CREDENTIALS` | `Alert variant="destructive"` above the submit button, `role="alert"` | "Email or password is incorrect." |
| Anything else / network | 5xx or throw | same `Alert` | "Couldn't sign in. Please try again." |

The credential error is deliberately non-specific (it does not say whether the email exists);
see `03-auth-and-permissions.md`.

On success: `router.replace('/documents')` then `router.refresh()`. Never `push` — the login
page must not be reachable with Back after signing in.

### 4.4 Demo accounts panel

`components/auth/DemoAccountPanel.tsx`. Three buttons; each one posts the seeded
credentials directly to `POST /api/auth/login` — it does **not** merely prefill the form,
because the reviewer's fastest path is one click, not click-then-submit.

```ts
// Hints must name documents the seed actually creates (00-foundation.md §5,
// 01-data-and-persistence.md §7.2). A login page that tells a reviewer to look for
// "Team notes" — a document that does not exist — is worse than no hint at all.
const DEMO_ACCOUNTS = [
  { email: 'alice@example.com', name: 'Alice',  hint: 'owns four documents, shares three' },
  { email: 'bob@example.com',   name: 'Bob',    hint: 'editor on "Q3 Product Roadmap"' },
  { email: 'carol@example.com', name: 'Carol',  hint: 'viewer on "Team Handbook"' },
] as const;
export const DEMO_PASSWORD = 'demo1234';   // matches the seed in 00-foundation §5
```

The shared password `demo1234` is printed in the panel as selectable text, so a reviewer can
also sign in manually or test a wrong password.

**Why this panel exists:** the graded flow is *sharing*, and sharing is only legible when a
reviewer can be Alice, share a doc, then be Bob and see it — one click per identity turns a
two-minute account dance into a five-second demonstration.

**Gating decision — the panel is always on, in every environment, with no flag.** Justification:
this build has no signup and exists only as a review artifact with three seeded accounts, so a
`NEXT_PUBLIC_DEMO_MODE` flag would guard a production that will never exist while adding an
untested code path and one more thing that can be misconfigured on Vercel. The panel labels
itself "This is a review build", and `README.md` states the same.

---

## 5. `/documents` — dashboard

### 5.1 Wireframe

```
┌ shared-docs ────────────────────────────────────── Alice Martin ▾ ┐
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Documents                        [ Import file ] [ New document ] │
│                                                                   │
│  My documents · 2                                                 │
│  ┌─────────────────────────────┐ ┌─────────────────────────────┐   │
│  │ Team notes              ⋯   │ │ Q3 plan                 ⋯   │   │
│  │ Edited 2 hours ago          │ │ Edited yesterday            │   │
│  │ Shared with 2 people        │ │ ⎘ Imported from q3-plan.docx │   │
│  └─────────────────────────────┘ └─────────────────────────────┘   │
│                                                                   │
│  ───────────────────────────────────────────────────────────────  │
│                                                                   │
│  Shared with me · 1                                               │
│  ┃┌────────────────────────────┐                                  │
│  ┃│ Roadmap           [Editor] │  ← accent bar + tinted card      │
│  ┃│ Owned by Alice Martin      │                                  │
│  ┃│ Edited 10 minutes ago      │                                  │
│  ┃└────────────────────────────┘                                  │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

Grid: `grid gap-4 sm:grid-cols-2 lg:grid-cols-3`. Page container `mx-auto max-w-5xl px-6 py-8`.

### 5.2 What makes the two sections visually distinct (C11)

This is a graded requirement — it must be obvious in a screenshot, not just semantically true.

| Signal | My documents | Shared with me |
|---|---|---|
| Section header | `<h2>My documents <span class="text-muted-foreground">· {n}</span></h2>` | `<h2>Shared with me · {n}</h2>` |
| Separator | — | a `Separator` above the section |
| Card surface | `bg-card border` | `bg-muted/40 border` |
| Accent | none | 3px left accent bar: `border-l-[3px] border-l-primary` |
| Role badge | none (you are the owner; the section says so) | `<RoleBadge role="EDITOR" />` top-right of the card |
| Owner byline | none | `Owned by {owner.name}` in `text-sm text-muted-foreground` |
| Secondary line | `Shared with {shareCount} {people\|person}` when `shareCount > 0`, else nothing | — |
| Overflow menu | `⋯` → Delete | absent (non-owners cannot delete — `00-foundation.md` §6) |

`RoleBadge` (`components/dashboard/RoleBadge.tsx`) uses shadcn `Badge`:

| role | variant | text |
|---|---|---|
| `OWNER` | `default` | Owner |
| `EDITOR` | `secondary` | Editor |
| `VIEWER` | `outline` | Viewer |

The badge always carries a **word**, never colour alone (§10).

**Provenance line.** When `sourceFilename !== null`, `DocumentCard` renders
`<ProvenanceLine filename={sourceFilename} />`:
`⎘ Imported from <span class="font-medium">{filename}</span>` in `text-xs text-muted-foreground`,
truncated with `truncate` at one line. It appears in **both** sections. This is the visible
payoff of the upload requirement (C8) on the dashboard.

Every card is wrapped in a `<Link href={`/documents/${id}`}>` covering the whole card
(`focus-visible` ring on the link, `hover:bg-accent/40`); the `⋯` menu is a sibling positioned
above it (`relative z-10`) with `e.preventDefault()` on click so it does not navigate.

### 5.3 Actions

| Control | Component | Behaviour |
|---|---|---|
| **New document** | `NewDocumentButton` (`Button`) | `POST /api/documents` with no body → `201 {id}` → `router.push('/documents/' + id)`. Disabled + label `Creating…` while pending. On failure: `toast.error('Couldn\'t create the document.')`. |
| **Import file** | `ImportDialog` (`Button variant="outline"` opening a `Dialog`) | see §5.5 |
| **Delete** (owner, `⋯` menu) | `DocumentCardMenu` | `DropdownMenu` → `Delete` (destructive). Opens an `AlertDialog`-style confirm inside the same `Dialog` primitive: "Delete "{title}"? This can't be undone." → `DELETE /api/documents/:id` → `toast.success('Document deleted.')` → `router.refresh()`. |

### 5.4 Empty states (specified separately, per section)

`EmptyState` renders inside the section's grid area as a full-width dashed panel
(`rounded-lg border border-dashed p-8 text-center`).

**My documents — empty**

```
┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
│                       ⎘                                │
│              No documents yet                          │
│   Create a blank document, or import a .md, .txt        │
│   or .docx file to turn it into an editable doc.        │
│           [ New document ]  [ Import file ]             │
└ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
```

**Shared with me — empty** (no CTA — the user cannot act to fix this)

```
┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
│                       ⇄                                │
│           Nothing shared with you yet                   │
│   When someone shares a document with you, it will      │
│   appear here with your role on it.                     │
└ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
```

Both sections **always render**, even when empty. Hiding "Shared with me" when empty would
destroy the owned/shared distinction that C11 grades, and it is exactly the state Carol lands in.

### 5.5 Import dialog

```
┌ Import a file ────────────────────────────────── ✕ ┐
│                                                    │
│  Turn a file into a new editable document.         │
│                                                    │
│  [ Choose file ]  q3-plan.docx  (18 KB)            │
│                                                    │
│  Supported files: .md, .txt, .docx —               │
│  maximum 2 MB per file.       ← IMPORT_LIMITS_COPY │
│  Formatting is converted; images are not imported. │
│                                                    │
│  ⚠ That file type isn't supported.                 │
│                                                    │
│                     [ Cancel ]  [ Import ]         │
└────────────────────────────────────────────────────┘
```

- `<Input type="file" accept={IMPORT_ACCEPT_ATTR}>` — the constant from
  `lib/import/constants.ts`, never a literal, so the picker cannot advertise something the server
  rejects.
- The supported-types line is **permanent copy**, not an error — C8 requires the limit stated in the
  UI. It renders `{IMPORT_LIMITS_COPY}` **verbatim from the constant**, never a hand-typed sentence.
  The same string is asserted to appear in `README.md` by a unit test (`05-import-spec.md` §2.3), so
  the UI, the server and the README cannot state three different limits — which is exactly what this
  dialog used to do, advertising 1 MB against a server that accepted 2 MB and a README that said
  2 MB.
- Client pre-checks the extension against `ACCEPTED_EXTENSIONS` and the size against
  **`MAX_FILE_BYTES`** (2 MB) before uploading, and shows the inline error without a request. The
  server re-checks; the client check is UX only. No byte count is ever written as a literal here.
- Submit: `FormData` with field `file` → `POST /api/documents/import` → `201 {id}` →
  close dialog → `router.push('/documents/' + id)`.
- **Inline errors render `err.message` verbatim from the response.** The server owns those sentences
  (`05-import-spec.md` §6.2), so they exist in exactly one place and cannot drift from the limits
  the dialog just advertised — in particular, the `413` copy no longer says "larger than 1 MB"
  against a 2 MB cap. The client re-words nothing. The only copy this component owns is the
  network-failure fallback: "Upload failed. Try again."
- Client-side pre-check failures reuse the **same strings** the server would have returned for
  `UNSUPPORTED_FILE_TYPE` and `FILE_TOO_LARGE`.
- While uploading: `Import` becomes `Importing…` and disabled; the dialog cannot be dismissed
  (`onInteractOutside`/`onEscapeKeyDown` prevented while pending).

---

## 6. `/documents/[id]` — editor

### 6.1 Wireframe (owner / editor)

```
┌───────────────────────────────────────────────────────────────────────────┐
│ ← Documents                        ✓ Saved   [ Share ]  [⋯]  Alice ▾      │
├───────────────────────────────────────────────────────────────────────────┤
│  Team notes                                        ← click to rename      │
│  ⎘ Imported from team-notes.md                                            │
├───────────────────────────────────────────────────────────────────────────┤
│ [B] [I] [U] │ [ Paragraph ▾ ] │ [ • List ] [ 1. List ] │ [ ↶ ] [ ↷ ]      │
├───────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│        ┌──────────────── prose column, max-w-[720px] ──────────────┐      │
│        │  Sprint goals                                    (H1)     │      │
│        │                                                           │      │
│        │  We agreed to ship the importer first, because …          │      │
│        │                                                           │      │
│        │   •  parse .docx via mammoth                              │      │
│        │   •  keep ProseMirror JSON as the store                   │      │
│        └───────────────────────────────────────────────────────────┘      │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Wireframe (viewer)

```
┌───────────────────────────────────────────────────────────────────────────┐
│ ← Documents                                                  Carol ▾      │
├───────────────────────────────────────────────────────────────────────────┤
│  👁  View only — Alice Martin shared this with you as a viewer.           │
├───────────────────────────────────────────────────────────────────────────┤
│  Team notes                                        ← static <h1>          │
├───────────────────────────────────────────────────────────────────────────┤
│        ┌──────────────── prose column, max-w-[720px] ──────────────┐      │
│        │  Sprint goals                                             │      │
│        │  We agreed to ship the importer first, because …          │      │
│        └───────────────────────────────────────────────────────────┘      │
└───────────────────────────────────────────────────────────────────────────┘
```

The sticky top strip (`sticky top-0 z-20 bg-background/95 backdrop-blur border-b`) holds the
back link, `SaveStatus`, `Share`, `⋯` and the user menu. The toolbar is a second sticky row
directly under it.

### 6.3 `DocumentEditor` — the client root

```tsx
'use client';
export function DocumentEditor({ doc }: { doc: DocumentDetail }) { … }
```

It receives the whole `DocumentDetail` from the Server Component as props — no fetch on mount,
no loading flash. It owns:

- the TipTap `useEditor` instance:
  `extensions: editorExtensions` (imported from `@/lib/editor-extensions` — §3),
  `content: doc.content`, `editable: canWrite`,
  `immediatelyRender: false` so SSR does not attempt to render ProseMirror,
  **`enableContentCheck: true`** with an `onContentError` handler, and
  `editorProps.attributes: { class: 'prose-doc focus:outline-none', 'aria-label': 'Document content' }`.

  `enableContentCheck` is not optional. `01-data-and-persistence.md` §4.2 and §5.2 both rely on it:
  it is the reason the content guard can be ten lines instead of a hundred and fifty. Without it, a
  stored document containing a node the schema does not know **throws at mount and white-screens the
  route**; with it, ProseMirror reports a `contentError` and we can render something. Handler:

  ```tsx
  onContentError: ({ error, disableCollaboration }) => {
    console.error('[editor] unrenderable content', error);
    setContentError(true);   // renders an inline Alert instead of a blank page
  },
  ```

  The banner copy: "This document can't be displayed — it contains formatting this editor doesn't
  support." plus a link back to `/documents`. It should never fire; if it does, the importer and the
  editor have drifted apart, which is the failure `05-import-spec.md` §3.3 exists to prevent;
- `const canWrite = doc.myRole === 'OWNER' || doc.myRole === 'EDITOR';`
- `const isOwner = doc.myRole === 'OWNER';`
- the `useAutosave` instance (§7), wired to `editor.on('update')` and to the title input.

Active-state subscription uses TipTap v3's `useEditorState` so the toolbar re-renders on
selection changes without re-rendering the canvas:

```tsx
const s = useEditorState({
  editor,
  selector: ({ editor: e }) => ({
    bold: e.isActive('bold'), italic: e.isActive('italic'), underline: e.isActive('underline'),
    h1: e.isActive('heading', { level: 1 }), h2: e.isActive('heading', { level: 2 }),
    h3: e.isActive('heading', { level: 3 }), paragraph: e.isActive('paragraph'),
    bullet: e.isActive('bulletList'), ordered: e.isActive('orderedList'),
    canUndo: e.can().chain().focus().undo().run(),
    canRedo: e.can().chain().focus().redo().run(),
  }),
});
```

### 6.4 Inline-editable title (C2)

`components/editor/EditorTitle.tsx`. Rendered as a borderless `<input>` styled to look like an
`<h1>` (`text-3xl font-semibold bg-transparent w-full`) when `canWrite`, and as a plain `<h1>`
when not.

| Event | Behaviour |
|---|---|
| render | `value` is local state seeded from `doc.title`; `aria-label="Document title"`; `placeholder="Untitled document"` |
| focus | `hover:` / `focus:` show a subtle ring + `bg-muted/50` so the affordance is discoverable; the previous value is stashed in a ref for Escape |
| change | updates local state, calls `autosave.queue({ title })` → status goes `dirty` |
| **blur** | **calls `autosave.flush()`** — the title is committed on blur, per the requirement |
| `Enter` | `preventDefault()` then `e.currentTarget.blur()` → same commit path; focus moves to the editor canvas via `editor.commands.focus()` |
| `Escape` | restores the stashed value, cancels the pending queue entry, blurs; no request is sent |
| empty on blur | falls back to `"Untitled document"` and saves that (never persists `""`) |
| max length | `maxLength={200}`; the server Zod schema enforces the same bound |

The title is **not** a separate endpoint — it goes through the same `PATCH /api/documents/:id`
as content, sharing one `lastKnownUpdatedAt` token.

### 6.5 Toolbar

`role="toolbar" aria-label="Text formatting"`, `aria-controls` pointing at the editor's id.
Separators are `<Separator orientation="vertical" className="mx-1 h-6" />` with `aria-hidden`.
Every button is `type="button"` and carries `onMouseDown={(e) => e.preventDefault()}` so
clicking it never steals the selection from the canvas.

Exact order, left to right:

| # | Control | TipTap command | Active check | Shortcut | `aria-label` |
|---|---|---|---|---|---|
| 1 | Bold | `editor.chain().focus().toggleBold().run()` | `editor.isActive('bold')` | ⌘/Ctrl + B | `Bold` |
| 2 | Italic | `editor.chain().focus().toggleItalic().run()` | `editor.isActive('italic')` | ⌘/Ctrl + I | `Italic` |
| 3 | Underline | `editor.chain().focus().toggleUnderline().run()` | `editor.isActive('underline')` | ⌘/Ctrl + U | `Underline` |
| — | separator | — | — | — | — |
| 4 | Block type (Select) | see below | see below | ⌘/Ctrl + Alt + 0/1/2/3 | `Text style` |
| — | separator | — | — | — | — |
| 5 | Bulleted list | `editor.chain().focus().toggleBulletList().run()` | `editor.isActive('bulletList')` | ⌘/Ctrl + Shift + 8 | `Bulleted list` |
| 6 | Numbered list | `editor.chain().focus().toggleOrderedList().run()` | `editor.isActive('orderedList')` | ⌘/Ctrl + Shift + 7 | `Numbered list` |
| — | separator | — | — | — | — |
| 7 | Undo | `editor.chain().focus().undo().run()` | n/a — `disabled={!canUndo}` | ⌘/Ctrl + Z | `Undo` |
| 8 | Redo | `editor.chain().focus().redo().run()` | n/a — `disabled={!canRedo}` | ⌘/Ctrl + Shift + Z | `Redo` |

Rows 7–8 are **not** in the brief's formatting list, and ⌘Z / ⌘⇧Z work from the canvas without
them. They are cut-list item 6 in `10-task-graph.md` §7 — the `canUndo`/`canRedo` selector runs
`editor.can().chain()…` on every transaction, which is the most expensive line in the toolbar for
the least graded capability. Ship them only if §11's budget holds.

All shortcuts above are TipTap/StarterKit defaults; we register **no custom keymaps**.

**Block type control** — a shadcn `Select` (not a segmented control: one control, four options,
40px of toolbar instead of 200px, and Radix gives keyboard + `aria-expanded` for free).

| Option | Command | Active check |
|---|---|---|
| Paragraph | `editor.chain().focus().setParagraph().run()` | `editor.isActive('paragraph')` |
| Heading 1 | `editor.chain().focus().toggleHeading({ level: 1 }).run()` | `editor.isActive('heading', { level: 1 })` |
| Heading 2 | `…toggleHeading({ level: 2 })…` | `editor.isActive('heading', { level: 2 })` |
| Heading 3 | `…toggleHeading({ level: 3 })…` | `editor.isActive('heading', { level: 3 })` |

The `Select`'s `value` is derived from the active checks (`h1 → 'h1'`, … else `'paragraph'`),
so it always reflects the caret. Its trigger renders the option label ("Heading 2"), which is
how the user sees "text size variation" (C6) at a glance.

`ToolbarButton` contract:

```tsx
interface ToolbarButtonProps {
  label: string;          // becomes aria-label AND the tooltip/title text
  shortcut?: string;      // e.g. "⌘B" — appended to title as "Bold (⌘B)"
  active?: boolean;       // → aria-pressed + data-[active] styling
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;   // lucide-react icon, aria-hidden
}
```

Active styling: `data-[active=true]:bg-accent data-[active=true]:text-accent-foreground`, plus
`aria-pressed={active}` — the state is exposed both visually and to assistive tech (C5).

### 6.6 Save-status indicator

`components/editor/SaveStatus.tsx`, rendered in the top strip. Container:
`<div role="status" aria-live="polite" className="text-sm text-muted-foreground">`.

**States and visible copy**

| State | Icon | Copy | Extra |
|---|---|---|---|
| `idle` | ✓ (muted) | `Saved` | mount state for an untouched document |
| `dirty` | ● (muted) | `Unsaved changes` | |
| `saving` | spinner | `Saving…` | |
| `saved` | ✓ | `Saved` for the first 5 s, then `Saved {relative}` (`just now` → `2 min ago`), ticked by a 30 s interval | |
| `error` | ⚠ (destructive) | `Couldn't save` + inline `Retry` button (`variant="link"`, `aria-label="Retry saving"`) | |
| `conflict` | ⚠ (amber) | `Changed elsewhere` + `Reload` button | `ConflictDialog` opens simultaneously |

**State machine**

```
                    queue(patch)            debounce fires / flush()
   ┌─────────┐  ─────────────────▶  ┌───────┐  ────────────────────▶  ┌────────┐
   │  idle   │                      │ dirty │                         │ saving │
   └─────────┘  ◀─────────────────  └───────┘                         └────────┘
        ▲            (never)            ▲                              │  │  │
        │                               │                        200   │  │  │ 409
        │                               │ queue(patch)  ◀──────────────┘  │  ▼
        │                               │  (edit while saving)            │ ┌──────────┐
        │                               │                                 │ │ conflict │
   ┌────┴────┐  ◀────────────────────────────────────────────────────────┘ └──────────┘
   │  saved  │                          200, nothing queued                  │
   └─────────┘                                                               │ reload
        │  queue(patch)                                                      ▼
        └──────────────▶ dirty                                    (content replaced,
                                                                token reset) → saved
   saving ──4xx/5xx/network──▶ error ──retry()──▶ saving
   error  ──queue(patch)─────▶ dirty            (typing re-arms autosave)
```

Explicit transition table:

| From | Trigger | To | Side effect |
|---|---|---|---|
| `idle`/`saved`/`error` | `queue(patch)` | `dirty` | merge patch into the pending object, (re)start debounce |
| `dirty` | debounce elapsed **or** `flush()` | `saving` | `PATCH` with the pending patch + `lastKnownUpdatedAt` |
| `saving` | `200` and nothing queued meanwhile | `saved` | advance `lastKnownUpdatedAt` ref, set `lastSavedAt = new Date()` |
| `saving` | `200` but an edit arrived mid-flight | `dirty` | advance token, immediately restart the debounce |
| `saving` | `409 CONFLICT` | `conflict` | do **not** advance the token; suspend autosave; open `ConflictDialog` |
| `saving` | `403 FORBIDDEN` | `error` | copy: "You no longer have edit access." + `editor.setEditable(false)` |
| `saving` | `404` | `error` | copy: "This document no longer exists." + link back to `/documents` |
| `saving` | any other failure | `error` | keep the pending patch so `retry()` re-sends it |
| `error` | `retry()` | `saving` | re-send the same pending patch |
| `error` | `queue(patch)` | `dirty` | typing re-arms autosave without a manual retry |
| `conflict` | `resolveConflict(fresh)` | `saved` | replace editor content + title, set token to `fresh.updatedAt`, clear pending patch, resume autosave |

`beforeunload` is registered while state is `dirty` or `saving`, so a hard tab close warns.

### 6.7 Editor canvas typography (`.prose-doc` in `globals.css`)

The one place we spend real styling time (§11):

```css
.prose-doc { max-width: 720px; margin-inline: auto; padding-block: 2rem;
             font-size: 1.0625rem; line-height: 1.7; }
.prose-doc h1 { font-size: 2rem;    font-weight: 650; line-height: 1.25; margin: 1.6em 0 .5em; }
.prose-doc h2 { font-size: 1.5rem;  font-weight: 650; line-height: 1.3;  margin: 1.4em 0 .4em; }
.prose-doc h3 { font-size: 1.25rem; font-weight: 650; line-height: 1.35; margin: 1.2em 0 .35em; }
.prose-doc h1:first-child, .prose-doc h2:first-child { margin-top: 0; }
.prose-doc p { margin: 0 0 .85em; }
.prose-doc ul { list-style: disc;    padding-left: 1.5rem; margin: 0 0 .85em; }
.prose-doc ol { list-style: decimal; padding-left: 1.75rem; margin: 0 0 .85em; }
.prose-doc li { margin: .2em 0; }
.prose-doc li > ul, .prose-doc li > ol { margin: .2em 0; }     /* nested lists, C7 */
.prose-doc p.is-editor-empty:first-child::before {              /* Placeholder */
  content: attr(data-placeholder); color: var(--muted-foreground);
  float: left; height: 0; pointer-events: none; }
```

We do **not** use `@tailwindcss/typography` — its resets fight ProseMirror's node structure and
it is 30 lines of our own CSS to avoid a dependency we would then have to override.

### 6.8 Read-only experience (VIEWER)

`ReadOnlyBanner` renders directly under the top strip as `Alert` (default variant, muted):

> 👁 **View only** — {owner.name} shared this with you as a viewer.

| Element | VIEWER treatment | Why |
|---|---|---|
| Toolbar (all 8 controls) | **hidden** (not rendered) | Eight permanently-greyed buttons is noise; there is nothing a viewer could enable. |
| `SaveStatus` | **hidden** | Nothing can be dirty. |
| Title | rendered as a static `<h1>`, not an input | An input that rejects typing is worse than plain text. |
| Editor canvas | rendered with `editable: false` | Text stays selectable and copyable — a viewer can still read and quote. |
| **Share** button | **hidden** | Owner-only capability (`00-foundation.md` §6). |
| `⋯` menu (Delete) | **hidden** | Owner-only. |
| Back link, user menu, provenance line | unchanged | |

For an **EDITOR**: everything above is shown *except* `Share` and `Delete`, which stay hidden
(owner-only). No banner is shown to editors.

The client hiding is a UX affordance only; the enforcement is the server's `403` on `PATCH`
(`00-foundation.md` §6.3) and is covered by the permission tests — see
`03-auth-and-permissions.md`.

### 6.9 Conflict (409) experience

Triggered when `PATCH` returns `409 CONFLICT` because someone else saved since our
`lastKnownUpdatedAt`.

```
┌ This document changed elsewhere ───────────────────── ✕ ┐
│                                                        │
│  Someone else saved changes to "Team notes" while you  │
│  were editing. Your recent edits haven't been saved.   │
│                                                        │
│  Reload to get the latest version. Copy your text      │
│  first if you want to keep what you wrote.             │
│                                                        │
│              [ Copy my text ]  [ Reload latest ]       │
└────────────────────────────────────────────────────────┘
```

What the user sees and can do:

1. Autosave stops immediately — no further `PATCH` is attempted, so we never overwrite the
   other person's work by accident.
2. `SaveStatus` switches to the amber `Changed elsewhere` + `Reload` state and stays there
   even if the dialog is dismissed.
3. **Copy my text** (`variant="outline"`) → `navigator.clipboard.writeText(editor.getText())`,
   button label flips to `Copied ✓` for 2 s. The escape hatch that makes losing work impossible.
4. **Reload latest** (primary) → `GET /api/documents/:id` →
   `editor.commands.setContent(fresh.content)`, title state replaced,
   `lastKnownUpdatedAt = fresh.updatedAt`, pending patch cleared, state → `saved`, dialog closes.
5. Dismissing the dialog (✕ / Escape) leaves the editor editable but autosave suspended, with
   the amber status as the standing reminder. Reopen via the `Reload` button in `SaveStatus`.

This is the honest UI for the "no real-time collab" cut in `00-foundation.md` §4: last write
wins, but never silently.

---

## 7. Autosave

### 7.1 Timing

| Parameter | Value | Justification |
|---|---|---|
| Debounce | **800 ms** | Roughly the pause between sentences. Under ~500 ms every typing burst becomes a `PATCH` (dozens of writes per paragraph against a free Neon tier); over ~1500 ms the indicator sits on "Unsaved changes" long enough that a reviewer watching the walkthrough video thinks it is broken. 800 ms saves after a natural pause and keeps request volume at roughly one per idle moment. |
| Max wait | **5000 ms** | A continuous typist never stops for 800 ms, so a plain debounce could defer a save indefinitely. The debounce is capped: at most 5 s of typing goes unsaved. |
| On blur | immediate `flush()` | Editor blur and title blur both commit at once — the "did it save?" moment is when you look away. |
| On route change | `flush()` with `keepalive: true` | See §7.3. |

### 7.2 Hook signature (`hooks/useAutosave.ts`)

```ts
import type { JSONContent } from '@tiptap/react';

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict';

export interface AutosavePatch {
  title?: string;
  content?: JSONContent;
}

export interface UseAutosaveOptions {
  documentId: string;
  /** doc.updatedAt from the server render — seeds the concurrency token. */
  initialUpdatedAt: string;
  /** false for VIEWER: queue() and flush() become no-ops. */
  enabled: boolean;
  debounceMs?: number;   // default 800
  maxWaitMs?: number;    // default 5000
  /** called on 409 so the page can open ConflictDialog */
  onConflict?: () => void;
}

export interface UseAutosaveResult {
  state: SaveState;
  lastSavedAt: Date | null;
  /** user-facing message for the `error` state */
  errorMessage: string | null;
  /** merge a partial change into the pending patch; marks dirty and (re)arms the timer */
  queue: (patch: AutosavePatch) => void;
  /** cancel the timer and save now; resolves when the request settles */
  flush: () => Promise<void>;
  /** re-send the pending patch after an `error` */
  retry: () => Promise<void>;
  /** adopt a freshly fetched document, clearing the conflict */
  resolveConflict: (fresh: Pick<DocumentDetail, 'title' | 'content' | 'updatedAt'>) => void;
}

export function useAutosave(opts: UseAutosaveOptions): UseAutosaveResult;
```

Wiring in `DocumentEditor`:

```tsx
const autosave = useAutosave({
  documentId: doc.id,
  initialUpdatedAt: doc.updatedAt,
  enabled: canWrite,
  onConflict: () => setConflictOpen(true),
});

const editor = useEditor({
  extensions: editorExtensions,      // @/lib/editor-extensions — the ONE list (05 §3.3)
  content: doc.content,
  editable: canWrite,
  immediatelyRender: false,
  enableContentCheck: true,          // see §6.3 — turns a white screen into a visible error
  onContentError: ({ error }) => setContentError(error),
  onUpdate: ({ editor }) => autosave.queue({ content: editor.getJSON() }),
  onBlur: () => { void autosave.flush(); },
});
```

### 7.3 How `lastKnownUpdatedAt` is threaded

```
server render ──▶ doc.updatedAt (props)
                        │
                        ▼
        useAutosave: const tokenRef = useRef(initialUpdatedAt)
                        │
   PATCH body ──────────┤  { title?, content?, lastKnownUpdatedAt: tokenRef.current }
                        │
        200 { updatedAt } ──▶ tokenRef.current = res.updatedAt      (advance)
        409               ──▶ tokenRef.current UNCHANGED, state = 'conflict'
        reload            ──▶ tokenRef.current = fresh.updatedAt    (re-seed)
```

Rules the implementer must not break:

1. The token lives in a **`useRef`, never in `useState`** — it must not trigger a render, and a
   stale closure over a state value would send an outdated token and cause a phantom 409 (R4 in
   `00-foundation.md` §9).
2. It is advanced **only** from a `200` response body or from an explicit conflict reload.
   Never from `Date.now()`, never optimistically.
3. Requests are serialised: `queue()` during an in-flight `PATCH` merges into the pending patch
   and waits; there is never more than one `PATCH` in flight per document. This is what keeps a
   single user from 409-ing against themself.
4. Title and content share **one** pending patch object and therefore one request.

Route-change flush: there is no reliable global router-navigation hook in the App Router, so we
intercept the two in-app exits we control — the `← Documents` back link and the brand link are
Client components that `await autosave.flush()` before `router.push` — and back them with a
`useEffect` cleanup on unmount that calls `flush()` using
`fetch(url, { method: 'PATCH', keepalive: true, … })`, which survives the component (and the
page) going away. `keepalive` caps bodies at 64 KB; demo documents are far below that, and the
unmount flush is a backstop rather than the primary path.

---

## 8. Share dialog

Opened by the `Share` button in the editor top strip. **Rendered only when
`doc.myRole === 'OWNER'`.**

### 8.1 Wireframe

```
┌ Share "Team notes" ──────────────────────────────────────── ✕ ┐
│                                                               │
│  Invite someone                                               │
│  ┌──────────────────────────────────┐ ┌──────────┐ ┌────────┐ │
│  │ bo|                              │ │ Viewer ▾ │ │ Share  │ │
│  └──────────────────────────────────┘ └──────────┘ └────────┘ │
│  ┌──────────────────────────────────┐                         │
│  │ Bob Chen        bob@example.com  │ ← listbox from          │
│  │ Carol Diaz    carol@example.com  │   GET /api/users?q=bo   │
│  └──────────────────────────────────┘                         │
│  ⚠ No user with that email address.          ← inline error   │
│                                                               │
│  ───────────────────────────────────────────────────────────  │
│  People with access                                           │
│                                                               │
│   (A)  Alice Martin      alice@example.com     Owner          │
│   (B)  Bob Chen          bob@example.com   [ Editor ▾ ]  [✕]  │
│   (C)  Carol Diaz        carol@example.com [ Viewer ▾ ]  [✕]  │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

shadcn `Dialog`, `sm:max-w-lg`. `(A)` is a 32px circle with the initial, `bg-muted`.

### 8.2 Data flow

| Moment | Call |
|---|---|
| Dialog opens | Seeds from `doc.shares` (already in the server payload for owners). Then refetches `GET /api/documents/:id/shares` once, so a second tab's changes appear. Shows 3 skeleton rows while that first fetch is pending only if `doc.shares` was absent. |
| Typing in the email field | debounced 250 ms, min 2 characters → `GET /api/users?q=` |
| Share | `POST /api/documents/:id/shares` `{ email, role }` |
| Role change on a row | `PATCH /api/documents/:id/shares/:userId` `{ role }` |
| Remove | `DELETE /api/documents/:id/shares/:userId` |
| Any success | update local `shares` state from the response, then `router.refresh()` on dialog close so the dashboard's `shareCount` is current |

### 8.3 `UserAutocomplete`

A hand-rolled combobox (~50 lines) rather than `cmdk`: the async-results wiring in `Command`
costs more than the keyboard handling we need.

- Input: `role="combobox" aria-expanded aria-controls="user-listbox" aria-autocomplete="list"`,
  `type="email"`, `placeholder="Email address"`, `autoComplete="off"`.
- Results: `<ul id="user-listbox" role="listbox">`, absolutely positioned, max 5 rows, each
  `<li role="option" aria-selected>` showing `name` (medium) and `email` (muted, right-aligned).
- Keyboard: `ArrowDown`/`ArrowUp` move the highlight (wrapping), `Enter` selects the highlighted
  option **or**, when nothing is highlighted, submits the raw typed email; `Escape` closes the
  list without clearing the input; `Tab` closes the list and keeps the typed text.
- Selecting an option sets the input to that user's email — the API takes an email, so a free-typed
  address works identically to a picked one. Nothing is blocked on the suggestions returning.
- In-flight requests are aborted with `AbortController` on each new keystroke.
- Rows already in `shares` are still listed, marked with a muted `Already shared` suffix.

### 8.4 Collaborator list

| Row | Left | Right | Notes |
|---|---|---|---|
| Owner (always first) | avatar initial, `owner.name`, `owner.email` | static text `Owner` in `text-sm text-muted-foreground` | **No select, no remove button** — the owner cannot be demoted or removed. Renders even when there are no shares, so the doc's ownership is always visible (C9). |
| Each share | avatar initial, `name`, `email` | `Select` (`Viewer` / `Editor`) + `Button variant="ghost" size="icon"` with an `X` icon, `aria-label={'Remove ' + name}` | Row shows a small spinner and `aria-busy` while its own request is in flight; other rows stay interactive. |

Optimistic updates: the role `Select` updates local state immediately and rolls back with
`toast.error('Couldn\'t change the role.')` if the `PATCH` fails. Remove is **not** optimistic —
it waits for the `200 { ok: true, userId }`, because an incorrect optimistic removal reads as data
loss. (`200`, not `204`: every response in this API has a JSON body and `apiFetch` calls
`res.json()` unconditionally — `02-api-contract.md` I1. Revoking is also **idempotent**, so a
double-click on Remove is a second `200`, not an error toast.)

### 8.5 Error cases, all surfaced inline

Errors from the invite form render in a single `<p role="alert" class="text-sm text-destructive">`
directly under the input. Errors from a collaborator row render as a `toast.error`, because the
row itself has no room.

| Case | Response | Surface | Copy |
|---|---|---|---|
| Empty / malformed email | client Zod | inline | "Enter a valid email address." |
| **User not found** | `404 USER_NOT_FOUND` | inline | "No user with that email address. Try alice@example.com, bob@example.com or carol@example.com." |
| **Cannot share with yourself** | `400 CANNOT_SHARE_WITH_SELF` | inline | "You already own this document." |
| **Already shared** (same role) | `200` upsert, role unchanged | inline, `text-muted-foreground` (not an error) | "{name} already has {role} access." |
| **Already shared** (new role) | `200` upsert, role changed | inline, `text-muted-foreground` | "Updated {name} to {role}." — and the existing row animates its `Select` to the new value rather than a duplicate row being appended. |
| Not the owner | `403 FORBIDDEN` | inline | "Only the owner can share this document." (defensive — the button is hidden for non-owners) |
| Document gone | `404` | inline | "This document no longer exists." |
| Network / 5xx | — | inline | "Couldn't share right now. Try again." |
| Role change failed | any | `toast.error` | "Couldn't change the role." |
| Remove failed | any | `toast.error` | "Couldn't remove {name}." |

`00-foundation.md` §6.4 makes re-sharing an **upsert**, so "already shared" is a message, not a
failure — the client must merge the response into the existing row and never append a duplicate.

After a successful share the input clears, the role select resets to `Viewer`, focus returns to
the input, and a `toast.success('Shared with {name}.')` fires.

---

## 9. shadcn/ui components to install

```bash
pnpm dlx shadcn@latest add button input label select dialog badge card separator alert dropdown-menu skeleton sonner
```

| Component | Used for |
|---|---|
| `button` | every action: Sign in, demo sign-ins, New document, Import, Share, dialog actions, toolbar buttons (via `ToolbarButton` wrapper) |
| `input` | login email/password, editor title, import file input, share email combobox |
| `label` | login fields, import dialog, share invite field |
| `select` | toolbar block-type control, invite role select, per-collaborator role select |
| `dialog` | Share dialog, Import dialog, Conflict dialog, Delete confirmation |
| `badge` | `RoleBadge` (Owner / Editor / Viewer) on shared cards |
| `card` | dashboard document cards, login form panel, demo accounts panel |
| `separator` | toolbar group dividers, dashboard section divider, share dialog sections |
| `alert` | login error, read-only banner, error boundaries, import errors |
| `dropdown-menu` | header user menu (Sign out), card `⋯` menu (Delete) |
| `skeleton` | `loading.tsx` for dashboard and editor, share-list loading |
| `sonner` | toasts: document deleted, shared with X, role change failure, import failure |

Icons come from `lucide-react` (a shadcn peer dependency, already installed): `Bold`, `Italic`,
`Underline`, `List`, `ListOrdered`, `Undo2`, `Redo2`, `Share2`, `Upload`, `FileText`, `Eye`,
`MoreHorizontal`, `Trash2`, `X`, `Check`, `Loader2`, `AlertTriangle`, `ArrowLeft`.

---

## 10. Accessibility floor

Scoped to what genuinely fits the budget — roughly 20 minutes of deliberate work plus what the
primitives give for free.

| Area | Commitment |
|---|---|
| **Toolbar keyboard operability** | Container is `role="toolbar" aria-label="Text formatting"`. Every control is a real `<button type="button">` or a Radix `Select`, so all of them are in the tab order and operable with Enter/Space. **We deliberately do not implement roving tabindex** — 8 extra tab stops is acceptable at this scale, the ARIA pattern's arrow-key nav is ~30 lines we would not test, and every formatting action also has a native keyboard shortcut (§6.5) that works from inside the canvas, which is where a keyboard user actually is. |
| **aria-labels** | Every icon-only control has one: the 8 toolbar buttons (§6.5), `Remove {name}`, `Document title`, `Document content` (on the ProseMirror surface via `editorProps.attributes`), `More options` on the `⋯` menus, `Close` (Radix default on `DialogClose`). Every icon inside a labelled button is `aria-hidden="true"`. |
| **Toggle state** | Toolbar toggles expose `aria-pressed={active}`; the block-type `Select` exposes its value as text. Active state is never colour-only. |
| **Focus-visible rings** | Global `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` (shadcn's default) is kept on every interactive element. The whole-card `<Link>` on the dashboard gets `focus-visible:ring-2` on the card container so keyboard traversal of the grid is visible. Nothing sets `outline: none` without a replacement. |
| **Dialog focus trap** | All three dialogs use Radix `Dialog`, which provides the focus trap, Escape-to-close, `aria-modal`, `aria-labelledby` from `DialogTitle`, background `inert`, and focus restoration to the trigger. Share dialog sets initial focus on the email input; the Conflict dialog sets it on `Reload latest`. The Import dialog blocks Escape only while an upload is in flight. |
| **Live regions** | `SaveStatus` is `role="status" aria-live="polite"`, so save/conflict transitions are announced without stealing focus. Inline form errors use `role="alert"`. |
| **Colour contrast** | Body and card text ≥ 4.5:1 against their background; `text-muted-foreground` is only used at ≥ 4.5:1 in the default shadcn light theme (verified once with a contrast checker on the three surfaces we tint: `bg-muted/40` cards, the read-only `Alert`, and the amber conflict status). The shared-card accent bar and role badge colours are **decoration** — the section heading, the byline and the badge word carry the meaning. |
| **Semantics** | One `<h1>` per page (the document title / page title); sections use `<h2>`; the dashboard grids are `<ul>/<li>`; `<time dateTime>` for all timestamps. |
| **Out of scope, stated** | No full screen-reader pass, no reduced-motion audit (we ship almost no motion), no mobile-touch target audit — desktop-first per `00-foundation.md` §4. |

---

## 11. Visual polish budget

Reviewers open two screens for more than five seconds: the **dashboard** and the **editor
canvas**. Time goes there; everything else takes the shadcn default and stops.

**Styled well (~35 min of the slice):**

- **Editor canvas typography** (§6.7): 720px measure, 17px/1.7 body, a real heading scale, proper
  list indentation and nested-list spacing, generous top padding. This is the "quality of the
  document editing experience" line in the brief's evaluation list, and it is what the walkthrough
  video films.
- **Dashboard cards**: consistent padding, a legible three-line hierarchy (title / meta / provenance),
  hover and focus states, and the owned-vs-shared treatment in §5.2 — because C11 is graded on
  whether the distinction is *visible*.
- **The two section headers and the empty states**: they are the first thing on screen and the
  first thing in a screenshot.

**Deliberately plain (default shadcn, no custom work):**

- Login page (a centred card), header, user menu, all three dialogs' chrome, toasts, skeletons,
  error boundaries, the toolbar (default `ghost` buttons in a bordered strip).
- No dark mode, no custom theme tokens, no logo, no illustrations, no animation beyond Radix
  defaults, no responsive work past `sm:`/`lg:` grid columns.

**Descope levers, in the order to pull them if the slice runs long:**

1. Replace `UserAutocomplete` (§8.3) with a plain `<datalist>` on the email input — same API call,
   ~15 lines, loses arrow-key styling. Saves ~20 min.
2. Drop the `⋯` / Delete affordance from dashboard cards (the `DELETE` endpoint and its tests stay).
   Saves ~15 min.
3. Drop `Copy my text` from the Conflict dialog. Saves ~10 min.

Nothing above the line — the two dashboard sections, the toolbar, autosave, the read-only banner
and the share dialog — is cuttable; each maps to a numbered acceptance criterion in
`00-foundation.md` §3.

**Slice estimate: 3.5 h** — shell + header + login 0.5, dashboard + cards + empty states 0.6,
editor page + toolbar + title 1.0, autosave hook + save status + conflict 0.6, share dialog 0.5,
import dialog UI 0.2, a11y and polish pass 0.3.

---

## 12. Rulings (previously "open questions")

1. ✅ **The dashboard payload is `DocumentSummary` and it carries `shareCount`.**
   `02-api-contract.md` §3 adopted the field (via `_count.shares`, same query, no second round
   trip) and dropped `createdAt`, which nothing renders. The type is **imported** from
   `lib/api-types.ts`; this spec's `DocumentListItem` is gone. Without `shareCount` the
   "Shared with N people" line — one of the four signals C11 is graded on — could not render.
2. ✅ **Server Components read the database directly, through `lib/documents/queries.ts`.**
   `02-api-contract.md` §4.3 now *owns* that module and requires the route handlers to call it too,
   so there is one implementation of every read and the integration tests cover both paths. The
   earlier version of this rule — pages calling an unspecified `lib/documents.ts` while the tests
   exercised the handlers — would have shipped the access logic twice and tested it once.
   `ARCHITECTURE.md` still explains the choice.
3. ✅ **Delete lives in the `⋯` menu on owned dashboard cards**, with a confirm step, and nowhere
   else. Note that delete is **C21** in `00-foundation.md` §3 — a shipped behaviour, not a brief
   line — and the affordance (not the endpoint or its `403`-for-EDITOR test) is cut-list item 5.
4. ✅ **`myRole` is `'OWNER' | 'EDITOR' | 'VIEWER'`** and `shares[].role` is `'VIEWER' | 'EDITOR'`,
   both from `lib/api-types.ts`. `'NONE'` never reaches the client — it becomes a `404`.
5. ✅ **The import cap is 2 MB, stated once.** This spec's 1 MB copy and its `1_048_576` pre-check
   were wrong in three directions at once (the server accepted 2 MB, the README said 2 MB, and a
   committed test asserted the README string). §5.5 now renders `IMPORT_LIMITS_COPY` and pre-checks
   `MAX_FILE_BYTES`.
6. ✅ **StarterKit v3 already bundles `Underline`** — confirmed against the registry
   (`_toolchain-findings.md` TRAP-2), not left to the spike. `@tiptap/extension-underline` is not a
   dependency and is not in the array; registering it twice throws at editor init. The toolbar
   contract in §6.5 is unchanged.
7. ⏳ **`useEditorState` availability** stays a spike check. If `@tiptap/react@3.31.0` does not
   export it, fall back to a `useState`-bumping `onTransaction` handler; same behaviour, one extra
   render per transaction. Verify in the first five minutes of T03, alongside the underline check —
   both are one `node -e` away and both are white-screen-class failures.

---

## Definition of done

- [ ] `/` redirects to `/documents` when signed in and `/login` when not, rendering no UI of its own.
- [ ] `/login` renders the credential form and the demo panel; each of the three demo buttons signs
      in with one click and lands on `/documents`; the shared password `demo1234` is visible as
      selectable text.
- [ ] A wrong password — **of any length** — shows "Email or password is incorrect." in an inline
      `role="alert"` and leaves the form usable; an invalid email shows a field-level error and
      fires no request. `loginSchema` is imported from `lib/schemas.ts`, not re-declared, and has no
      `min(8)` rule.
- [ ] Visiting `/login` while signed in redirects to `/documents`.
- [ ] `/documents` always renders both sections, with counts, even when one or both are empty, and
      each section shows its own distinct empty state copy from §5.4.
- [ ] Shared cards are distinguishable from owned cards by **all four** of: left accent bar,
      tinted surface, `Owned by {name}` byline, and a role `Badge` reading Editor or Viewer.
- [ ] A document with `sourceFilename` set shows `Imported from {filename}` on its card in either
      section.
- [ ] **New document** creates a document and navigates into the editor; **Import file** renders
      `IMPORT_LIMITS_COPY` verbatim in the dialog (`Supported files: .md, .txt, .docx — maximum 2 MB
      per file.`) and rejects an unsupported file inline without a request. No byte literal appears
      in this component.
- [ ] The editor page renders content on first paint from server props (no post-mount fetch, no
      empty flash), reading through `lib/documents/queries.ts` — the same module the route handlers
      call.
- [ ] `useEditor` sets `enableContentCheck: true` with an `onContentError` handler, and a document
      containing an unknown node type renders an inline error rather than a blank page.
- [ ] `grep -rn "StarterKit" components/ lib/` hits **only** `lib/editor-extensions.ts`;
      `@tiptap/extension-underline` is not in `package.json`.
- [ ] The title is editable inline: it saves on blur, `Enter` commits and moves focus into the
      canvas, `Escape` reverts, and an emptied title persists as `Untitled document`.
- [ ] The toolbar renders exactly the 8 controls in the §6.5 order with the specified separators;
      every button has the specified `aria-label`, reflects active state via `aria-pressed` plus
      styling, and Undo/Redo are disabled when unavailable.
- [ ] All formatting shortcuts (⌘B / ⌘I / ⌘U / ⌘⇧8 / ⌘⇧7 / ⌘⌥1-3 / ⌘Z / ⌘⇧Z) work from inside the
      canvas without a custom keymap.
- [ ] Clicking a toolbar button never loses the text selection.
- [ ] `SaveStatus` implements every state in §6.6 with the exact copy given, sits in an
      `aria-live="polite"` region, and its `Retry` button re-sends the pending patch.
- [ ] Typing pauses for 800 ms → status goes `dirty` → `saving` → `Saved`; a 5 s continuous typing
      run also produces a save (max-wait); blurring the canvas or the title saves immediately.
- [ ] `lastKnownUpdatedAt` is held in a ref, advanced only from a `200` body or a conflict reload,
      and never more than one `PATCH` is in flight for a document — a single user editing for two
      minutes straight produces zero 409s.
- [ ] A simulated 409 (edit the same doc in two browsers) shows the conflict dialog, stops
      autosave, offers **Copy my text** and **Reload latest**, and reloading restores a clean
      `Saved` state where editing works again.
- [ ] A VIEWER sees the read-only banner naming the owner, no toolbar, no save status, no Share and
      no Delete, a static `<h1>` title, and a canvas whose text can be selected but not typed into.
- [ ] An EDITOR sees the full toolbar and autosave but no Share and no Delete.
- [ ] The Share dialog opens only for owners, lists the owner as a non-editable `Owner` row first,
      autocompletes against `GET /api/users?q=` after 2 characters, and supports per-row role change
      and removal. Rows read `share.user.name` / `share.user.email` (the nested `ShareEntry` from
      `02-api-contract.md` §3), and `doc.shares` is treated as `ShareEntry[] | null` — `null` means
      "not the owner", not "no collaborators".
- [ ] Every error case in §8.5 renders inline with the given copy — verified at minimum for
      user-not-found, share-with-yourself, and re-sharing an existing collaborator (which updates
      the existing row and appends no duplicate).
- [ ] Navigating to a document you have no access to renders the `not-found.tsx` copy, not an error
      page and not a permission message.
- [ ] All 12 shadcn components in §9 are installed and no hand-rolled equivalent exists alongside them.
- [ ] Every dialog traps focus, closes on Escape (except mid-upload), and restores focus to its
      trigger; every icon-only control has an `aria-label`; no element has its focus ring removed.
- [ ] Tab-through of `/login`, `/documents` and `/documents/[id]` reaches every interactive control
      with a visible focus ring, and the whole app is operable without a mouse.
- [ ] The editor canvas uses `.prose-doc`: 720px measure, distinct H1/H2/H3 sizes, and bulleted and
      numbered lists that render with markers and correct nested indentation after reload (C4/C7).
