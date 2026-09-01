# 05 — File Import (C8)

**Purpose.** This document specifies the entire file-import slice: the product behaviour
(upload `.md` / `.txt` / `.docx` → a brand-new document owned by the uploader → straight into
the editor), the accepted types and limits, the per-format parsing pipeline down to package
names and function signatures, the exhaustive validation/error table, the security posture,
and the UI. Its **main job is to retire risk R1** from `00-foundation.md` §9 — `generateJSON`
needing a DOM on the server — with a time-boxed 30-minute spike and three pre-written fallback
plans, so that no one discovers this problem at hour 6. Everything here is subordinate to
`00-foundation.md`; the API envelope and status-code conventions come from `02-api-contract.md`,
authentication and access rules from `03-auth-and-permissions.md`, and the editor's extension
configuration is *shared with this slice through one module* (see §4).

---

## 1. Product behaviour

| Step | What happens |
|---|---|
| 1 | On `/documents`, the user clicks **Import file** (next to **New document**). |
| 2 | The OS file picker opens, filtered by `accept` (§6.2). |
| 3 | The client does a cheap pre-check (extension + size) purely for instant feedback. |
| 4 | `POST /api/documents/import` — `multipart/form-data`, one field: `file`. |
| 5 | Server validates → parses to **ProseMirror JSON** → derives a title → inserts one `Document` row with `ownerId = session.id` and `sourceFilename = <original basename>`. |
| 6 | `201 DocumentSummary` → the browser reads `.id` and navigates to `/documents/{id}`. The user is now editing the imported content. |
| 7 | The new document behaves exactly like a created-from-scratch one: autosave, rename, share. There is nothing "import-flavoured" about it afterwards, except `sourceFilename` shown as provenance. |

### 1.1 Why this needs zero blob storage — and why that decided it

The brief (`BRIEF.md` §2) offers three upload behaviours. Two of them — "upload an attachment
associated with a document" and anything else that keeps the original bytes — require object
storage: an S3/Vercel Blob/Supabase Storage bucket, credentials in the Vercel project, a signed
URL scheme, a download route, and a lifecycle story for orphaned blobs. That is an hour of
plumbing plus a second vendor a reviewer must not have to configure, and it demonstrates
*infrastructure wiring*, not product judgement.

**Import-to-document consumes the file instead of keeping it.** The upload's bytes exist only
inside the lifetime of one request handler. What we persist is the parsed result in a column we
already have — `Document.content` (`Json`, ProseMirror JSON) — using the *same* write path as
every other document. Consequences:

- **No bucket, no credentials, no CORS, no signed URLs, no cleanup job.**
- **Nothing new in the data model.** `00-foundation.md` §5 already carries `sourceFilename`; no
  migration is added by this slice.
- **No "download the original" feature to half-build.** The imported document *is* the artefact.
- **Deployment stays one Vercel project + one Neon database**, which is the whole reason R2 is
  tractable.
- **Security surface shrinks to parsing** (§7). We never serve back a file we accepted.

That last point is the deciding factor stated plainly: *storing user-supplied bytes and later
serving them is the expensive-to-get-right part of file upload.* By not storing them we delete
the risk instead of managing it, and we still satisfy C8 fully.

---

## 2. Accepted types, limits, and the copy that must not drift

### 2.1 Extension / MIME table

| Extension | MIME types accepted in `file.type` | Notes |
|---|---|---|
| `.md` | `text/markdown`, `text/x-markdown`, `text/plain`, `application/octet-stream`, `""` (empty) | Browsers disagree wildly on Markdown. Firefox/Linux frequently sends `""`. |
| `.txt` | `text/plain`, `application/octet-stream`, `""` | |
| `.docx` | `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/zip`, `application/octet-stream`, `""` | Windows without Office installed reports `application/octet-stream`. |

**Rules.**

1. **The extension is authoritative.** It is checked first, case-insensitively, against exactly
   `['.md', '.txt', '.docx']`. `.markdown`, `.doc`, `.rtf`, `.pdf` and everything else are
   rejected. We deliberately do *not* accept `.markdown` — the copy string in §2.3 says `.md`,
   and an accepted-but-unadvertised extension is drift.
2. **MIME is a secondary sanity check, not a gate.** `""` and `application/octet-stream` are
   always tolerated because they mean "the browser has no idea". A MIME that is *positively
   wrong* for the extension (e.g. `image/png` on a `.md`) is rejected.
3. **Neither check is a security control.** The real defence is that we decode/parse the bytes
   and reject anything that is not what it claims (§3, §7).

### 2.2 Size cap: **2 MB**

`MAX_FILE_BYTES = 2 * 1024 * 1024`. Justification, in order of weight:

- **Platform headroom.** Vercel serverless functions cap the request body around 4.5 MB. A 2 MB
  cap keeps us comfortably under it *and* keeps the failure a clean, explainable `413` from our
  own code instead of an opaque platform error.
- **It is enormous for the use case.** 2 MB of UTF-8 prose is roughly 350,000 words. A 2 MB
  `.docx` is a book. No reviewer's test file will come close.
- **It bounds the decompression-bomb window** for `.docx` (§7.3).
- **It bounds latency.** Parse + schema validation stays well inside the function timeout, so we
  never need streaming, chunking, or a background job — all of which are out of budget.

### 2.3 The one copy string (C8: "state that clearly in the UI and README")

Both the UI and the README must state the limits **verbatim and identically**. To make drift
impossible, the string is a constant and the README is asserted against it by a test.

```ts
// lib/import/constants.ts
export const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB — see 05-import-spec.md §2.2

export const ACCEPTED_EXTENSIONS = ['.md', '.txt', '.docx'] as const;

/**
 * THE canonical user-facing statement of import limits.
 * Must appear character-for-character in:
 *   - the dashboard Import control's helper text
 *   - README.md, under "## File import"
 * Enforced by lib/import/limits-copy.test.ts (colocated — the unit project's
 * include glob is lib/**/*.test.ts).
 */
export const IMPORT_LIMITS_COPY =
  'Supported files: .md, .txt, .docx — maximum 2 MB per file.';

/** Derived so the picker can never advertise something the server rejects. */
export const IMPORT_ACCEPT_ATTR = [
  '.md',
  '.txt',
  '.docx',
  'text/markdown',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
].join(',');
```

```ts
// lib/import/limits-copy.test.ts
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { IMPORT_LIMITS_COPY } from '@/lib/import/constants';

it('README states the import limits verbatim', () => {
  const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
  expect(readme).toContain(IMPORT_LIMITS_COPY);
});
```

For this to be green rather than a permanently-red committed test, `README.md` must have a
**`## File import`** section whose first line is this string. `08-docs-plan.md` §2.10 was rewritten
to do exactly that — it previously shipped a table that did not contain the sentence at all, which
would have failed the unit suite on a clean clone and broken `06-test-plan.md` §2.4's hard rule.

The em dash is intentional and part of the string. If the string changes, the test fails until
the README is updated. If `.docx` is cut (§5.5), this constant is the **single edit** that
propagates to the UI helper text, the error messages, and — via the failing test — the README.

---

## 3. The parsing pipeline

### 3.1 Packages

