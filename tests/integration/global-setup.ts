// tests/integration/global-setup.ts
//
// Runs ONCE per `vitest run --project integration`, in the main Vitest process, before any
// test file is loaded. Two jobs, in this order and never the other order:
//
//   1. REFUSE to run against anything that is not the disposable test container.
//   2. Push the Prisma schema into it.
//
// ─────────────────────────────────────────────────────────────────────────────────────────
// WHY (1) IS THE MOST IMPORTANT CODE IN THIS DIRECTORY
//
// `setup.ts` runs, before EVERY test:
//     TRUNCATE TABLE "DocumentShare", "Document", "User" RESTART IDENTITY CASCADE
//
// That statement does not ask questions and does not roll back. Pointed at a database
// somebody cares about, it is unrecoverable — there is no undo, no soft delete, and by the
// time anyone notices, several hundred more truncations have run on top of it.
//
// This is not hypothetical here. Ninety minutes before this file was written, a smoke test
// everyone believed was addressing local Postgres wrote to the PRODUCTION Neon database,
// because `next start` runs in production mode and Next.js loads `.env.production.local`
// ahead of `.env`. Four junk documents reached production before it was caught, and the file
// has since been renamed to `ops/neon.env` so Next can no longer auto-load it. Nothing about
// that failure announced itself: every command exited 0 and every log line looked normal.
//
// This guard is the same class of protection, one layer lower. It is therefore built to be
// LOUD and to fail CLOSED:
//
//   · It PARSES the URL rather than substring-matching it. `url.includes('shared_docs_test')`
//     is satisfied by `postgres://…/prod?app=shared_docs_test`, and `includes(':55432/')` is
//     satisfied by a password containing that text. Neither substring says anything about
//     which database a driver will actually open.
//   · There is NO default and NO fallback. A missing TEST_DATABASE_URL throws. "Helpfully"
//     defaulting to a URL is how a suite silently starts addressing whatever the developer's
//     `.env` happens to name — which is exactly the production incident above, re-run with a
//     TRUNCATE in the loop.
//   · The error names WHAT IT ACTUALLY FOUND, with the password masked, so the reader can see
//     the near-miss instead of guessing at it.
//   · The same assertion is re-run inside the worker process by `setup.ts`, against the
//     DATABASE_URL Prisma will really connect with, and then again against the live
//     connection's own `current_database()`. Three checks, because the first two check
//     configuration and only the third checks reality.
//
// See specs/DECISIONS.md D013 and specs/06-test-plan.md §5.3.
// ─────────────────────────────────────────────────────────────────────────────────────────

import { execSync } from "node:child_process";

/** The ONLY database this suite is ever allowed to touch. */
export const REQUIRED_DATABASE = "shared_docs_test";

/**
 * The ONLY port. 55432 rather than 5432 so the URL cannot accidentally match a Postgres a
 * developer already has running, and so a human reading the string can tell at a glance that
 * it is not a real one (docker-compose.test.yml, specs/06-test-plan.md §5.2).
 */
export const REQUIRED_PORT = "55432";

/** Loopback only. A `shared_docs_test` on someone else's host is still someone else's host. */
const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Renders a connection string for a human without leaking the password. D012's rule for
 * production seeds — "echo the masked URL and read the host before running" — applies with
 * more force here, because this message is printed precisely when something is wrong.
 */
function mask(url: string): string {
  try {
    const u = new URL(url);
    const auth = u.username ? `${u.username}:***@` : "";
    return `${u.protocol}//${auth}${u.hostname || "(no host)"}:${u.port || "(no port)"}${u.pathname}`;
  } catch {
    return "(unparseable connection string — not printed, it may contain a password)";
  }
}

