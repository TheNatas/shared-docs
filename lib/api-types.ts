/**
 * Wire types shared by route handlers, Server Components and the browser client.
 * 02-api-contract.md §2, §3 and §7. There is no lib/types.ts — a second copy of a DTO in the
 * UI layer is how `share.name` ends up rendering `undefined` against a wire shape of
 * `share.user.name` (04-ui-spec.md §1.1).
 *
 * This file is type-only: it imports no runtime value and emits no JavaScript, which is what
 * lets the browser bundle and the Prisma-bound server share one vocabulary.
 *
 * History — T01 created it in W1 so that lib/permissions.ts and lib/session.ts could compile
 * before the API layer existed (specs/DECISIONS.md D011). T07 then EXTENDED it with the DTOs
 * and the request/response pairs below. The ApiErrorCode union was canonical from the start
 * and was not touched.
 */

/** The complete, closed set of machine-readable error codes. 02-api-contract.md §3. */
export type ApiErrorCode =
  // 400
  | "VALIDATION_FAILED" // body/query failed Zod, or was not valid JSON
  | "FILE_MISSING" // multipart upload with no usable `file` part, or a 0-byte file
  | "CANNOT_SHARE_WITH_SELF" // owner tried to share a document with themselves
  // 401
  | "UNAUTHENTICATED" // no session cookie, or it failed jose verification
  | "INVALID_CREDENTIALS" // login: unknown email OR wrong password (never distinguished)
  // 403
  | "FORBIDDEN" // caller can see the document but lacks this capability
  // 404
  | "NOT_FOUND" // document absent, or caller's access is NONE
  | "USER_NOT_FOUND" // share target email matches no seeded user
  | "SHARE_NOT_FOUND" // no share row for (documentId, userId)
  // 409
  | "CONFLICT" // lastKnownUpdatedAt did not match the row
  // 413
  | "FILE_TOO_LARGE" // uploaded file over MAX_FILE_BYTES
  | "CONTENT_TOO_LARGE" // serialised PM content over MAX_CONTENT_BYTES
  // 415
  | "UNSUPPORTED_FILE_TYPE" // upload extension not in {.md, .txt, .docx}
  // 422
  | "PARSE_FAILED" // file accepted but not convertible; details: { reason: string }
  // 500
  | "INTERNAL_ERROR"; // anything unhandled; details are never leaked

/** The one error envelope. Every non-2xx response in the app has exactly this shape. */
export type ApiErrorBody = {
  error: {
    code: ApiErrorCode;
    message: string;
    /** Present only where 02-api-contract.md says so. Shape is per-code. */
    details?: unknown;
  };
};

// ---------------------------------------------------------------------------
// 3. Shared DTOs (02-api-contract.md §3)
//
// These are NOT Prisma models. `passwordHash` never leaves the server, and list endpoints
// never ship `content`.
// ---------------------------------------------------------------------------

/**
 * Role of the *calling* user on a document. Superset of Prisma's ShareRole.
 *
 * Structurally identical to `MyRole` in lib/permissions.ts, which derives it from `ROLES`.
 * The permission module owns the *decision*; this module owns the *wire word*. Either import
 * satisfies the other.
 */
export type MyRole = "OWNER" | "EDITOR" | "VIEWER";

/**
 * 10-task-graph.md's T07 DoD calls this type `Role`; 02-api-contract.md §3 and 04-ui-spec.md
 * §1.1 both call it `MyRole` ("the types the UI once named locally map as: … `Role` → `MyRole`").
 * `MyRole` is canonical. This alias exists only so an import written against the task-graph
 * spelling still compiles. Prefer `MyRole` in new code.
 */
export type Role = MyRole;

/** Role that can be *granted*. Mirrors the Prisma enum exactly. `OWNER` is not grantable. */
export type ShareRole = "VIEWER" | "EDITOR";

/** Access resolution result, including the negative case. See 03-auth-and-permissions.md. */
export type AccessRole = MyRole | "NONE";

/** The only user shape ever sent to a client. No passwordHash, no createdAt. */
export type UserSummary = {
  id: string;
  name: string;
  email: string;
};

/**
 * Loose ProseMirror document node. Structural validation only — the runtime guard is
 * `documentContentSchema` in lib/documents/content.ts, and it asserts the root shape, not the
 * node vocabulary (02-api-contract.md §3.1).
 */
export type ProseMirrorDoc = {
  type: "doc";
  content?: unknown[];
  [k: string]: unknown;
};

/** Dashboard row. Deliberately has NO `content` — the list endpoint stays small. */
export type DocumentSummary = {
  id: string;
  title: string;
  owner: UserSummary;
  myRole: MyRole;
  sourceFilename: string | null;
  /**
   * `_count.shares` — same query, no second round trip. **0 on rows shared WITH you**, because
   * `viewShares` is an OWNER-only capability (00-foundation.md §6) and the size of a recipient
   * list is part of what that capability protects.
   *
   * The dashboard renders "Shared with N people", one of the four signals C11 is graded on
   * (04-ui-spec.md §5.2).
   */
  shareCount: number;
  /** ISO 8601 UTC with milliseconds. This is the optimistic-concurrency token (§6). */
  updatedAt: string;
};

