import { z } from "zod";

/**
 * Fail-fast environment validation. Imported by lib/session-token.ts, so a missing or weak
 * AUTH_SECRET throws at module evaluation: `next dev` and `next build` both die with the
 * message below instead of minting sessions signed with a fallback key. A hardcoded dev
 * default is how a signing key reaches production (specs/03-auth-and-permissions.md §2.2).
 *
 * There is exactly one env module. Whoever needs another variable extends this schema.
 */
const GENERATE_SECRET =
  'Generate one with: node -e "console.log(require(\'node:crypto\').randomBytes(48).toString(\'base64url\'))"';

const EnvSchema = z.object({
  AUTH_SECRET: z
    .string({ error: `AUTH_SECRET is required. ${GENERATE_SECRET}` })
    .min(
      32,
      `AUTH_SECRET must be at least 32 characters. ${GENERATE_SECRET}`,
    ),
  DATABASE_URL: z
    .string({ error: "DATABASE_URL is required" })
    .min(1, "DATABASE_URL is required"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(
    `Invalid environment configuration:\n${issues}\n\nSee .env.example.`,
  );
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === "production";