function refuse(variableName: string, found: string, reasons: string[]): never {
  throw new Error(
    [
      "",
      "  ══════════════════════════════════════════════════════════════════════════",
      "   REFUSING TO RUN THE INTEGRATION SUITE",
      "  ══════════════════════════════════════════════════════════════════════════",
      "",
      `   ${variableName} = ${found}`,
      "",
      ...reasons.map((r) => `     ✗ ${r}`),
      "",
      "   This suite runs, before EVERY single test:",
      '     TRUNCATE TABLE "DocumentShare", "Document", "User" RESTART IDENTITY CASCADE',
      "",
      `   It may address ONLY the throwaway container from docker-compose.test.yml:`,
      `   database "${REQUIRED_DATABASE}" on port ${REQUIRED_PORT}, on loopback.`,
      "",
      "   Fix:  pnpm db:test:up      (and let .env.test supply TEST_DATABASE_URL)",
      "",
      "   There is deliberately no default URL to fall back to. See specs/DECISIONS.md D013.",
      "  ══════════════════════════════════════════════════════════════════════════",
      "",
    ].join("\n"),
  );
}

function parseOrRefuse(variableName: string, url: string): URL {
  try {
    return new URL(url);
  } catch {
    return refuse(variableName, "(unparseable)", [
      "it is not a parseable URL, so nothing can be verified about it",
    ]);
  }
}

/**
 * The rail. Throws unless `url` unambiguously names the disposable test database.
 *
 * Exported because `setup.ts` re-runs it inside the worker process against the DATABASE_URL
 * Prisma will actually use. Validating TEST_DATABASE_URL in the parent proves nothing about
 * the value `vitest.config.ts`'s `env` block ended up handing the child — those are two
 * different strings, and only one of them opens a connection.
 */
export function assertDisposableTestDatabase(
  url: string | undefined,
  variableName = "TEST_DATABASE_URL",
): asserts url is string {
  if (!url || url.trim() === "") {
    refuse(variableName, "(not set)", [
      "it is empty or undefined",
      "no default is substituted — a guessed URL is exactly the failure this guard exists to prevent",
    ]);
  }

  const parsed = parseOrRefuse(variableName, url);

  // `pathname` is "/shared_docs_test"; strip the leading slash and ignore anything after a
  // further slash, so a crafted path cannot smuggle the expected name into a prefix.
  const database = parsed.pathname.replace(/^\//, "").split("/")[0] ?? "";
  const port = parsed.port;
  const host = parsed.hostname;

  const reasons: string[] = [];
  if (database !== REQUIRED_DATABASE) {
    reasons.push(
      `database is "${database || "(none)"}" — this suite only ever runs against "${REQUIRED_DATABASE}"`,
    );
  }
  if (port !== REQUIRED_PORT) {
    reasons.push(
      `port is "${port || "(none)"}" — this suite only ever runs against port ${REQUIRED_PORT}`,
    );
  }
  if (!ALLOWED_HOSTS.has(host)) {
    reasons.push(`host is "${host || "(none)"}" — this suite only ever runs against loopback`);
  }

  if (reasons.length > 0) refuse(variableName, mask(url), reasons);
}

export default function setup(): void {
  const url = process.env.TEST_DATABASE_URL;

  // Nothing below this line may run until the rail has held.
  assertDisposableTestDatabase(url);

  // `db push` rather than `migrate deploy`: faster, and a tmpfs database recreated on every
  // `docker compose up` has no migration history worth preserving.
  // --accept-data-loss keeps it non-interactive; it is safe *because* of the assertion above
  // and would be indefensible without it.
  execSync("pnpm exec prisma db push --skip-generate --accept-data-loss", {
    stdio: "inherit",
    // DIRECT_URL too: prisma/schema.prisma declares `directUrl`, and the Prisma CLI validates
    // every referenced env var at startup — without it this dies with "Environment variable
    // not found: DIRECT_URL" and reads like a connection failure.
    //
    // Both are set EXPLICITLY here rather than left to the CLI's own dotenv loading. Prisma
    // auto-loads `.env`, which on a developer machine names shared_docs_dev; explicit values
    // in `env` win, because dotenv never overwrites a variable that is already set.
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
  });
}
