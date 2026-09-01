/**
 * Wire types shared by route handlers, Server Components and the browser client.
 *
 * PARTIAL — T01 created this file in W1 so that lib/permissions.ts and lib/session.ts could
 * compile before the API layer exists (see specs/DECISIONS.md D011). **T07 EXTENDS this file**
 * with the DTOs from 02-api-contract.md §7 (Role, ShareRole, UserSummary, ProseMirrorDoc,
 * DocumentSummary, ShareEntry, DocumentDetail and the request/response pairs).
 * T07 must NOT recreate it from scratch — the union below is already the canonical one.
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