```jsonc
// Installed once by T01 at the pins in 00-foundation.md §2a. This slice runs no `pnpm add`.
"marked": "18.0.11",          // .md -> HTML
"mammoth": "1.12.2",          // .docx -> HTML
"@tiptap/html": "3.31.0",     // generateJSON: HTML -> ProseMirror JSON
// already present for the editor, reused here:
"@tiptap/core": "3.31.0",
"@tiptap/pm": "3.31.0",
"@tiptap/starter-kit": "3.31.0",
// Plan B (expected — see §5.3):
"jsdom": "^26.0.0"
```

**`@tiptap/extension-underline` is deliberately absent.** StarterKit v3 depends on it already;
installing and registering it a second time throws a duplicate-name error at editor init
(`_toolchain-findings.md` TRAP-2). Underline is available from StarterKit with no extra entry, and
that is true for the importer's schema exactly as it is for the editor's — which is the point of
§3.3.

All are MIT/BSD; nothing paid (brief constraint).

If the Next build complains about `mammoth` (it pulls in CJS/`jszip`), add it to
`serverExternalPackages` in `next.config.ts` rather than fighting the bundler:

```ts
// next.config.ts
const nextConfig = { serverExternalPackages: ['mammoth'] };
```

The import route is **Node runtime only** — `jsdom` and `mammoth` cannot run on Edge:

```ts
// app/api/documents/import/route.ts
export const runtime = 'nodejs';
```

### 3.2 Supported node/mark set (the schema contract)

This table is the contract for *all three* pipelines and for the Plan C hand-written mapper.
Nothing outside it may appear in `Document.content`, ever.

| Kind | Type | Attrs | Source |
|---|---|---|---|
| node | `doc` | — | root |
| node | `paragraph` | — | `<p>`, `.txt` blocks |
| node | `heading` | `level: 1 \| 2 \| 3` | `<h1>`–`<h3>`; `<h4>`–`<h6>` clamp to 3 |
| node | `bulletList` | — | `<ul>` |
| node | `orderedList` | `start` | `<ol>` |
| node | `listItem` | — | `<li>` |
| node | `hardBreak` | — | `<br>`, single newline inside a `.txt` block |
| node | `text` | — | text content |
| mark | `bold` | — | `<strong>`, `<b>` |
| mark | `italic` | — | `<em>`, `<i>` |
| mark | `underline` | — | `<u>`, docx underline runs |

