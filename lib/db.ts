import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "warn", "error"]
        : ["error"],
  });

// `next dev` re-evaluates modules on every edit. Without this, each reload builds a new
// client and a new connection pool, and within minutes you exhaust the connection ceiling
// and get errors that look like a database problem but are a dev-server problem.
// Not cached in production: each serverless instance evaluates the module once anyway.
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
