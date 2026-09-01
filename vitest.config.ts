import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Loaded here, in the Vite config process, so TEST_DATABASE_URL is available when the
// integration project is constructed below. Never loaded inside a test file.
// process.loadEnvFile is Node 22's built-in dotenv (see the note at the bottom of this
// file); the try/catch is what keeps the `unit` project runnable with no .env.test at all.
try {
  process.loadEnvFile(".env.test");
} catch {
  // No .env.test: fine for `--project unit`, and the integration global-setup reports the
  // missing URL far more usefully than a config-time crash would.
}

// Mirrors tsconfig.json's "@/*" path. The trailing slash matters: a bare "@" prefix would
// also rewrite "@prisma/client" into a filesystem path.
const alias = [
  {
    find: /^@\//,
    replacement: fileURLToPath(new URL("./", import.meta.url)),
  },
];

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        // ── unit ─────────────────────────────────────────────────────────────
        // Pure functions only. No DB, no network, no filesystem, no env vars.
        // MUST pass on a clean clone after `pnpm install` and nothing else.
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: ["lib/**/*.test.ts"],
          globals: false,
        },
      },
      {
        // ── integration ──────────────────────────────────────────────────────
        // Real Postgres in Docker. Route handlers invoked directly.
        resolve: { alias },
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          globals: false,
          globalSetup: ["./tests/integration/global-setup.ts"],
          setupFiles: ["./tests/integration/setup.ts"],
          // One shared database => one worker. Parallel files would truncate
          // each other's fixtures mid-test. This is not a perf mistake, it is
          // the correctness constraint. Vitest 4 dropped poolOptions/singleFork;
          // fileParallelism: false is the replacement and already pins maxWorkers to 1.
          pool: "forks",
          fileParallelism: false,
          maxWorkers: 1,
          hookTimeout: 30_000,
          testTimeout: 15_000,
          env: {
            // Prisma reads DATABASE_URL; point it at the throwaway test DB.
            DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
            // Prisma validates EVERY env var the schema references at CLI startup, and
            // schema.prisma declares directUrl. Without this, `prisma db push` in
            // global-setup dies with "Environment variable not found: DIRECT_URL"
            // before a single assertion runs.
            DIRECT_URL: process.env.TEST_DATABASE_URL ?? "",
            // lib/env.ts throws at module evaluation without AUTH_SECRET, and it must be
            // at least 32 characters.
            AUTH_SECRET: process.env.AUTH_SECRET ?? "",
          },
        },
      },
    ],
  },
});

// Two substitutions against 06-test-plan.md §2.1, both forced by the frozen package.json:
// `dotenv` and `vite-tsconfig-paths` are specced there but are not installed, and this task
// may not add dependencies. process.loadEnvFile (Node >= 20.12) replaces the first and the
// explicit `resolve.alias` above replaces the second, with no behavioural difference.