**Everything else is dropped by the schema**, by design: images, tables, code blocks, block
quotes, horizontal rules, links (the text survives, the href does not), strikethrough, colours,
fonts. This matches `00-foundation.md` §4 ("not building tables, images, code blocks, text
colour, fonts") and is documented in the README as *lossy by design*.

### 3.3 🔴 The single shared extension list — read this twice

> **This is the subtlest bug in the whole project.**
> `generateJSON` builds ProseMirror JSON against whatever extension list you hand it. The client
> editor builds its schema against whatever list *it* is given. If those two lists differ **by
> even one extension or one attr**, import silently produces nodes the editor's schema does not
> know about, and then:
>
> ```
> RangeError: Unknown node type: codeBlock
> ```
>
> is thrown by `Node.fromJSON` **in the browser, at editor mount** — a white screen on
> `/documents/[id]`, only for imported documents, with a stack trace that points at TipTap and
> not at the import code that caused it. It will not be caught by any server test that only
> asserts `201`.
>
> **Therefore: exactly one module owns the list, and both sides import it.** No route, no
> component, no test may construct its own `StarterKit.configure(...)`.

```ts
// lib/editor-extensions.ts
// THE ONE SOURCE OF TRUTH for the document schema.
// Imported by: the client editor (components/editor/*) AND the server import pipeline
// (lib/import/*). Changing this file changes what import can produce. See 05-import-spec.md §3.3.
// A repo-wide `grep -rn "StarterKit"` must hit ONLY this file and the spike script.
import type { Extensions } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';

/**
 * Schema-bearing extensions ONLY. Safe to load in a Node/serverless context.
 * This array defines the document schema for BOTH the editor and the importer.
 *
 * NOTE: there is no `Underline` entry and no `@tiptap/extension-underline` import.
 * StarterKit v3 already registers the `underline` mark; registering it again throws
 * `Duplicate extension name` at editor init — a white screen on every document
 * (_toolchain-findings.md TRAP-2). The mark IS available; it just comes from here.
 */
export const schemaExtensions: Extensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    // Explicitly out of scope (00-foundation.md §4) — disabled so the schema,
    // the toolbar and the import target are the exact same set:
    codeBlock: false,
    code: false,
    blockquote: false,
    horizontalRule: false,
    strike: false,
    link: false,
  }),
];

/**
 * Client-only additions (UI plugins, no schema impact). NEVER import this on the server.
 * `04-ui-spec.md` §3 imports THIS, and defines no array of its own.
 */
export const editorExtensions: Extensions = [
  ...schemaExtensions,
  Placeholder.configure({ placeholder: 'Start writing…' }),
];
```

The disabled set is binding on the editor as well as the importer. `04-ui-spec.md`'s toolbar exposes
nothing outside it, and StarterKit's input rules are what make this matter: with `codeBlock` and
`blockquote` enabled, a reviewer typing ` ``` ` or `>` in the editor would create nodes
`00-foundation.md` §4 says we are not building and that `assertLoadableByEditor` (§3.7) would reject
on the way back in.

If the spike (§5) shows that any of `schemaExtensions` refuses to load under Node, the fix is to
move that extension into `editorExtensions` — **never** to duplicate the list.

### 3.4 `.txt` → ProseMirror JSON (no HTML at all)

The `.txt` path never touches HTML, `marked`, or `generateJSON`. It is therefore **immune to
R1** — which is why it is the safety net for the whole feature.

```ts
// lib/import/parsers.ts
import type { PMDoc, PMNode } from '@/lib/import/types';

/** Split on blank lines into paragraphs; single newlines become hardBreak. */
export function txtToDoc(text: string): PMDoc {
  const normalised = text.replace(/\r\n?/g, '\n').replace(/\u0000/g, '');
  const blocks = normalised
    .split(/\n{2,}/)
    .map((b) => b.replace(/[ \t]+$/gm, '').trim())
    .filter((b) => b.length > 0);

  const content: PMNode[] = blocks.map((block) => {
    const lines = block.split('\n');
    const inline: PMNode[] = [];
    lines.forEach((line, i) => {
      if (i > 0) inline.push({ type: 'hardBreak' });
      if (line.length > 0) inline.push({ type: 'text', text: line });
    });
    return { type: 'paragraph', content: inline };
  });

  return { type: 'doc', content };
}
```

Note: a `paragraph` with an empty `content` array is invalid-ish in some PM builds, so empty
blocks are filtered out entirely rather than emitted.

### 3.5 `.md` → HTML → ProseMirror JSON

```ts
import { marked } from 'marked';
import { htmlToDoc } from '@/lib/import/html-to-pm';

export function markdownToDoc(md: string): PMDoc {
  const html = marked.parse(md, { async: false, gfm: true, breaks: false }) as string;
  return htmlToDoc(html);
}
```

`marked` passes raw HTML in the Markdown straight through. That is *useful* (it is how `<u>text</u>`
becomes an underline mark, since Markdown has no underline syntax) and *harmless* (§7.2), but we
still strip `<script>`/`<style>` blocks defensively inside `htmlToDoc`.

### 3.6 `.docx` → HTML → ProseMirror JSON

```ts
import mammoth from 'mammoth';

export async function docxToDoc(buffer: Buffer): Promise<PMDoc> {
  const { value: html } = await mammoth.convertToHtml({ buffer });
  return htmlToDoc(html);
}
```

`mammoth.convertToHtml` throws on a non-zip / corrupt / password-protected file; the caller maps
that to `422 PARSE_FAILED` with `details.reason = 'corrupt-docx'` (§6.2 row 8). Mammoth's default style map already emits `<h1>`–`<h6>`,
`<p>`, `<ul>/<ol>/<li>`, `<strong>`, `<em>`, `<u>` — a superset of §3.2 that the schema trims.

### 3.7 HTML → ProseMirror JSON, and the schema safety net

```ts
// lib/import/html-to-pm.ts
import { generateJSON } from '@tiptap/html';
import { getSchema } from '@tiptap/core';
import { Node as PMModelNode } from '@tiptap/pm/model';
import { schemaExtensions } from '@/lib/editor-extensions'; // <- THE shared list (§3.3)
import type { PMDoc } from '@/lib/import/types';

const SCRIPTISH = /<\s*(script|style)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi;

export function htmlToDoc(html: string): PMDoc {
  const cleaned = html.replace(SCRIPTISH, '');
  return generateJSON(cleaned, schemaExtensions) as PMDoc;
}

/**
 * Proves the document can actually be loaded by an editor built from the SAME list.
 * This is what turns the §3.3 bug class from "white screen in production" into
 * "422 at import time". EVERY parser's output goes through it — including Plan C's.
 */
const schema = getSchema(schemaExtensions);

export function assertLoadableByEditor(doc: PMDoc): void {
  PMModelNode.fromJSON(schema, doc).check(); // throws RangeError on unknown node/mark/attr
}
```

`assertLoadableByEditor` is **mandatory** on all three pipelines. It costs one line and it is the
only thing standing between a schema drift and a broken editor.

### 3.8 Orchestrator

```ts
// lib/import/index.ts
import type { ApiErrorCode } from '@/lib/api-types';   // the ONE registry (00-foundation §7a)

export type ImportSuccess = {
  ok: true;
  title: string;
  sourceFilename: string;
  content: PMDoc;
};
export type ImportFailure = {
  ok: false;
  status: 400 | 413 | 415 | 422;
  code: ApiErrorCode;                 // NOT a bespoke ImportErrorCode union
  message: string;
  details?: { reason: string };       // only for PARSE_FAILED
};
export type ImportResult = ImportSuccess | ImportFailure;

export async function parseUpload(file: File): Promise<ImportResult>;
```

Order of operations inside `parseUpload`. Steps 1–4 are `checkImportFile` in
`lib/import/validate.ts` — split out because `06-test-plan.md` §4.2 drives an 18-row table straight
at it, and because "extension → MIME → empty → size" is an evaluation *order* worth asserting (a
`.exe` that is also over the cap must report `UNSUPPORTED_FILE_TYPE`; "your executable was too big"
implies we would have taken a smaller one).

| # | Check | On failure → (`00-foundation.md` §7a) |
|---|---|---|
| 1 | extension in `ACCEPTED_EXTENSIONS` | `415 UNSUPPORTED_FILE_TYPE` |
| 2 | MIME not positively wrong for that extension | `415 UNSUPPORTED_FILE_TYPE` |
| 3 | `file.size > 0` | `400 FILE_MISSING` |
| 4 | `file.size <= MAX_FILE_BYTES` — **before `arrayBuffer()`**, so an oversized buffer is never materialised | `413 FILE_TOO_LARGE` |
| 5 | `const buf = Buffer.from(await file.arrayBuffer())` | — |
| 6 | `.md`/`.txt`: strict UTF-8 decode, NUL-free | `422 PARSE_FAILED` · `reason: 'not-text'` |
| 7 | dispatch to the parser (`.docx` throws on a non-zip / corrupt / password-protected file) | `422 PARSE_FAILED` · `reason: 'corrupt-docx'` |
| 8 | result is non-empty | `422 PARSE_FAILED` · `reason: 'empty-result'` |
| 9 | `assertLoadableByEditor` | `422 PARSE_FAILED` · `reason: 'unsupported-content'` |
| 10 | `contentByteSize(doc) <= MAX_CONTENT_BYTES` (`lib/documents/content.ts`) | `413 CONTENT_TOO_LARGE` |
| 11 | `titleFromFilename` (§8) → `ok: true` | — |

**There is no node/character budget and no `measure()` walk.** An earlier draft carried a
20,000-node / 400,000-character bound with its own recursive DFS and its own error code. It was cut:
`MAX_CONTENT_BYTES` already bounds exactly what needs bounding — the thing that goes into the `Json`
column and comes back out in every autosave `PATCH` — it is one function call, and it is the *same*
bound the `PATCH` route applies, so an imported document can never be a document the editor is then
unable to save.

Binary sniff (step 6) — this is what catches the `.exe` renamed to `.md`:

```ts
function decodeUtf8Strict(buf: Buffer): string | null {
  if (buf.subarray(0, 8192).includes(0x00)) return null; // NUL byte => not text
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return null;
  }
}
```

---

## 4. Where the code lives

| Path | Contents |
|---|---|
| `lib/editor-extensions.ts` | `schemaExtensions`, `editorExtensions` — **the** shared list (§3.3) |
| `lib/import/constants.ts` | `MAX_FILE_BYTES`, `ACCEPTED_EXTENSIONS`, accepted MIME, `IMPORT_LIMITS_COPY`, `IMPORT_ACCEPT_ATTR` |
| `lib/import/types.ts` | `PMDoc`, `PMNode`, `ImportResult` — **no `ImportErrorCode`**; codes come from `lib/api-types.ts` |
| `lib/import/validate.ts` | `checkImportFile` — extension → MIME → empty → size, in that order (§3.8, tested by `06-test-plan.md` §4.2) |
| `lib/import/html-to-pm.ts` | `htmlToDoc`, `assertLoadableByEditor` |
| `lib/import/parsers.ts` | `txtToDoc`, `markdownToDoc`, `docxToDoc` |
| `lib/import/title.ts` | `titleFromFilename`, `FALLBACK_TITLE`, `MAX_TITLE_LENGTH`, `safeSourceFilename` |
| `lib/import/index.ts` | `parseUpload` orchestrator |
| `lib/import/*.test.ts` | unit tests, **colocated** — the `unit` project's glob is `lib/**/*.test.ts`, so anything under `tests/unit/` is silently never run (`00-foundation.md` §5a) |
| `app/api/documents/import/route.ts` | the Route Handler (thin: `withSession` → `parseUpload` → Prisma insert) |
| `components/dashboard/ImportDialog.tsx` | the client control (§9, wireframe and copy in `04-ui-spec.md` §5.5) |
| `tests/fixtures/import/**` | the fixtures in §10.1 |
| `samples/sample.md`, `sample.txt`, `sample.docx` | reviewer-facing copies of the three good fixtures, referenced by `README.md` and `SUBMISSION.md`'s "Review in 60 seconds". `cp` at build time; ~5 minutes, and it removes a dead path from the one document a reviewer follows first. |
| `scripts/spike-generate-json.mjs` | R1 spike, deleted or promoted once green (§5) |

```ts
// lib/import/types.ts
export type PMMark = { type: 'bold' | 'italic' | 'underline' };
export type PMNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  text?: string;
  marks?: PMMark[];
};
export type PMDoc = { type: 'doc'; content: PMNode[] };
```

---

## 5. RISK R1, RESOLVED — the time-boxed `generateJSON` spike

`00-foundation.md` §9 R1: *"`@tiptap/html`'s `generateJSON` needs a DOM; behavior on
Node/serverless is the one genuinely uncertain integration. Spike it in the first 30 minutes.
Do not start the import UI before this is settled."*

This section is that spike, pre-written so the 30 minutes are spent running code, not deciding.

### 5.1 The rule

> **The spike is the first task of the import slice, before any UI, route, or fixture work.
> Clock starts when `pnpm add @tiptap/html` finishes. Hard stop at 30 minutes.**
> At T+30 you pick a plan from §5.5 and move on. You do not extend the box.

### 5.2 The spike script and its pass/fail criterion

```js
// scripts/spike-generate-json.mjs
// R1 spike. Run: node scripts/spike-generate-json.mjs
// PASS = exits 0 and prints valid ProseMirror JSON. FAIL = anything else.
import assert from 'node:assert/strict';
import { generateJSON } from '@tiptap/html';
import StarterKit from '@tiptap/starter-kit';

const HTML =
  '<h1>Title</h1>' +
  '<p><strong>bold</strong> <em>italic</em> <u>underline</u></p>' +
  '<ul><li>one</li><li>two</li></ul>' +
  '<ol><li>first</li></ol>';

// No Underline entry — StarterKit v3 registers it. If this array grows one, the
// editor throws `Duplicate extension name` at mount (TRAP-2). The underline
// assertion below is the check that StarterKit really does provide the mark.
const extensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    codeBlock: false, code: false, blockquote: false,
    horizontalRule: false, strike: false, link: false,
  }),
];

const json = generateJSON(HTML, extensions);
const out = JSON.stringify(json, null, 2);
console.log(out);

// --- pass criteria, all must hold ---
assert.equal(json.type, 'doc');
assert.equal(json.content[0].type, 'heading');
assert.equal(json.content[0].attrs.level, 1);
const flat = JSON.stringify(json);
assert.ok(flat.includes('"type":"bold"'), 'bold mark missing');
assert.ok(flat.includes('"type":"italic"'), 'italic mark missing');
assert.ok(flat.includes('"type":"underline"'), 'underline mark missing');
assert.ok(flat.includes('"type":"bulletList"'), 'bulletList missing');
assert.ok(flat.includes('"type":"orderedList"'), 'orderedList missing');
console.error('SPIKE PASS');
```

**Pass/fail is mechanical:**

| Result | Meaning |
|---|---|
| exit code `0` and `SPIKE PASS` on stderr | R1 is closed. Plan A. |
| `ReferenceError: window is not defined` / `document is not defined` / `DOMParser is not defined` | Plan B. |
| any other throw, or JSON missing a required node/mark | Plan B first; if Plan B also fails, Plan C. |

While in the box, also check whether the installed `@tiptap/html` ships a server-safe entrypoint
(`node -e "console.log(Object.keys(require('@tiptap/html')))"`, and look at its `exports` map in
`node_modules/@tiptap/html/package.json`). If a documented server export exists, use it — that is
still Plan A.

Once green, **promote the spike into a real test** so the guarantee is permanent:
`lib/import/html-to-pm.test.ts`, importing `htmlToDoc` and `schemaExtensions` (not a
copy-pasted list) and asserting the same facts. That test counts toward C16.

### 5.3 Plan A — `@tiptap/html` works server-side as shipped

Nothing to do. `htmlToDoc` (§3.7) is the final code. Delete `scripts/spike-generate-json.mjs`.
Cost: 0 extra minutes, 0 extra dependencies.

### 5.4 Plan B — provide DOM globals with `jsdom`

`pnpm add jsdom` (`^26.0.0`). One module, imported **for its side effects at the top of
`html-to-pm.ts`, before `@tiptap/html` is used**:

```ts
// lib/import/dom-polyfill.ts  (Plan B only)
import { JSDOM } from 'jsdom';

if (typeof globalThis.document === 'undefined') {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const w = dom.window as unknown as typeof globalThis & Window;
  globalThis.window = w as never;
  globalThis.document = w.document as never;
  globalThis.DOMParser = w.DOMParser as never;
  globalThis.Node = w.Node as never;
  globalThis.Element = w.Element as never;
  globalThis.HTMLElement = w.HTMLElement as never;
  globalThis.navigator ??= w.navigator as never;
}
```

```ts
// lib/import/html-to-pm.ts, Plan B variant — polyfill import MUST come first
import '@/lib/import/dom-polyfill';
import { generateJSON } from '@tiptap/html';
```

Guard rails: the polyfill is only ever imported from `lib/import/*` (never from a client
component), the route stays `runtime = 'nodejs'`, and `jsdom` goes in `serverExternalPackages` if
the bundler objects. Re-run the spike script with `import '../lib/import/dom-polyfill.ts'` at the
top (via `pnpm exec vitest run` so TS resolves) — same pass criteria.
Cost: ~10 minutes, 1 dependency, ~3 MB in the serverless bundle. Acceptable.

### 5.5 Plan C — bypass HTML entirely

If neither A nor B is green inside the box: **stop using HTML as the intermediate representation.**
`.txt` already needs no DOM (§3.4). `.md` gets a hand-written mapper over `marked`'s token stream
covering *only* the §3.2 node set. `.docx` is cut.

```ts
// lib/import/markdown-to-pm.ts  (Plan C only)
import { marked, type Token, type Tokens } from 'marked';
import type { PMDoc, PMNode, PMMark } from '@/lib/import/types';

function inline(tokens: Token[] | undefined, marks: PMMark[] = []): PMNode[] {
  const out: PMNode[] = [];
  for (const t of tokens ?? []) {
    switch (t.type) {
      case 'strong':
        out.push(...inline((t as Tokens.Strong).tokens, [...marks, { type: 'bold' }]));
        break;
      case 'em':
        out.push(...inline((t as Tokens.Em).tokens, [...marks, { type: 'italic' }]));
        break;
      case 'link':
        out.push(...inline((t as Tokens.Link).tokens, marks)); // text survives, href does not
        break;
      case 'br':
        out.push({ type: 'hardBreak' });
        break;
      case 'html': {
        // the only HTML we honour: <u>…</u> (Markdown has no underline syntax)
        const raw = (t as Tokens.HTML).raw;
        if (/^<\s*u\s*>/i.test(raw)) marks = [...marks, { type: 'underline' }];
        else if (/^<\s*\/\s*u\s*>/i.test(raw)) marks = marks.filter((m) => m.type !== 'underline');
        break;
      }
      default: {
        const text = ((t as Tokens.Text).text ?? (t as { raw?: string }).raw ?? '').toString();
        if (text) out.push({ type: 'text', text, ...(marks.length ? { marks } : {}) });
      }
    }
  }
  return out;
}

function listNode(t: Tokens.List): PMNode {
  return {
    type: t.ordered ? 'orderedList' : 'bulletList',
    ...(t.ordered && t.start ? { attrs: { start: Number(t.start) } } : {}),
    content: t.items.map((item) => ({
      type: 'listItem',
      content: [{ type: 'paragraph', content: inline(item.tokens) }],
    })),
  };
}

export function markdownToDocPlanC(md: string): PMDoc {
  const content: PMNode[] = [];
  for (const t of marked.lexer(md)) {
    switch (t.type) {
      case 'heading':
        content.push({
          type: 'heading',
          attrs: { level: Math.min((t as Tokens.Heading).depth, 3) },
          content: inline((t as Tokens.Heading).tokens),
        });
        break;
      case 'paragraph':
        content.push({ type: 'paragraph', content: inline((t as Tokens.Paragraph).tokens) });
        break;
      case 'list':
        content.push(listNode(t as Tokens.List));
        break;
      case 'blockquote':
      case 'code':
      case 'table': {
        // out of scope per §3.2 — keep the words, drop the structure
        const text = ((t as { text?: string }).text ?? '').trim();
        if (text) content.push({ type: 'paragraph', content: [{ type: 'text', text }] });
        break;
      }
      default:
        break; // space, hr, html-only lines, images: dropped
    }
  }
  return { type: 'doc', content: content.filter((n) => n.content?.length || n.type === 'hardBreak') };
}
```

Nested lists are flattened one level (a nested `list` token inside an item falls into `default`
and is dropped). That is an accepted Plan C regression, stated in the README. `assertLoadableByEditor`
still runs on this output — it is precisely the mapper most likely to emit an invalid document.

Cost: ~25–30 minutes to write and test. Still inside budget *because it replaces, not adds to,
the HTML path.*

### 5.6 The decision gate (write the outcome into `ARCHITECTURE.md`)

| At T+30, if… | Do this |
|---|---|
| Spike green (A, or A via a server entrypoint) | Ship all three formats. `.docx` included. |
| Green only after `jsdom` (B) | Ship all three formats. Note the `jsdom` dependency in `ARCHITECTURE.md`. |
| **Not green** | **Plan C immediately.** `.md` uses `markdownToDocPlanC`, `.txt` is untouched, **`.docx` is CUT.** |

**Why `.docx` is the thing that gets cut.** C8 says "`.md` / `.txt` / `.docx` → new document" but
the brief itself only requires *"at least one file"* type and explicitly asks us to state the
supported types. `.docx` is the only format that has no non-HTML path — `mammoth` produces HTML,
and if we cannot turn HTML into PM JSON, `.docx` has nowhere to go. `.md` + `.txt` satisfy C8 and
the brief on their own, and cutting deliberately with a stated reason is the graded skill
(`00-foundation.md` §4).

Cutting `.docx` is mechanically small because the copy is centralised (§2.3):

1. `ACCEPTED_EXTENSIONS = ['.md', '.txt']`
2. `IMPORT_LIMITS_COPY = 'Supported files: .md, .txt — maximum 2 MB per file.'`
3. Remove `.docx` entries from `IMPORT_ACCEPT_ATTR`; drop the `mammoth` dependency.
4. The README test fails until the README sentence is updated — that is the feature.
5. One paragraph in `ARCHITECTURE.md` and one line in `SUBMISSION.md`'s "what is incomplete".

*Optional degraded `.docx`, only if ≥20 minutes remain at the hour-6 feature freeze:*
`mammoth.extractRawText({ buffer })` → feed the result through `txtToDoc`. Text is preserved,
formatting is not. If taken, the README must say "`.docx` imports text only; formatting is not
preserved." Do not take this before the core slice is done.

---

## 6. Validation and error handling

### 6.1 Envelope

Per `00-foundation.md` §7 and `02-api-contract.md`, every failure is
`{ error: { code, message, details? } }` with the HTTP status below. `message` is written for a
human and is rendered verbatim by the UI (§9.3) — no client-side re-wording, so there is exactly
one place these sentences exist.

`{L}` below is `IMPORT_LIMITS_COPY` from §2.3, appended verbatim.

### 6.2 The exhaustive table

**The codes are `00-foundation.md` §7a's, not this slice's.** An earlier draft of this section
introduced nine bespoke `IMPORT_*` codes; they are gone. `ApiErrorCode` is a compile-time union
shared by the server and the client, and a route that emits a code outside it does not typecheck.
What survives is what actually mattered — **the nine distinct sentences**, plus a
`details.reason` discriminator on `PARSE_FAILED` so logs and tests can still tell the four parse
failures apart.

| # | Condition | Detected where | Status | `code` | `details.reason` | `message` (verbatim) |
|---|---|---|---|---|---|---|
| 1 | No session cookie | `withSession` | `401` | `UNAUTHENTICATED` | — | *(owned by `03-auth-and-permissions.md`)* |
| 2 | No `file` field, or it is not a `File` | route | `400` | `FILE_MISSING` | — | `No file was selected. Choose a file to import.` |
| 3 | Extension not in `ACCEPTED_EXTENSIONS` | `checkImportFile` | `415` | `UNSUPPORTED_FILE_TYPE` | — | `That file type isn't supported. Supported files: .md, .txt, .docx — maximum 2 MB per file.` |
| 4 | MIME positively wrong for the extension | `checkImportFile` | `415` | `UNSUPPORTED_FILE_TYPE` | — | *(same string as #3 — the user cannot act on the MIME/extension distinction)* |
| 5 | `file.size > MAX_FILE_BYTES` | before `arrayBuffer` | `413` | `FILE_TOO_LARGE` | — | `That file is too large. Supported files: .md, .txt, .docx — maximum 2 MB per file.` |
| 6 | `file.size === 0` | `checkImportFile` | `400` | `FILE_MISSING` | — | `That file is empty. Choose a file with some content in it.` |
| 7 | `.md`/`.txt` contains NUL bytes or is not valid UTF-8 | step 6 | `422` | `PARSE_FAILED` | `'not-text'` | `That file doesn't look like a text file. Supported files: .md, .txt, .docx — maximum 2 MB per file.` |
| 8 | `mammoth.convertToHtml` throws (not a zip, corrupt, password-protected) | step 7 | `422` | `PARSE_FAILED` | `'corrupt-docx'` | `We couldn't read that .docx file. It may be corrupt or password-protected.` |
| 9 | Parse produced no content, or only empty blocks | step 8 | `422` | `PARSE_FAILED` | `'empty-result'` | `We couldn't find any text in that file.` |
| 10 | Parsed result exceeds `MAX_CONTENT_BYTES` | step 10 | `413` | `CONTENT_TOO_LARGE` | — | `That document is too long to import. Try splitting it into smaller files.` |
| 11 | `assertLoadableByEditor` throws | step 9 | `422` | `PARSE_FAILED` | `'unsupported-content'` | `We couldn't convert that file into a document. Try a simpler file.` |
| 12 | Prisma insert fails / anything unhandled | `withSession`'s funnel | `500` | `INTERNAL_ERROR` | — | `Something went wrong on our end. Please try again.` |

Notes:

- **#4 reuses #3's message deliberately.** One sentence for the human; "your MIME type is wrong" is
  not actionable.
- **#6 shares #2's code.** "No file" and "a file with nothing in it" are the same problem to a user
  and to a caller, and the messages still differ.
- **#7 moved from `400` to `422`.** It is a well-formed upload we could not parse, which is what
  `422` means in this API (`00-foundation.md` §7a); `400` is for a malformed *request*.
- **#10 replaces the node/character budget.** `contentByteSize(doc) > MAX_CONTENT_BYTES` is one call
  against the same ceiling the autosave `PATCH` enforces, so an import can never produce a document
  the editor cannot then save. The 20,000-node / 400,000-character bound and its recursive
  `measure()` walk were cut — a second, differently-shaped bound on the same data, for ~40 minutes.
- **#11 should never fire in production.** If it does, `schemaExtensions` drifted or Plan C's mapper
  has a bug. Log the offending node type server-side alongside the reason so the cause is one grep
  away.
- **Zod's role.** `00-foundation.md` §7 requires Zod on every mutating route. Multipart bodies are
  not JSON, so Zod validates the *shape after extraction*, not the raw body:

  ```ts
  const ImportFormSchema = z.object({
    file: z.instanceof(File, { error: 'No file was selected. Choose a file to import.' }),
  });
  ```

  A failure here is case #2 — the route sketch in §6.3 inlines the equivalent `instanceof` check,
  which is the same validation with one fewer indirection. The byte-level checks stay in
  `parseUpload` where they belong. (Zod 4 uses `error`, not `message`, in the issue params —
  `00-foundation.md` §2a.)

### 6.3 Route sketch

The route uses the shared plumbing from `02-api-contract.md` §4 — `withSession`, `ok`, `fail` — like
every other route. It does not hand-roll `apiError`, and it does not null-check `requireSession()`
(which *throws*, so that branch was dead and the documented `401` never fired the way it claimed).

```ts
// app/api/documents/import/route.ts
import { fail, ok, withSession } from '@/lib/api';
import { prisma } from '@/lib/db';
import { parseUpload } from '@/lib/import';
import { toDocumentSummary } from '@/lib/documents/queries';

export const runtime = 'nodejs';

export const POST = withSession(async (req, { session }) => {
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');

  if (!(file instanceof File)) {
    return fail('FILE_MISSING', 'No file was selected. Choose a file to import.', 400);
  }

  const result = await parseUpload(file);
  if (!result.ok) return fail(result.code, result.message, result.status, result.details);

  const doc = await prisma.document.create({
    data: {
      title: result.title,
      content: result.content,
      sourceFilename: result.sourceFilename,
      ownerId: session.id,          // session.id — NOT session.userId, which is undefined
    },                              // and would write a null FK (00-foundation.md §7c)
    include: { owner: { select: { id: true, name: true, email: true } }, _count: { select: { shares: true } } },
  });

  // 201 DocumentSummary, not `{ id }`: the contract says so (02 §7.6), it is a strict
  // superset the client can ignore, and going through ok() is what gives the response
  // its `Cache-Control: no-store` (02 I2).
  return ok(toDocumentSummary(doc, 'OWNER'), 201);
});
```

No transaction is needed: one insert, no shares created at import time.

---

## 7. Security notes (proportionate to scope)

### 7.1 We never execute or store the raw file

The bytes exist as one `Buffer` inside one request. Nothing is written to disk, `/tmp`, or a
bucket; nothing is `eval`'d, `exec`'d, or shelled out to; no filename we received is ever used as
a filesystem path (`sourceFilename` is a display string only, and is sanitised in §8). The
serverless function is stateless and the buffer is garbage after the response. **There is no
"download the original" endpoint, so there is no path by which user-supplied bytes are ever served
back to a browser** — which removes the entire stored-XSS / content-sniffing class of bug that
normally comes with file upload.

### 7.2 The ProseMirror schema *is* the sanitizer

`marked` passes raw HTML in Markdown straight through, so a `.md` file may absolutely contain
`<script>alert(document.cookie)</script>`, `<img onerror=...>`, or `<a href="javascript:...">`.
We do not run an HTML sanitizer library, and we do not need one:

1. `htmlToDoc` strips `<script>`/`<style>` blocks with a regex first. This is **belt-and-braces,
   not the control** — regex HTML stripping is defeatable and we do not rely on it.
2. `generateJSON` parses the HTML **into the ProseMirror schema built from `schemaExtensions`**.
   ProseMirror is an allow-list parser: a node type with no matching `parseHTML` rule in the
   schema is not representable, and attributes not declared by an extension are not carried over.
   `<script>`, `<iframe>`, `onerror=`, `style=`, `href=` — none of them exist in our schema
   (§3.2 disables `link`), so none of them survive. The output is JSON containing only
   `doc/paragraph/heading/lists/hardBreak/text` and the three marks.
3. `assertLoadableByEditor` re-validates the result against that same schema and rejects anything
   that slipped through as `422`.
4. **The stored content is never rendered as HTML.** TipTap renders from JSON through the schema's
   `renderHTML`, constructing DOM nodes — it does not `innerHTML` our column. So even a string of
   text that *looks* like markup is displayed as inert text.

That is the honest statement to put in `ARCHITECTURE.md`: *schema-driven parsing is the sanitizer;
adding DOMPurify on top would be security theatre against a threat the schema already erases.*

### 7.3 Decompression bombs (`.docx`)

A `.docx` is a ZIP. A small ZIP can expand to gigabytes, and `mammoth` reads entries into memory.
Our bounds, in order:

| Bound | Value | Effect |
|---|---|---|
| Request/file size cap | 2 MB (§2.2) | Caps the *compressed* input. DEFLATE's practical ceiling on text is ~1000:1, so worst case is bounded, not unbounded. |
| Content byte ceiling | `MAX_CONTENT_BYTES` = 1 MB (§6.2 #10) | The expanded result is rejected **before** it reaches Postgres, against the same ceiling the autosave `PATCH` uses. |
| Function timeout | Vercel platform default | A pathological archive dies as a `500` rather than hanging forever. |
| No persistence of the archive | — | Nothing survives the request to be re-expanded later. |

We accept the residual risk: a single request may allocate a few hundred MB before the budget check
fires. For a 3-user demo with seeded accounts and authenticated-only import, that is proportionate.
The real fix (streaming size accounting inside the zip reader) is named in `ARCHITECTURE.md` as
out of scope, not overlooked.

### 7.4 Access control

Import is a **session-required** endpoint (`03-auth-and-permissions.md`). The created document's
`ownerId` is always `session.id` — it is never taken from the request. There is no way to
import *into* someone else's document, because import always creates a new one. No `resolveAccess`
call is needed: there is no existing resource to authorise against.

---

## 8. Title derivation

```ts
// lib/import/title.ts
export const MAX_TITLE_LENGTH = 120;
export const FALLBACK_TITLE = 'Untitled document'; // matches Prisma's @default

/**
 * "Q3 Report.docx"        -> "Q3 Report"
 * "  notes .md"           -> "notes"
 * ".md"                   -> "Untitled document"
 * "C:\\Users\\a\\x.txt"   -> "x"
 * 300-char name           -> first 120 chars, trimmed
 */
