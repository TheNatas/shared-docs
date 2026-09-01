import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import { parseUpload } from "@/lib/import";
import { IMPORT_LIMITS_COPY, MAX_FILE_BYTES } from "@/lib/import/constants";
import { checkImportFile } from "@/lib/import/validate";
import { makeOversizedFile } from "@/tests/fixtures/import/make-oversized";

/**
 * specs/06-test-plan.md §4.2 (the 18-row allowlist table) and
 * specs/05-import-spec.md §6.2 (the error table, driven off the committed fixtures).
 *
 * Every size assertion is written against `MAX_FILE_BYTES` rather than `2097152`, so raising
 * the cap cannot silently turn a boundary test into a no-op.
 */

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const FIXTURES = fileURLToPath(new URL("../../tests/fixtures/import/", import.meta.url));

function fixtureFile(name: string, mimeType: string): File {
  const bytes = new Uint8Array(readFileSync(`${FIXTURES}${name}`));
  return new File([bytes], name, { type: mimeType });
}

describe("checkImportFile", () => {
  it.each([
    // #   filename                 mimeType                    size                  expected
    [1, "notes.md", "text/markdown", 1024, { ok: true, kind: "md" }],
    // The browser sent no type at all — Firefox on Linux does this for Markdown.
    [2, "notes.md", "", 1024, { ok: true, kind: "md" }],
    [3, "notes.md", "application/octet-stream", 1024, { ok: true, kind: "md" }],
    [4, "notes.MD", "text/plain", 1024, { ok: true, kind: "md" }],
    // `.markdown` is deliberately NOT accepted: the advertised copy says `.md`, and an
    // accepted-but-unadvertised extension is drift.
    [5, "notes.markdown", "text/markdown", 1024, { code: "UNSUPPORTED_FILE_TYPE", status: 415 }],
    [6, "notes.txt", "text/plain", 1024, { ok: true, kind: "txt" }],
    [7, "plan.docx", DOCX_MIME, 50_000, { ok: true, kind: "docx" }],
    [8, "malware.exe", "application/x-msdownload", 10, { code: "UNSUPPORTED_FILE_TYPE", status: 415 }],
    [9, "photo.png", "image/png", 10, { code: "UNSUPPORTED_FILE_TYPE", status: 415 }],
    [10, "legacy.doc", "application/msword", 10, { code: "UNSUPPORTED_FILE_TYPE", status: 415 }],
    [11, "notes.pdf", "application/pdf", 10, { code: "UNSUPPORTED_FILE_TYPE", status: 415 }],
    [12, "README", "text/plain", 10, { code: "UNSUPPORTED_FILE_TYPE", status: 415 }],
    // The LAST extension wins, so a double extension cannot smuggle anything through.
    [13, "evil.md.exe", "text/markdown", 10, { code: "UNSUPPORTED_FILE_TYPE", status: 415 }],
    // Positively-wrong MIME for an allowlisted extension.
    [14, "plan.docx", "image/png", 10, { code: "UNSUPPORTED_FILE_TYPE", status: 415 }],
    [15, "notes.md", "text/markdown", MAX_FILE_BYTES, { ok: true, kind: "md" }],
    [16, "notes.md", "text/markdown", MAX_FILE_BYTES + 1, { code: "FILE_TOO_LARGE", status: 413 }],
    [17, "notes.md", "text/markdown", 0, { code: "FILE_MISSING", status: 400 }],
    // Order: extension is decided before size. "Your executable was too big" would imply we
    // would have taken a smaller one.
    [18, "malware.exe", "application/x-msdownload", MAX_FILE_BYTES + 1, { code: "UNSUPPORTED_FILE_TYPE", status: 415 }],
  ])("row %i: %s / %s / %d", (_row, filename, mimeType, size, expected) => {
    expect(checkImportFile({ filename, mimeType, size })).toMatchObject(expected);
  });

  it("gives every rejection a message a user can act on", () => {
    const unsupported = checkImportFile({ filename: "a.exe", mimeType: "", size: 10 });
    const tooLarge = checkImportFile({
      filename: "a.md",
      mimeType: "",
      size: MAX_FILE_BYTES + 1,
    });

    expect(unsupported.ok).toBe(false);
    expect(tooLarge.ok).toBe(false);
    // The limits sentence is appended verbatim, never re-worded per call site.
    if (!unsupported.ok) expect(unsupported.message).toContain(IMPORT_LIMITS_COPY);
    if (!tooLarge.ok) expect(tooLarge.message).toContain(IMPORT_LIMITS_COPY);
  });
});

/**
 * The §6.2 table end to end, against the committed fixtures. `parseUpload` is the whole
 * server-side decision — the route adds only "no file part at all" and the Prisma insert — so
 * these rows are the error contract, testable with no database and no HTTP.
 */
