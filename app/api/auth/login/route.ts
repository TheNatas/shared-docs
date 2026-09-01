import { ApiError, ok, parseJson, withPublic } from "@/lib/api";
import type { LoginResponse } from "@/lib/api-types";
import { prisma } from "@/lib/db";
import { isProduction } from "@/lib/env";
import { DUMMY_PASSWORD_HASH, verifyPassword } from "@/lib/password";
import { loginSchema } from "@/lib/schemas";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  signSessionToken,
} from "@/lib/session-token";

/**
 * `POST /api/auth/login` — 02-api-contract.md §7.1, 03-auth-and-permissions.md §5.1.
 *
 * Node runtime is the Next 16 default, but the export is kept because bcryptjs and Prisma both
 * hard-require it and a silent flip to Edge would fail at request time, not at build time
 * (03 §4.4).
 */
export const runtime = "nodejs";

export const POST = withPublic(async (request) => {
  const { email, password } = await parseJson(request, loginSchema);

  const user = await prisma.user.findUnique({ where: { email } });

  // Exactly one bcrypt comparison runs, whether or not the email exists. Without the dummy
  // hash an unknown email answers in ~1 ms and a wrong password in ~100 ms — an
  // account-existence oracle, however identical the two response bodies are (03 §4.1).
  const valid = await verifyPassword(
    password,
    user?.passwordHash ?? DUMMY_PASSWORD_HASH,
  );

  if (!user || !valid) {
    // One status, one code, one message for both branches. There is deliberately no
    // USER_NOT_FOUND on this endpoint, and the password never reaches `details`.
    throw new ApiError(
      "INVALID_CREDENTIALS",
      "Email or password is incorrect.",
      401,
    );
  }

  const token = await signSessionToken({
    id: user.id,
    email: user.email,
    name: user.name,
  });

  const response = ok<LoginResponse>({
    user: { id: user.id, name: user.name, email: user.email },
  });

  // Written onto the response, not through `createSession()` — that helper goes via
  // next/headers, whose `cookies()` throws outside a request scope, and the integration suite
  // imports this handler and calls it directly with no server running (06-test-plan.md §5.1;
  // 03 §3.2 sanctions "cookie writes live in lib/session.ts *or on a NextResponse*").
  //
  // No `domain`: an omitted domain yields a host-only cookie, which is correct on localhost
  // and on the Vercel alias alike. The name and lifetime come from the same constants the
  // middleware reads — a login that writes one name while middleware reads another looks like
  // a success and then 401s on every following request.
  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return response;
});
