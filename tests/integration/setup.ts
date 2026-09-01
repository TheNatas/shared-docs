// tests/integration/setup.ts
//
// Vitest `setupFiles` — runs once per test FILE, inside the worker process.
// specs/06-test-plan.md §5.4.
//
// The reset strategy is truncate-then-reseed rather than a transaction-per-test rollback.
// The handlers under test open their own Prisma calls; wrapping them in an outer transaction
// would mean threading a transactional client through `lib/db.ts`, which is production code
// this task may not touch and, more importantly, would mean the tests exercise a client the
// application never uses. One TRUNCATE ... RESTART IDENTITY CASCADE plus three createMany
// calls costs single-digit milliseconds, which is cheaper than that trade is worth.
//
// Correctness depends on `fileParallelism: false` + `maxWorkers: 1` in vitest.config.ts.
// Two workers on one database would truncate each other's fixtures mid-assertion.

import { afterAll, beforeAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { seedFixtures } from "./fixtures";
import { REQUIRED_DATABASE, assertDisposableTestDatabase } from "./global-setup";

// ── Guard, layer 2 ─────────────────────────────────────────────────────────────────────
// global-setup.ts validated TEST_DATABASE_URL in the PARENT process. This validates the
// DATABASE_URL that this worker will actually hand to Prisma — a different string, produced
// by vitest.config.ts's `env` block. Checking only the first would leave the gap where the
// rail passes and the connection still goes somewhere else.
assertDisposableTestDatabase(process.env.DATABASE_URL, "DATABASE_URL");

beforeAll(async () => {
  // ── Guard, layer 3 ───────────────────────────────────────────────────────────────────
  // Layers 1 and 2 check configuration. This asks the OPEN CONNECTION which database it is
  // in, which is the only check that cannot be fooled by a parameter Prisma interprets
  // differently from `new URL()`. It runs before the first TRUNCATE, not after.
  //
  // Only the database NAME is asked for. `inet_server_port()` would report 5432 — the port
  // Postgres listens on inside the container — not the 55432 the host publishes, so it
  // cannot corroborate anything and would only look like it did.
  const rows = await prisma.$queryRaw<Array<{ db: string }>>`
    SELECT current_database() AS db
  `;
  const db = rows[0]?.db;

  if (db !== REQUIRED_DATABASE) {
    await prisma.$disconnect();
    throw new Error(
      `\n  REFUSING TO TRUNCATE: the live connection reports current_database() = ` +
        `"${db ?? "(unknown)"}", not "${REQUIRED_DATABASE}".\n` +
        `  Configuration said one thing and the server says another. Stopping.\n`,
    );
  }
});

beforeEach(async () => {
  // One statement, CASCADE, RESTART IDENTITY: deterministic, and ~2 ms.
  // Safe ONLY because of the three guards above. Do not move this above them.
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "DocumentShare", "Document", "User" RESTART IDENTITY CASCADE',
  );
  await seedFixtures();
});

afterAll(async () => {
  await prisma.$disconnect();
});
