import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Generates the over-the-cap fixture at test setup rather than committing it.
 *
 * A deliberate deviation from "commit an oversized file": 2 MB of filler would bloat every
 * clone a reviewer makes, to prove something a generated file proves identically. The cap
 * itself is imported rather than hardcoded, so raising MAX_FILE_BYTES cannot leave this
 * fixture silently under the limit and turn a real assertion into a no-op.
 */
export const MAX_FILE_BYTES = 2 * 1024 * 1024; // mirrors lib/import/constants.ts §2.2

export function makeOversizedFile(): string {
  const dir = join(tmpdir(), "shared-docs-test-fixtures");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "oversized.txt");
  writeFileSync(path, "a".repeat(MAX_FILE_BYTES + 1));
  return path;
}