export function titleFromFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? '';
  const withoutExt = base.replace(/\.(md|txt|docx)$/i, '');
  const cleaned = withoutExt.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (cleaned.length === 0) return FALLBACK_TITLE;
  return cleaned.length > MAX_TITLE_LENGTH
    ? cleaned.slice(0, MAX_TITLE_LENGTH).trimEnd()
    : cleaned;
}
```

Only the three accepted extensions are stripped, so `my.notes.md` → `my.notes` (correct) and
`archive.tar.gz` never reaches this function anyway. The fallback string is identical to the
Prisma default in `00-foundation.md` §5, so an imported document with an unusable filename is
indistinguishable from a freshly created one.

**`sourceFilename`** is persisted alongside, as UI provenance (`00-foundation.md` §5: *"set when
created via import; shown as provenance in the UI"*). It stores the sanitised original basename:

```ts
export function safeSourceFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? '';
  return base.replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 255);
}
```

Control characters are stripped and the length is capped at 255. It is rendered as **text only**
(never a link, never a path, never a download) — see §9.4.

---

## 9. UI

### 9.1 Where the control lives

`/documents`, in the dashboard header row, immediately right of **New document** — both are
document-creation entry points and belong together. There is **no drag-and-drop zone**: it is
additional state machine, additional cross-browser testing, and zero additional capability. Cut,
and said out loud in the video.

### 9.2 The control

```tsx
// components/documents/import-button.tsx  (client component)
'use client';
import { IMPORT_ACCEPT_ATTR, IMPORT_LIMITS_COPY, MAX_FILE_BYTES,
         ACCEPTED_EXTENSIONS } from '@/lib/import/constants';

