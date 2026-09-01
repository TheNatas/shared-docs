import { compare, hash } from "bcryptjs";

/**
 * Pure-JS bcrypt at cost 10. Native `bcrypt` would need node-gyp and a prebuilt binary
 * matching the Vercel build image; cost 12 in pure JS lands at ~450 ms on a cold serverless
 * invocation, which reads as a broken demo (specs/03-auth-and-permissions.md §4.2–§4.3).
 * The seed script hashes through the same helper, so the cost is defined once.
 */
export const BCRYPT_COST = 10;

export function hashPassword(plaintext: string): Promise<string> {
  return hash(plaintext, BCRYPT_COST);
}

export function verifyPassword(
  plaintext: string,
  passwordHash: string,
): Promise<boolean> {
  return compare(plaintext, passwordHash);
}

/**
 * A real cost-10 bcrypt hash of a random UUID nobody kept. The login route compares against
 * it when the email does not exist, so "unknown email" and "wrong password" burn the same CPU
 * time — without it the endpoint answers "does this account exist?" in milliseconds of
 * latency, whatever the response body says.
 *
 * It has to be a genuine hash: `compare` rejects a malformed string immediately and reopens
 * the exact timing channel this closes. Regenerate with:
 *   node -e "import('bcryptjs').then(b => b.hash(require('node:crypto').randomUUID(), 10)).then(console.log)"
 */
export const DUMMY_PASSWORD_HASH =
  "$2b$10$TFcm1sN3gdyHcrWDplszPuGCCFeyEKChzaLnhJ1Hl6ZOC5N.baRBW";
