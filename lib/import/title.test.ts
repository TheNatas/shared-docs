import { describe, expect, it } from "vitest";

import {
  FALLBACK_TITLE,
  MAX_TITLE_LENGTH,
  safeSourceFilename,
  titleFromFilename,
} from "@/lib/import/title";

/**
 * specs/06-test-plan.md §4.1 — the 16-row table, verbatim.
 *
 * A filename is attacker-controlled text arriving on a multipart part header, so half of
 * these rows are hostile inputs rather than typos.
 */
describe("titleFromFilename", () => {
  it.each([
    ["notes.md", "notes"],
    ["Q3 Report (final).docx", "Q3 Report (final)"],
    // Only the allowlisted extension is stripped, so a dotted name keeps its dots.
    ["a.b.c.md", "a.b.c"],
    ["archive.tar.md", "archive.tar"],
    ["README", "README"],
    // A leading dot is not an extension.
    [".gitignore", ".gitignore"],
    ["notes.MD", "notes"],
    // Never reaches here in practice (validate.ts rejects it first) but the function
    // must not lie about what it strips.
    ["notes.exe", "notes.exe"],
    ["", FALLBACK_TITLE],
    ["   ", FALLBACK_TITLE],
    [".md", FALLBACK_TITLE],
    // Basename only: a path in a filename is text, never a path.
    ["../../etc/passwd.md", "passwd"],
    ["C:\\Users\\bob\\plan.docx", "plan"],
    ["my\nnotes\t.md", "my notes"],
    ["relatório-2026 ✅.md", "relatório-2026 ✅"],
  ])("titleFromFilename(%j) -> %j", (input, expected) => {
    expect(titleFromFilename(input)).toBe(expected);
  });

  it("caps very long names at MAX_TITLE_LENGTH", () => {
    const title = titleFromFilename(`${"x".repeat(400)}.md`);
    expect(title).toHaveLength(MAX_TITLE_LENGTH);
    expect(title).toBe("x".repeat(MAX_TITLE_LENGTH));
  });

  it("never returns an empty string for any input", () => {
    // An empty title would render as a blank row on the dashboard with nothing to click.
    for (const junk of ["", " ", ".", "..", ".md", "\u0000", "/", "\\"]) {
      expect(titleFromFilename(junk).length).toBeGreaterThan(0);
    }
  });

  it("uses the same fallback string as the Prisma column default", () => {
    // If these ever diverge, an import with an unusable filename becomes visibly different
    // from a document created from scratch, for no reason a user could explain.
    expect(FALLBACK_TITLE).toBe("Untitled document");
  });
});

describe("safeSourceFilename", () => {
  it("keeps the basename and nothing else", () => {
    expect(safeSourceFilename("../../etc/passwd.md")).toBe("passwd.md");
    expect(safeSourceFilename("C:\\Users\\bob\\plan.docx")).toBe("plan.docx");
  });

  it("keeps the extension, unlike titleFromFilename", () => {
    // It is provenance ("Imported from notes.md"), not a title.
    expect(safeSourceFilename("notes.md")).toBe("notes.md");
  });

  it("strips control characters", () => {
    // A newline here would let a filename forge a second line in a server log.
    expect(safeSourceFilename("re\u0000port\n.md")).toBe("report.md");
  });

  it("caps the length at 255", () => {
    expect(safeSourceFilename(`${"n".repeat(400)}.md`)).toHaveLength(255);
  });
});
