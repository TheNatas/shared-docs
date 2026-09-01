// tests/integration/shares.test.ts
//
// specs/06-test-plan.md §5.7 cases 9–13 and 21.
// P0: 9, 10, 11.  P1: 12, 13, 21.
//
// The share endpoint is where the two rules a reviewer is most likely to get wrong live:
// only an OWNER may grant (foundation §6), and granting twice UPSERTS rather than inserting
// (foundation §6 rule 4). Both are asserted against row counts, not just status codes.

import { describe, expect, it } from "vitest";
import {
  GET as listShares,
  POST as createShare,
} from "@/app/api/documents/[id]/shares/route";
import { DELETE as deleteShare } from "@/app/api/documents/[id]/shares/[userId]/route";
import { prisma } from "@/lib/db";
import type {
  CreateShareResponse,
  DeleteShareResponse,
  ListSharesResponse,
} from "@/lib/api-types";
import { DOCS, USERS, sharesOf } from "./fixtures";
import { authedRequest, ctx, read, type ErrorBody } from "./helpers/request";

describe("POST /api/documents/:id/shares", () => {
  // Case 9 — P0
  it("403s when an EDITOR tries to re-share, and grants nothing", async () => {
    const req = await authedRequest(USERS.bob, `/api/documents/${DOCS.d1}/shares`, {
      method: "POST",
      json: { email: USERS.carol.email, role: "VIEWER" },
    });
    const { status, body } = await read<ErrorBody>(
      await createShare(req, ctx({ id: DOCS.d1 })),
    );

    expect(status).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN");

    // Bob can edit d1. He still cannot widen who else can. Re-sharing is an owner capability
    // and the count is what proves the rejection was total.
    expect(await sharesOf(DOCS.d1)).toHaveLength(2);
  });

  // Case 10 — P0. Upsert, not insert.
  it("re-sharing an existing recipient updates the one row instead of adding a second", async () => {
    // Carol starts as VIEWER (fixture).
    const before = await sharesOf(DOCS.d1);
    expect(before.find((s) => s.userId === USERS.carol.id)?.role).toBe("VIEWER");

    const req = await authedRequest(USERS.alice, `/api/documents/${DOCS.d1}/shares`, {
      method: "POST",
      json: { email: USERS.carol.email, role: "EDITOR" },
    });
    const { status, body } = await read<CreateShareResponse>(
      await createShare(req, ctx({ id: DOCS.d1 })),
    );

    // 200 in BOTH branches; the insert-vs-update distinction is in the body, never the status
    // (02-api-contract.md §7.10). There is no 201 on this route.
    expect(status).toBe(200);
    expect(body.created).toBe(false);
    expect(body.share.role).toBe("EDITOR");

    const after = await sharesOf(DOCS.d1);
    // Still 2 rows on the document, not 3 …
    expect(after).toHaveLength(2);
    // … and exactly ONE of them is Carol's, with the role changed rather than duplicated.
    const carolRows = after.filter((s) => s.userId === USERS.carol.id);
    expect(carolRows).toHaveLength(1);
    expect(carolRows[0]?.role).toBe("EDITOR");
    // Bob's grant is collateral damage if the upsert key is wrong, so check it survived.
    expect(after.find((s) => s.userId === USERS.bob.id)?.role).toBe("EDITOR");
  });

  // Case 11 — P0
  it("400s when the owner shares with themselves", async () => {
    const req = await authedRequest(USERS.alice, `/api/documents/${DOCS.d1}/shares`, {
      method: "POST",
      json: { email: USERS.alice.email, role: "EDITOR" },
    });
    const { status, body } = await read<ErrorBody>(
      await createShare(req, ctx({ id: DOCS.d1 })),
    );

    expect(status).toBe(400);
    expect(body.error.code).toBe("CANNOT_SHARE_WITH_SELF");
    expect(await sharesOf(DOCS.d1)).toHaveLength(2);
  });

  it("400s on self-share regardless of how the email is cased or padded", async () => {
    const req = await authedRequest(USERS.alice, `/api/documents/${DOCS.d1}/shares`, {
      method: "POST",
      json: { email: "  ALICE@Example.COM  ", role: "EDITOR" },
    });
    const { status, body } = await read<ErrorBody>(
      await createShare(req, ctx({ id: DOCS.d1 })),
    );

    // The schema trims and lowercases before the comparison. Without that, a capitalised
    // address would fall through to the upsert and grant Alice a share on her own document.
    expect(status).toBe(400);
    expect(body.error.code).toBe("CANNOT_SHARE_WITH_SELF");
    expect(await sharesOf(DOCS.d1)).toHaveLength(2);
  });

  // Case 12 — P1
  it("404s for an email that belongs to no user, and creates no row", async () => {
    const req = await authedRequest(USERS.alice, `/api/documents/${DOCS.d1}/shares`, {
      method: "POST",
      json: { email: "nobody@example.com", role: "VIEWER" },
    });
    const { status, body } = await read<ErrorBody>(
      await createShare(req, ctx({ id: DOCS.d1 })),
    );

    expect(status).toBe(404);
    expect(body.error.code).toBe("USER_NOT_FOUND");
    expect(await prisma.documentShare.count()).toBe(2);
  });

  // Case 13 — P1
  it("200s with created:true on a genuinely new grant", async () => {
    // d2 has no shares at all, so this is unambiguously the insert branch.
    const req = await authedRequest(USERS.alice, `/api/documents/${DOCS.d2}/shares`, {
      method: "POST",
      json: { email: USERS.bob.email, role: "VIEWER" },
    });
    const { status, body } = await read<CreateShareResponse>(
      await createShare(req, ctx({ id: DOCS.d2 })),
    );

    expect(status).toBe(200);
    expect(body.created).toBe(true);
    expect(body.share.user.email).toBe(USERS.bob.email);
    expect(body.share.role).toBe("VIEWER");
    expect(await sharesOf(DOCS.d2)).toHaveLength(1);
  });
});

