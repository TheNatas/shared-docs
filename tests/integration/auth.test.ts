// tests/integration/auth.test.ts
//
// specs/06-test-plan.md §5.7 cases 18–20 and 22.
// P0: 18, 19.  P1: 20, 22.
//
// Case 19 is the one that catches the mistake most likely to actually happen at hour six:
// adding a route and forgetting the guard. It is table-driven for exactly that reason — a new
// handler is one row, and a handler with no row is a visible omission rather than an invisible
// one.

import { describe, expect, it } from "vitest";
import { GET as getDocument, PATCH as patchDocument } from "@/app/api/documents/[id]/route";
import { GET as listDocuments } from "@/app/api/documents/route";
import { POST as createShare } from "@/app/api/documents/[id]/shares/route";
import { POST as importDocument } from "@/app/api/documents/import/route";
import { GET as getMe } from "@/app/api/auth/me/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { SESSION_COOKIE, getSessionFromRequest } from "@/lib/session-token";
import type { LoginResponse, MeResponse } from "@/lib/api-types";
import { DOCS, FIXTURE_PASSWORD, USERS } from "./fixtures";
import {
  authedRequest,
  ctx,
  fileForm,
  read,
  type ErrorBody,
} from "./helpers/request";

/**
 * Case 19 — every guarded handler, driven from one table.
 *
 * The request each row builds is otherwise VALID: a real body, a real multipart part, real
 * params. Only the cookie is missing. That matters — a 401 produced because the body was junk
 * would prove nothing about the guard, and a table of malformed requests is the easiest way to
 * write four tests that all pass for the wrong reason.
 */
const GUARDED_ROUTES = [
  {
    name: "GET /api/documents",
    call: async () => listDocuments(await authedRequest(null, "/api/documents")),
  },
  {
    name: "GET /api/documents/:id",
    call: async () =>
      getDocument(
        await authedRequest(null, `/api/documents/${DOCS.d1}`),
        ctx({ id: DOCS.d1 }),
      ),
  },
  {
    name: "PATCH /api/documents/:id",
    call: async () =>
      patchDocument(
        await authedRequest(null, `/api/documents/${DOCS.d1}`, {
          method: "PATCH",
          json: {
            content: { type: "doc", content: [{ type: "paragraph" }] },
            lastKnownUpdatedAt: new Date().toISOString(),
          },
        }),
        ctx({ id: DOCS.d1 }),
      ),
  },
  {
    name: "POST /api/documents/:id/shares",
    call: async () =>
      createShare(
        await authedRequest(null, `/api/documents/${DOCS.d1}/shares`, {
          method: "POST",
          json: { email: USERS.carol.email, role: "VIEWER" },
        }),
        ctx({ id: DOCS.d1 }),
      ),
  },
  {
    name: "POST /api/documents/import",
    call: async () =>
      importDocument(
        await authedRequest(null, "/api/documents/import", {
          method: "POST",
          formData: fileForm("notes.md", "text/markdown", "# hello"),
        }),
      ),
  },
  {
    name: "GET /api/auth/me",
    call: async () => getMe(await authedRequest(null, "/api/auth/me")),
  },
] as const;

describe("authentication guard", () => {
  // Cases 18 and 19
  it.each(GUARDED_ROUTES)("401s $name with no session cookie", async ({ call }) => {
    const { status, body } = await read<ErrorBody>(await call());

    expect(status).toBe(401);
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });

  // Case 20 — P1
  it("401s a cookie whose signature has been tampered with", async () => {
    const req = await authedRequest(USERS.alice, `/api/documents/${DOCS.d1}`, {
      badSignature: true,
    });
    const { status, body } = await read<ErrorBody>(
      await getDocument(req, ctx({ id: DOCS.d1 })),
    );

    // A forged session is not a session. The same request WITHOUT badSignature is a 200 in
    // documents.test.ts, so the only variable between the two is the signature.
    expect(status).toBe(401);
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });

  it("401s a cookie that is not a JWT at all", async () => {
    const req = await authedRequest(null, `/api/documents/${DOCS.d1}`);
    req.headers.set("cookie", `${SESSION_COOKIE}=not-a-token`);
    const { status, body } = await read<ErrorBody>(
      await getDocument(req, ctx({ id: DOCS.d1 })),
    );

    expect(status).toBe(401);
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });
});

describe("POST /api/auth/logout", () => {
  // Case 22 — P1
  it("200s with no cookie: logout is public and idempotent", async () => {
    const req = await authedRequest(null, "/api/auth/logout", { method: "POST" });
    const res = await logout(req);
    const { status, body } = await read<{ ok: boolean }>(res);

    // Never a 401. A logout that 401s leaves a user with a bad cookie unable to clear it.
    expect(status).toBe(200);
    expect(body.ok).toBe(true);

    // It still clears the cookie, so calling it defensively is always safe.
    expect(res.headers.get("set-cookie")).toContain(`${SESSION_COOKIE}=`);
  });
});

describe("POST /api/auth/login", () => {
  /**
   * Not in §5.7's table, and worth the twenty milliseconds anyway: it is the assertion that
   * this whole directory is not testing a fiction.
   *
   * Every other test here authenticates with a cookie minted by `helpers/request.ts`. If that
   * helper and the login route ever produced different tokens, all of them would keep passing
   * while the real application was broken. This test closes the loop — it takes the cookie the
   * PRODUCTION login route sets and feeds it back through the PRODUCTION session reader.
   */
  it("mints a cookie that the session reader accepts, closing the loop on the helper", async () => {
    const req = await authedRequest(null, "/api/auth/login", {
      method: "POST",
      json: { email: USERS.alice.email, password: FIXTURE_PASSWORD },
    });
    const res = await login(req);
    const { status, body } = await read<LoginResponse>(res);

    expect(status).toBe(200);
    expect(body.user.id).toBe(USERS.alice.id);

    const setCookie = res.headers.get("set-cookie") ?? "";
    const token = setCookie.split(";")[0]?.slice(SESSION_COOKIE.length + 1) ?? "";
    expect(token.length).toBeGreaterThan(0);

    const carrier = new Request("http://localhost:3000/api/auth/me", {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    });
    expect(await getSessionFromRequest(carrier)).toEqual({
      id: USERS.alice.id,
      email: USERS.alice.email,
      name: USERS.alice.name,
    });
  });

  it("401s a wrong password with INVALID_CREDENTIALS", async () => {
    const req = await authedRequest(null, "/api/auth/login", {
      method: "POST",
      json: { email: USERS.alice.email, password: "not-the-password" },
    });
    const { status, body } = await read<ErrorBody>(await login(req));

    expect(status).toBe(401);
    expect(body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("gives an unknown email the SAME code as a wrong password", async () => {
    const req = await authedRequest(null, "/api/auth/login", {
      method: "POST",
      json: { email: "nobody@example.com", password: FIXTURE_PASSWORD },
    });
    const { status, body } = await read<ErrorBody>(await login(req));

    // "Unknown email" and "wrong password" are never distinguished — otherwise the endpoint
    // answers "does this account exist?" whatever the copy says.
    expect(status).toBe(401);
    expect(body.error.code).toBe("INVALID_CREDENTIALS");
  });
});

describe("GET /api/auth/me", () => {
  it("answers from the verified token, with no database round trip", async () => {
    const req = await authedRequest(USERS.carol, "/api/auth/me");
    const { status, body } = await read<MeResponse>(await getMe(req));

    expect(status).toBe(200);
    expect(body.user).toEqual({
      id: USERS.carol.id,
      name: USERS.carol.name,
      email: USERS.carol.email,
    });
  });
});
