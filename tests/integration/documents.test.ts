// tests/integration/documents.test.ts
//
// specs/06-test-plan.md §5.7 cases 1–8 and 14.
// P0: 1, 2, 3, 4, 5, 6, 14.  P1: 7, 8.
//
// Every assertion here is on `status` and `error.code`. Never `error.message` — messages are
// UI copy and will be reworded (§5.6).

import { describe, expect, it } from "vitest";
import {
  DELETE as deleteDocument,
  GET as getDocument,
  PATCH as patchDocument,
} from "@/app/api/documents/[id]/route";
import { GET as listDocuments } from "@/app/api/documents/route";
import { prisma } from "@/lib/db";
import type { DocumentDetail, ListDocumentsResponse, PatchDocumentResponse } from "@/lib/api-types";
import { DOCS, NONEXISTENT_DOC_ID, USERS, documentRow, updatedAtOf } from "./fixtures";
import { authedRequest, ctx, read, type ErrorBody } from "./helpers/request";

const NEW_CONTENT = {
  type: "doc" as const,
  content: [
    { type: "paragraph", content: [{ type: "text", text: "edited by the test" }] },
  ],
};

describe("GET /api/documents/:id", () => {
  // Case 1
  it("gives the owner OWNER and the full share list", async () => {
    const req = await authedRequest(USERS.alice, `/api/documents/${DOCS.d1}`);
    const { status, body } = await read<DocumentDetail>(
      await getDocument(req, ctx({ id: DOCS.d1 })),
    );

    expect(status).toBe(200);
    expect(body.myRole).toBe("OWNER");
    expect(body.shares).not.toBeNull();
    expect(body.shares).toHaveLength(2);
    expect(body.shares?.map((s) => s.userId).sort()).toEqual([USERS.bob.id, USERS.carol.id]);
  });

  // Case 2
  it("hides the share list from a viewer as null, not [] and not undefined", async () => {
    const req = await authedRequest(USERS.carol, `/api/documents/${DOCS.d1}`);
    const { status, body } = await read<DocumentDetail>(
      await getDocument(req, ctx({ id: DOCS.d1 })),
    );

    expect(status).toBe(200);
    expect(body.myRole).toBe("VIEWER");

    // The distinction is the point: a viewer must be able to tell "not allowed to see this"
    // from "there are none". `null` survives JSON.stringify; `undefined` does not, so
    // toBeUndefined() would fail against a correct implementation (02-api-contract.md §7.7).
    expect(body.shares).toBeNull();
    expect("shares" in body).toBe(true);
  });

  // Case 3 — P0. The anti-enumeration property.
  it("404s for a user with no access, byte-identically to a document that does not exist", async () => {
    // d2 exists and belongs to alice. Carol has no share row on it.
    const noAccessReq = await authedRequest(USERS.carol, `/api/documents/${DOCS.d2}`);
    const noAccess = await read<ErrorBody>(await getDocument(noAccessReq, ctx({ id: DOCS.d2 })));

    // This id has never existed.
    const missingReq = await authedRequest(USERS.carol, `/api/documents/${NONEXISTENT_DOC_ID}`);
    const missing = await read<ErrorBody>(
      await getDocument(missingReq, ctx({ id: NONEXISTENT_DOC_ID })),
    );

    expect(noAccess.status).toBe(404);
    expect(noAccess.body.error.code).toBe("NOT_FOUND");
    // 403 would confirm d2 exists. Foundation §6 rule 1.
    expect(noAccess.status).not.toBe(403);

    // THIS equality IS the anti-enumeration property. Two responses that differ by so much as
    // a word would let Carol enumerate Alice's document ids by diffing them. Status and body
    // must be indistinguishable, so they are compared to each other rather than to a literal.
    expect(missing.status).toBe(noAccess.status);
    expect(noAccess.body).toEqual(missing.body);
  });

  // Case 3, restated from the other side: d2 really is there.
  it("still serves d2 to its owner, so the 404 above is about access and not existence", async () => {
    const req = await authedRequest(USERS.alice, `/api/documents/${DOCS.d2}`);
    const { status, body } = await read<DocumentDetail>(
      await getDocument(req, ctx({ id: DOCS.d2 })),
    );

    expect(status).toBe(200);
    expect(body.myRole).toBe("OWNER");
  });
});