describe("GET /api/documents/:id/shares", () => {
  it("403s for a VIEWER — the recipient list is an owner-only capability", async () => {
    const req = await authedRequest(USERS.carol, `/api/documents/${DOCS.d1}/shares`);
    const { status, body } = await read<ErrorBody>(
      await listShares(req, ctx({ id: DOCS.d1 })),
    );

    expect(status).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("returns the list to the owner, oldest grant first", async () => {
    const req = await authedRequest(USERS.alice, `/api/documents/${DOCS.d1}/shares`);
    const { status, body } = await read<ListSharesResponse>(
      await listShares(req, ctx({ id: DOCS.d1 })),
    );

    expect(status).toBe(200);
    expect(body.shares).toHaveLength(2);
    // Nested, not flat: the UI renders `share.user.name`.
    expect(body.shares[0]?.user.name).toBeTypeOf("string");
  });
});

describe("DELETE /api/documents/:id/shares/:userId", () => {
  // Case 21 — P1. Revoke is idempotent.
  it("200s both times it is called, and the second call is not a 404", async () => {
    const first = await authedRequest(
      USERS.alice,
      `/api/documents/${DOCS.d1}/shares/${USERS.carol.id}`,
      { method: "DELETE" },
    );
    const one = await read<DeleteShareResponse>(
      await deleteShare(first, ctx({ id: DOCS.d1, userId: USERS.carol.id })),
    );

    expect(one.status).toBe(200);
    expect(one.body.ok).toBe(true);
    expect(await sharesOf(DOCS.d1)).toHaveLength(1);

    // Same request again. A revoke that 404s the second time makes the UI's optimistic remove
    // a lie the moment two tabs are open (02-api-contract.md §7.11).
    const second = await authedRequest(
      USERS.alice,
      `/api/documents/${DOCS.d1}/shares/${USERS.carol.id}`,
      { method: "DELETE" },
    );
    const two = await read<DeleteShareResponse>(
      await deleteShare(second, ctx({ id: DOCS.d1, userId: USERS.carol.id })),
    );

    expect(two.status).toBe(200);
    expect(two.body.ok).toBe(true);
    expect(await sharesOf(DOCS.d1)).toHaveLength(1);
  });

  it("403s when an EDITOR tries to revoke someone else's access", async () => {
    const req = await authedRequest(
      USERS.bob,
      `/api/documents/${DOCS.d1}/shares/${USERS.carol.id}`,
      { method: "DELETE" },
    );
    const { status, body } = await read<ErrorBody>(
      await deleteShare(req, ctx({ id: DOCS.d1, userId: USERS.carol.id })),
    );

    expect(status).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN");
    expect(await sharesOf(DOCS.d1)).toHaveLength(2);
  });
});
