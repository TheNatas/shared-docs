import { describe, expect, it, vi } from "vitest";
import {
  can,
  CAPABILITIES,
  ROLES,
  type AccessRole,
  type Capability,
} from "./permissions";

// Hoisted above the import above. The pure suite must stay dependency-free
// (00-foundation.md R3): loading permissions.ts pulls in the Prisma singleton, which would
// open a connection pool for a test that never touches a database. `can()` itself has no
// path to either.
vi.mock("@/lib/db", () => ({ prisma: {} }));

/**
 * One row per cell of 00-foundation.md §6. If this table and the foundation ever disagree,
 * the foundation wins and this table is the bug.
 */
const MATRIX: ReadonlyArray<[AccessRole, Capability, boolean]> = [
  // read: everyone with any grant can read; NONE cannot.
  ["OWNER", "read", true],
  ["EDITOR", "read", true],
  ["VIEWER", "read", true],
  ["NONE", "read", false],
  // update content: owner + editor.
  ["OWNER", "update", true],
  ["EDITOR", "update", true],
  ["VIEWER", "update", false],
  ["NONE", "update", false],
  // rename: same as update — the title is content.
  ["OWNER", "rename", true],
  ["EDITOR", "rename", true],
  ["VIEWER", "rename", false],
  ["NONE", "rename", false],
  // delete: owner only.
  ["OWNER", "delete", true],
  ["EDITOR", "delete", false],
  ["VIEWER", "delete", false],
  ["NONE", "delete", false],
  // see who a document is shared with: owner only.
  ["OWNER", "viewShares", true],
  ["EDITOR", "viewShares", false],
  ["VIEWER", "viewShares", false],
  ["NONE", "viewShares", false],
  // grant / change / revoke: owner only. An EDITOR cannot re-share.
  ["OWNER", "manageShares", true],
  ["EDITOR", "manageShares", false],
  ["VIEWER", "manageShares", false],
  ["NONE", "manageShares", false],
];

describe("can(role, capability)", () => {
  it.each(MATRIX)("%s %s -> %s", (role, capability, expected) => {
    expect(can(role, capability)).toBe(expected);
  });

  it("covers every role x capability pair exactly once", () => {
    // Guard rail: adding a capability or a role to lib/permissions.ts without adding its rows
    // here fails immediately instead of shipping untested.
    expect(MATRIX).toHaveLength(ROLES.length * CAPABILITIES.length);
    const seen = new Set(MATRIX.map(([r, c]) => `${r}|${c}`));
    expect(seen.size).toBe(MATRIX.length);
    for (const role of ROLES) {
      for (const capability of CAPABILITIES) {
        expect(seen.has(`${role}|${capability}`)).toBe(true);
      }
    }
  });

  // The two properties below are not redundant with the matrix: they keep holding when a
  // capability is added, whereas the rows only cover what was enumerated.
  it("grants NONE nothing at all", () => {
    expect(CAPABILITIES.filter((c) => can("NONE", c))).toEqual([]);
  });

  it("never lets a non-OWNER manage shares", () => {
    expect(ROLES.filter((r) => can(r, "manageShares"))).toEqual(["OWNER"]);
  });
});