// <input type="file"> is visually hidden and triggered from the Button via a ref.
<input
  ref={inputRef}
  type="file"
  className="sr-only"
  accept=".md,.txt,.docx,text/markdown,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  onChange={onPick}
/>
<Button variant="outline" onClick={() => inputRef.current?.click()} disabled={isImporting}>
  {isImporting ? 'Importing…' : 'Import file'}
</Button>
<p className="text-sm text-muted-foreground">{IMPORT_LIMITS_COPY}</p>
```

The literal `accept` value above **is** `IMPORT_ACCEPT_ATTR` (§2.3); write it as
`accept={IMPORT_ACCEPT_ATTR}` in the real component so the picker and the server can never
disagree. `accept` is a hint only — every OS lets the user switch to "All files" — which is why
§6.2 cases 3–7 exist on the server.

### 9.3 States

| State | UI |
|---|---|
| idle | `Import file` button + the `IMPORT_LIMITS_COPY` helper line beneath it |
| client pre-check failed (bad extension or `size > MAX_FILE_BYTES`) | Inline error, no request sent, using the **same strings** as §6.2 #3/#5 |
| in flight | Button disabled, label `Importing…`, spinner; the file input is reset so re-picking the same file still fires `change` |
| error | Inline `<Alert variant="destructive">` under the button rendering `error.message` **verbatim** from the response; button re-enabled |
| success | `router.push('/documents/' + id)` then `router.refresh()` |

Success navigates *immediately* into the editor — the imported document is what the user came for,
and landing back on the dashboard would make them hunt for it. Because the row is committed before
the `201`, the editor page's server-side fetch always finds it; no optimistic state, no loading
race.

### 9.4 Provenance

On `/documents/[id]`, when `sourceFilename` is set, render a small muted line under the title:
`Imported from {sourceFilename}` — plain text, not a link. On the dashboard card, the same string
as a subtitle. That is the whole feature; it is what makes `sourceFilename` worth persisting.

### 9.5 README section (C8's "state that clearly in the … README")

`README.md` must contain a `## File import` section whose first line is `IMPORT_LIMITS_COPY`
verbatim (asserted by the test in §2.3), followed by the lossy-conversion note: which constructs
are preserved (§3.2 table) and which are dropped.