describe("PATCH /api/documents/:id", () => {
  // Case 4 — P0
  it("403s for a VIEWER and leaves the row provably unchanged", async () => {
    const before = await documentRow(DOCS.d1);

    const req = await authedRequest(USERS.carol, `/api/documents/${DOCS.d1}`, {
      method: "PATCH",
      json: {
        content: NEW_CONTENT,
        lastKnownUpdatedAt: before.updatedAt.toISOString(),
      },
    });
    const { status, body } = await read<ErrorBody>(
      await patchDocument(req, ctx({ id: DOCS.d1 })),
    );

    expect(status).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN");

    // "Rejected" is not the claim. "Rejected and wrote nothing" is. `updatedAt` is @updatedAt,
    // so any write at all — even one that stored identical content — would move it.
    const after = await documentRow(DOCS.d1);
    expect(after.content).toEqual(before.content);
    expect(after.title).toBe(before.title);
    expect(after.updatedAt.toISOString()).toBe(before.updatedAt.toISOString());
  });

  // Case 5 — P0
  it("200s for an EDITOR and actually persists the content", async () => {
    const before = await documentRow(DOCS.d1);

    const req = await authedRequest(USERS.bob, `/api/documents/${DOCS.d1}`, {
      method: "PATCH",
      json: { content: NEW_CONTENT, lastKnownUpdatedAt: await updatedAtOf(DOCS.d1) },
    });
    const { status, body } = await read<PatchDocumentResponse>(
      await patchDocument(req, ctx({ id: DOCS.d1 })),
    );

    expect(status).toBe(200);

    // Re-read from the database. A 200 proves the handler answered, not that anything landed.
    const after = await documentRow(DOCS.d1);
    expect(after.content).toEqual(NEW_CONTENT);

    // The response's updatedAt is the client's NEW concurrency token, so it has to be the
    // row's real one and it has to have advanced.
    expect(body.updatedAt).toBe(after.updatedAt.toISOString());
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
  });

  // Case 6 — P0. The one conflict case that ships (DECISIONS.md D002).
  it("409s on a stale lastKnownUpdatedAt, even for the owner, and hands back the current token", async () => {
    const before = await documentRow(DOCS.d1);
    const stale = new Date(before.updatedAt.getTime() - 3_600_000).toISOString();

    const req = await authedRequest(USERS.alice, `/api/documents/${DOCS.d1}`, {
      method: "PATCH",
      json: { content: NEW_CONTENT, lastKnownUpdatedAt: stale },
    });
    const { status, body } = await read<ErrorBody>(
      await patchDocument(req, ctx({ id: DOCS.d1 })),
    );

    expect(status).toBe(409);
    expect(body.error.code).toBe("CONFLICT");

    // The inline conflict banner's Reload re-seeds the editor from exactly this value. If it
    // were absent or wrong, the banner would be a dead end (foundation §7, risk R4).
    expect(body.error.details.currentUpdatedAt).toBe(before.updatedAt.toISOString());
    expect(body.error.details.lastKnownUpdatedAt).toBe(stale);

    // Last write wins, but never SILENTLY: the stale write did not land.
    const after = await documentRow(DOCS.d1);
    expect(after.content).toEqual(before.content);
    expect(after.updatedAt.toISOString()).toBe(before.updatedAt.toISOString());
  });

  // Case 7 — P1. The shape guard is wired into the route, not merely unit-tested.
  it("400s on content that is not a ProseMirror doc node", async () => {
    const before = await documentRow(DOCS.d1);

    const req = await authedRequest(USERS.alice, `/api/documents/${DOCS.d1}`, {
      method: "PATCH",
      json: {
        content: { type: "paragraph" },
        lastKnownUpdatedAt: before.updatedAt.toISOString(),
      },
    });
    const { status, body } = await read<ErrorBody>(
      await patchDocument(req, ctx({ id: DOCS.d1 })),
    );

    expect(status).toBe(400);
    // VALIDATION_FAILED, not VALIDATION_ERROR (§5.6).
    expect(body.error.code).toBe("VALIDATION_FAILED");

    const after = await documentRow(DOCS.d1);
    expect(after.updatedAt.toISOString()).toBe(before.updatedAt.toISOString());
  });
});

describe("DELETE /api/documents/:id", () => {
  // Case 8 — P1. EDITOR is not owner.
  it("403s for an EDITOR and leaves the document in place", async () => {
    const req = await authedRequest(USERS.bob, `/api/documents/${DOCS.d1}`, {
      method: "DELETE",
    });
    const { status, body } = await read<ErrorBody>(
      await deleteDocument(req, ctx({ id: DOCS.d1 })),
    );

    expect(status).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN");
    expect(await prisma.document.count({ where: { id: DOCS.d1 } })).toBe(1);
  });
});

describe("GET /api/documents", () => {
  // Case 14 — P0
  it("separates bob's own documents from those shared with him, and leaks neither", async () => {
    const req = await authedRequest(USERS.bob, "/api/documents");
    const { status, body } = await read<ListDocumentsResponse>(await listDocuments(req));

    expect(status).toBe(200);
    expect(body.owned.map((d) => d.id)).toEqual([DOCS.d3]);
    expect(body.sharedWithMe.map((d) => d.id)).toEqual([DOCS.d1]);
    expect(body.owned[0]?.myRole).toBe("OWNER");
    expect(body.sharedWithMe[0]?.myRole).toBe("EDITOR");

    // d2 is alice's, shared with nobody. It must appear in NEITHER array — the third
    // possibility the two positive assertions above cannot rule out on their own.
    const allIds = [...body.owned, ...body.sharedWithMe].map((d) => d.id);
    expect(allIds).not.toContain(DOCS.d2);
    expect(allIds).toHaveLength(2);
  });

  it("gives alice both of her documents and neither of bob's", async () => {
    const req = await authedRequest(USERS.alice, "/api/documents");
    const { status, body } = await read<ListDocumentsResponse>(await listDocuments(req));

    expect(status).toBe(200);
    // Ordered by updatedAt desc: d1 was seeded more recently than d2.
    expect(body.owned.map((d) => d.id)).toEqual([DOCS.d1, DOCS.d2]);
    expect(body.sharedWithMe).toEqual([]);
  });
});