describe("parseUpload — the §6.2 error table", () => {
  it("row 3: an unsupported extension is 415 UNSUPPORTED_FILE_TYPE", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "notes.pdf", {
      type: "application/pdf",
    });
    await expect(parseUpload(file)).resolves.toMatchObject({
      ok: false,
      status: 415,
      code: "UNSUPPORTED_FILE_TYPE",
    });
  });

  it("row 6: empty.txt (0 bytes) is 400 FILE_MISSING", async () => {
    await expect(parseUpload(fixtureFile("empty.txt", "text/plain"))).resolves.toMatchObject({
      ok: false,
      status: 400,
      code: "FILE_MISSING",
    });
  });

  it("row 7: fake.md (an .exe in disguise) is 422 PARSE_FAILED / not-text", async () => {
    // MZ magic plus NUL filler. The NUL sniff is what catches it; the extension and the
    // declared MIME both say "Markdown" and are both wrong.
    await expect(parseUpload(fixtureFile("fake.md", "text/markdown"))).resolves.toMatchObject({
      ok: false,
      status: 422,
      code: "PARSE_FAILED",
      details: { reason: "not-text" },
    });
  });

  it("row 8: a truncated .docx is 422 PARSE_FAILED / corrupt-docx", async () => {
    // No separate fixture: the first 100 bytes of a real docx is not a zip.
    const whole = readFileSync(`${FIXTURES}sample.docx`);
    const head = new Uint8Array(whole.subarray(0, 100));
    const file = new File([head], "sample.docx", { type: DOCX_MIME });

    await expect(parseUpload(file)).resolves.toMatchObject({
      ok: false,
      status: 422,
      code: "PARSE_FAILED",
      details: { reason: "corrupt-docx" },
    });
  });

  it("row 9: whitespace-only.md is 422 PARSE_FAILED / empty-result", async () => {
    // It parses fine — into a document with no words in it, which is not worth creating.
    await expect(
      parseUpload(fixtureFile("whitespace-only.md", "text/markdown")),
    ).resolves.toMatchObject({
      ok: false,
      status: 422,
      code: "PARSE_FAILED",
      details: { reason: "empty-result" },
    });
  });

  it("row 5: an over-cap file is 413 FILE_TOO_LARGE, and its body is never buffered", async () => {
    const bytes = new Uint8Array(readFileSync(makeOversizedFile()));
    const file = new File([bytes], "oversized.txt", { type: "text/plain" });
    const arrayBuffer = vi.spyOn(file, "arrayBuffer");

    await expect(parseUpload(file)).resolves.toMatchObject({
      ok: false,
      status: 413,
      code: "FILE_TOO_LARGE",
    });

    // The point of checking `file.size` first: a 4 MB upload must never become a 4 MB Buffer
    // inside a serverless function just to be told it is too big.
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it("row 10: a file under the file cap whose PARSED result is over the content cap is 413", async () => {
    // The two ceilings are different numbers guarding different things: MAX_FILE_BYTES (2 MB)
    // bounds the upload, MAX_CONTENT_BYTES (1 MB) bounds the Json column. A 1.5 MB .txt sails
    // through the first and must be stopped by the second — otherwise import could create a
    // document the autosave PATCH would then refuse to save.
    const bytes = new TextEncoder().encode("a".repeat(1_500_000));
    const file = new File([bytes], "long.txt", { type: "text/plain" });

    expect(file.size).toBeLessThan(MAX_FILE_BYTES);
    await expect(parseUpload(file)).resolves.toMatchObject({
      ok: false,
      status: 413,
      code: "CONTENT_TOO_LARGE",
    });
  });

  it("accepts the good fixtures and reports title and provenance separately", async () => {
    const md = await parseUpload(fixtureFile("valid-all-constructs.md", "text/markdown"));
    expect(md).toMatchObject({
      ok: true,
      title: "valid-all-constructs",
      sourceFilename: "valid-all-constructs.md",
    });

    const txt = await parseUpload(fixtureFile("plain.txt", "text/plain"));
    expect(txt).toMatchObject({ ok: true, title: "plain", sourceFilename: "plain.txt" });

    const docx = await parseUpload(fixtureFile("sample.docx", DOCX_MIME));
    expect(docx).toMatchObject({ ok: true, title: "sample", sourceFilename: "sample.docx" });
  });

  it("returns content that already satisfies the stored-content guard", async () => {
    const result = await parseUpload(fixtureFile("plain.txt", "text/plain"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // parseUpload runs documentContentSchema itself, so the route can insert without a
    // second guard and without a throw escaping into the 400 VALIDATION_FAILED path.
    expect(result.content.type).toBe("doc");
    expect(Array.isArray(result.content.content)).toBe(true);
  });
});