/** A single share row. NESTED, not flat: a UI row renders `share.user.name`. */
export type ShareEntry = {
  userId: string;
  user: UserSummary;
  role: ShareRole;
  /** ISO — DocumentShare.createdAt. */
  grantedAt: string;
};

/**
 * Editor payload. `shares` is non-null ONLY when `myRole === 'OWNER'` — `null`, never `[]`,
 * so an editor can tell "I am not allowed to see this" from "there are none".
 */
export type DocumentDetail = DocumentSummary & {
  content: ProseMirrorDoc;
  shares: ShareEntry[] | null;
};

// ---------------------------------------------------------------------------
// 3a. Error `details` payloads (02-api-contract.md §2, §6.3, §8)
// ---------------------------------------------------------------------------

/** `details` on a 409 CONFLICT. Both values are ISO instants. */
export type ConflictDetails = {
  currentUpdatedAt: string;
  lastKnownUpdatedAt: string;
};

/**
 * `details` on a 400 VALIDATION_FAILED — the output of `z.flattenError(err)`, unreshaped.
 * `fieldErrors` is keyed by `issue.path[0]`, so nested issues collapse under their top-level
 * field name.
 */
export type ZodFlattened = {
  formErrors: string[];
  fieldErrors: Record<string, string[] | undefined>;
};

/** The discriminator carried by a 422 PARSE_FAILED (02-api-contract.md §2). */
export type ParseFailedReason =
  | "not-text"
  | "corrupt-docx"
  | "empty-result"
  | "unsupported-content";

/** `details` on a 422 PARSE_FAILED. */
export type ParseFailedDetails = { reason: ParseFailedReason };

// ---------------------------------------------------------------------------
// 7. Per-route response types (02-api-contract.md §7, in route order)
// ---------------------------------------------------------------------------

/** 7.1 `POST /api/auth/login` — 200. */
export type LoginResponse = { user: UserSummary };

/** 7.2 `POST /api/auth/logout` — 200, always. Idempotent, never 401. */
export type LogoutResponse = { ok: true };

/** 7.3 `GET /api/auth/me` — 200. Served from the verified JWT claims; no DB round trip. */
export type MeResponse = { user: UserSummary };

/**
 * 7.4 `GET /api/documents` — 200. Both arrays sorted by `updatedAt` descending; a document
 * appears in exactly one of them.
 */
export type ListDocumentsResponse = {
  /** `myRole` is always 'OWNER'. */
  owned: DocumentSummary[];
  /** `myRole` is 'EDITOR' | 'VIEWER'. */
  sharedWithMe: DocumentSummary[];
};

/** 7.5 `POST /api/documents` — 201. A superset of `{ id }`: the dashboard row for free. */
export type CreateDocumentResponse = DocumentSummary;

/** 7.6 `POST /api/documents/import` — 201. `sourceFilename` is non-null. */
export type ImportDocumentResponse = DocumentSummary;

/** 7.7 `GET /api/documents/:id` — 200. */
export type GetDocumentResponse = DocumentDetail;

/** 7.8 `PATCH /api/documents/:id` — 200. `content` is never echoed back. */
export type PatchDocumentResponse = {
  id: string;
  title: string;
  /** The NEW concurrency token. The client MUST store this (§6.1). */
  updatedAt: string;
};

/** 7.9 `DELETE /api/documents/:id` — 200. Not 204: every response has a JSON body (I1). */
export type DeleteDocumentResponse = { ok: true; id: string };

/** 7.10 `GET /api/documents/:id/shares` — 200. Sorted by `grantedAt` ascending. */
export type ListSharesResponse = { shares: ShareEntry[] };

/**
 * 7.10 `POST /api/documents/:id/shares` — 200 in BOTH branches, never 201.
 * `created: false` means an existing role was changed.
 */
export type CreateShareResponse = { share: ShareEntry; created: boolean };

/** 7.11 `PATCH /api/documents/:id/shares/:userId` — 200. */
export type UpdateShareResponse = { share: ShareEntry };

/** 7.11 `DELETE /api/documents/:id/shares/:userId` — 200, whether it removed one row or zero. */
export type DeleteShareResponse = { ok: true; userId: string };

/** 7.12 `GET /api/users` — 200. Select is literally `{ id, name, email }`. */
export type UserSearchResponse = { users: UserSummary[] };

// ---------------------------------------------------------------------------
// 7a. Request body types
//
// The request *schemas* live in lib/schemas.ts (00-foundation.md §5a: "request Zod schemas
// only"), and their TypeScript shapes are `z.infer` of those schemas — one source of truth.
// They are re-exported here, type-only and therefore fully erased at compile time, so that
// `import type { PatchDocumentInput } from '@/lib/api-types'` also resolves. No zod code
// reaches the browser bundle through this file.
// ---------------------------------------------------------------------------

export type {
  LoginInput,
  CreateDocumentInput,
  PatchDocumentInput,
  ImportMetaInput,
  CreateShareInput,
  UpdateShareInput,
  UserSearchInput,
} from "@/lib/schemas";