---

## 10. Test fixtures and tests

### 10.1 Fixtures committed under `tests/fixtures/import/`

| File | Purpose | Expected outcome |
|---|---|---|
| `valid-all-constructs.md` | Every supported construct: `#`/`##`/`###` headings, `**bold**`, `*italic*`, raw `<u>underline</u>`, a nested bulleted list, an ordered list, multiple paragraphs, plus two *unsupported* constructs (a fenced code block and a link) to pin the drop behaviour | `201`; PM JSON contains `heading` levels 1–3, `bold`/`italic`/`underline` marks, `bulletList`, `orderedList`; contains **no** `codeBlock` node and no `link` mark |
| `plain.txt` | Three paragraphs separated by blank lines, one paragraph with internal single newlines, CRLF line endings, trailing whitespace | `201`; 4 `paragraph` nodes, ≥1 `hardBreak`, no `\r` anywhere in the output |
| `sample.docx` | Small real Word file (~12 KB): H1, H2, a bold run, an italic run, an underlined run, a bulleted list. Authored once in LibreOffice Writer and committed; regenerating it is not part of any test | `201`; same assertions as the `.md` fixture |
| `whitespace-only.md` | Only spaces, tabs and blank lines | `422 PARSE_FAILED` · `reason: 'empty-result'` |
| `empty.txt` | Zero bytes (git stores this fine) | `400 FILE_MISSING` |
| `fake.md` | An `.exe` masquerading as Markdown: the `MZ` DOS magic bytes, then NUL bytes and binary filler, ~300 bytes. **A stub, not a real executable** — it must be harmless to have in the repo | `422 PARSE_FAILED` · `reason: 'not-text'` |
| `make-oversized.ts` | Generates `oversized.txt` (`MAX_FILE_BYTES + 1` bytes of filler) into a git-ignored temp dir at test setup | `413 FILE_TOO_LARGE` |

**Why `oversized.txt` is generated rather than committed** (a deliberate deviation from "commit an
oversized file"): committing 2 MB of filler bloats every clone reviewers make, for a file whose
only meaningful property is its byte count. A five-line generator produces it deterministically at
test time and documents the intent better than the blob would. The fixture list in the README
mentions it so it is not mistaken for an omission.

A `.docx` corruption case needs no new fixture: truncate `sample.docx` to its first 100 bytes in
the test and assert `422 PARSE_FAILED` with `reason: 'corrupt-docx'`.

### 10.2 Tests (all Vitest, per `00-foundation.md`)

All unit tests are **colocated under `lib/`** — the `unit` Vitest project's `include` is
`['lib/**/*.test.ts']`, so a file under `tests/unit/` is collected by no project and `pnpm test:unit`
reports green on a suite that never ran.

| File | Kind | Covers |
|---|---|---|
| `lib/import/html-to-pm.test.ts` | unit, no DB | The promoted R1 spike (§5.2) — `htmlToDoc` against a fixed HTML string, using `schemaExtensions` |
| `lib/import/title.test.ts` | unit | `titleFromFilename` table (16 rows, `06-test-plan.md` §4.1): normal, extension-only, whitespace-only, over-length, path-prefixed, multi-dot |
| `lib/import/parsers.test.ts` | unit | `txtToDoc` paragraph/hardBreak splitting; `markdownToDoc` on `valid-all-constructs.md`; the drop assertions |
| `lib/import/validate.test.ts` | unit | `checkImportFile` — the 18-row table in `06-test-plan.md` §4.2, plus the §6.2 rows driven off the fixtures, asserting `{ status, code }` |
| `lib/import/limits-copy.test.ts` | unit | README contains `IMPORT_LIMITS_COPY` verbatim (§2.3) |
| `tests/integration/import.test.ts` | integration, needs Postgres (R3) | `POST /api/documents/import` with `plain.txt` → `201`, row exists, `ownerId` is the caller, `sourceFilename` set, `content` round-trips; and unauthenticated → `401` |

`pnpm test:unit` must cover everything except the last row, so it stays runnable with zero
infrastructure (`00-foundation.md` §9 R3).

---

## 11. Budget

| Task | Estimate |
|---|---|
| R1 spike (§5), hard-stopped | 0:30 |
| `lib/editor-extensions.ts` + `lib/import/*` (constants, types, parsers, html-to-pm, title, orchestrator) | 0:35 |
| Route handler + Zod + error mapping | 0:15 |
| `ImportButton` component + dashboard wiring + provenance line | 0:20 |
| Fixtures + tests | 0:20 |
| **Total** | **~2:00** of the 8h |

The spike is 25% of this slice's budget. That is correct pricing for the project's largest unknown:
if it comes back red at T+30, Plan C is already written above and the remaining 1:30 is unaffected.

---

## 12. Rulings (previously "open questions")

1. ✅ **The nine `IMPORT_*` codes are gone; `02-api-contract.md` won**, as this spec said it should.
   They map onto the registry in `00-foundation.md` §7a: no-file and empty-file → `FILE_MISSING`,
   unsupported extension/MIME → `UNSUPPORTED_FILE_TYPE` (**415**), oversize → `FILE_TOO_LARGE`
   (**413**), not-text / corrupt-docx / empty-result / unsupported-content → `PARSE_FAILED`
   (**422**) discriminated by `details.reason`, and an oversized parse result →
   `CONTENT_TOO_LARGE`. All nine **messages** in §6.2 survive unchanged — the codes were never the
   valuable half.
2. ✅ **`lib/editor-extensions.ts` is the one module, and `04-ui-spec.md` §3 now imports
   `editorExtensions` from it** instead of defining its own array. The disabled set stands, and
   `Placeholder` moved into `editorExtensions` where it belongs (client-only, no schema impact).
3. ✅ **StarterKit v3 does bundle `Underline`** — confirmed against the npm registry
   (`_toolchain-findings.md` TRAP-2), not deferred to the spike. `@tiptap/extension-underline` is
   not installed and not registered anywhere; a second registration throws `Duplicate extension
   name` at editor init, which is a white screen on every document. The spike's underline assertion
   is now the check that StarterKit really does provide the mark.
4. ✅ **`PMDoc`/`PMNode` stay in `lib/import/types.ts`** as the *parser's* working types, and
   `lib/documents/content.ts` owns the *stored* type and its guard. The two meet at
   `documentContentSchema.parse()` on the write path, which is the boundary that matters. They are
   not duplicated definitions of one thing; they are a producer type and a persisted type.
5. ❌ **The node/character budget is cut.** It was a second bound, differently shaped, on the same
   data — ~40 minutes for a `measure()` DFS plus an error code. `contentByteSize(doc) >
   MAX_CONTENT_BYTES` (`lib/documents/content.ts`) does the job in one call, against the *same*
   ceiling the autosave `PATCH` enforces, so an import can never produce a document the editor
   cannot save. §6.2 row 10 is now `CONTENT_TOO_LARGE`.
6. ⏳ **Still live, by design: if the spike goes red, `.docx` is cut and C8 narrows.**
   `00-foundation.md` §3's C8 row already carries the conditional wording. The cut is one constant
   edit (§5.6) plus one line each in `ARCHITECTURE.md` and `SUBMISSION.md`, and it is item 1 on
   `10-task-graph.md` §7's cut list. Raise it the moment the box expires; do not decide it
   silently.

---

## Definition of done

- [ ] `scripts/spike-generate-json.mjs` has been run under `node` and its outcome recorded; the R1 row in `00-foundation.md` §9 is annotated with Plan A, B, or C and the decision took **≤30 minutes**.
- [ ] `lib/editor-extensions.ts` exists, exports `schemaExtensions` **and** `editorExtensions`, and a repo-wide grep for `StarterKit` returns hits **only** in that file and in `scripts/spike-generate-json.mjs`. `@tiptap/extension-underline` appears in no `package.json` and no import, and the `underline` mark still works in the editor.
- [ ] `POST /api/documents/import` accepts `multipart/form-data` with a `file` field, runs on the Node runtime, is wrapped by `withSession`, and returns **`201 DocumentSummary`** for `tests/fixtures/import/plain.txt`. `grep -rn "apiError\|requireSession()" app/api/documents/import/` is empty.
- [ ] Importing `valid-all-constructs.md` yields PM JSON containing `heading` (levels 1, 2, 3), `bold`, `italic` and `underline` marks, `bulletList` and `orderedList`, and containing **no** node or mark outside the §3.2 table.
- [ ] Importing `sample.docx` yields the same construct coverage — **or** `.docx` has been cut per §5.6 and the cut is reflected in `ACCEPTED_EXTENSIONS`, `IMPORT_LIMITS_COPY`, `IMPORT_ACCEPT_ATTR`, the README, `ARCHITECTURE.md` and `SUBMISSION.md`.
- [ ] Every row of the §6.2 table returns exactly its stated status code and `error.code` (and `details.reason` where the table names one), verified by `lib/import/validate.test.ts`. No code outside the `ApiErrorCode` union appears anywhere — guaranteed by `tsc`, confirmed by `grep -rn "IMPORT_" lib/ app/` returning nothing.
- [ ] `assertLoadableByEditor` runs on the output of all three (or two) parsers, and there is a test proving it throws for a document containing a disabled node type.
- [ ] Opening an imported document at `/documents/[id]` renders it with no console error — verified by hand for one `.md`, one `.txt`, and (if shipped) one `.docx`.
- [ ] `IMPORT_LIMITS_COPY` appears verbatim in the dashboard UI **and** as the first line of `README.md`'s `## File import` section; `lib/import/limits-copy.test.ts` passes on a clean clone. No component contains a byte literal for the cap.
- [ ] A file over 2 MB is rejected with `413` **before** its body is buffered (`file.size` is checked prior to `arrayBuffer()`).
- [ ] `tests/fixtures/import/fake.md` (an `.exe` in disguise) is rejected `422 PARSE_FAILED` with `reason: 'not-text'`, and `empty.txt` is rejected `400 FILE_MISSING`.
- [ ] Nothing binary is written to disk or to any bucket: a grep for `writeFile`, `/tmp`, `@vercel/blob`, `aws-sdk` and `s3` in `lib/import/` and `app/api/documents/import/` returns nothing.
- [ ] The created document's `ownerId` equals the session user, `title` comes from `titleFromFilename`, and `sourceFilename` is persisted and rendered as plain text on the editor page.
- [ ] Importing a `.md` containing `<script>alert(1)</script>` produces a document whose JSON contains no `script` node and no `on*` attribute, and the editor renders no alert — covered by a test.
- [ ] `pnpm test:unit` passes with no database running, **and actually collects these files** — they are under `lib/`, which is the unit project's `include` glob, not under `tests/unit/`.
- [ ] `samples/sample.md`, `samples/sample.txt` and `samples/sample.docx` exist (copies of the three good fixtures), so `README.md` and `SUBMISSION.md`'s "Review in 60 seconds" point at real files.
