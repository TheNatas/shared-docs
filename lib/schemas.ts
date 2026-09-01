import { z } from "zod";
import { documentContentSchema } from "@/lib/documents/content";

/**
 * Every **request** schema in the app, and nothing else (00-foundation.md §5a).
 *
 * Two rules keep this file honest:
 *
 * 1. **It re-exports nothing.** `documentContentSchema`, `EMPTY_DOC`, `MAX_CONTENT_BYTES` and
 *    `contentByteSize` belong to lib/documents/content.ts; `MAX_FILE_BYTES` and
 *    `ACCEPTED_EXTENSIONS` belong to lib/import/constants.ts. Four modules defining EMPTY_DOC
 *    is how the editor and the importer end up disagreeing about what a document is
 *    (02-api-contract.md §3.1).
 * 2. **Response shapes are not here.** They are types in lib/api-types.ts; we validate what
 *    comes in, not what goes out.
 *
 * Zod 4 (`^4.1`, resolved 4.5.4) per specs/DECISIONS.md D011 — the import is bare `zod`, and
 * `zod/v4` subpath imports are BANNED. Two modules importing the same library by different
 * specifiers is how incompatible schema objects meet. The four Zod 4 spellings used below:
 * `z.email()` (not `z.string().email()`), `z.iso.datetime()` (not `z.string().datetime()`),
 * `z.looseObject()` (in content.ts), and `z.flattenError()` (in lib/api.ts).
 */

/**
 * Ids are **opaque strings** (02-api-contract.md I6). Never `.cuid()`: the seed uses
 * human-readable ids like `seed-doc-roadmap`, so a cuid check would 400 every seeded document.
 * Route handlers take ids from `await params`, so this is for the rare body/query case.
 */
export const idSchema = z.string().min(1).max(64);

/**
 * An email, normalised to trimmed lowercase.
 *
 * **Deviation from 02-api-contract.md §7.1/§7.10, which write `z.email().trim().toLowerCase()`.**
 * That spelling is the wrong way round in Zod 4: a format check declared by `z.email()` belongs
 * to the type itself and runs during the base parse, while `.trim()` is an appended
 * transform — so the format is validated BEFORE the whitespace is removed. Measured:
 *
 *     z.email().trim().toLowerCase()               .parse(" ALICE@Example.com ")  -> REJECT
 *     z.string().trim().toLowerCase().pipe(z.email()).parse(" ALICE@Example.com ")  -> "alice@example.com"
 *
 * A pasted or autofilled address with a trailing space would 400 VALIDATION_FAILED on login and
 * on share-by-email — the exact input the trim exists to absorb. Piping normalises first and
 * validates the normalised value, which is what §7.10 step 1 ("Zod already trimmed +
 * lowercased") assumes has happened. Same `z.infer` (`string`), strictly more inputs accepted,
 * and `grep "z.string().email()"` stays empty.
 */
const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

// ---------------------------------------------------------------------------
// 7.1  POST /api/auth/login
// ---------------------------------------------------------------------------

/**
 * `min(1)`, not `min(8)`. The login form imports THIS schema (04-ui-spec.md §4.2), so a
 * wrong-but-short password reaches the server and produces the 401 the demo is meant to show,
 * instead of a client-side field error that hides it.
 */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

// ---------------------------------------------------------------------------
// 7.5  POST /api/documents
// ---------------------------------------------------------------------------

/** An empty body `{}` is valid; so is no body at all (the handler treats a parse failure as `{}`). */
export const createDocumentSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
});
export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;

// ---------------------------------------------------------------------------
// 7.8  PATCH /api/documents/:id
// ---------------------------------------------------------------------------

/**
 * `lastKnownUpdatedAt` is required on **every** call, including a rename-only one: renames and
 * content saves share one concurrency token (02-api-contract.md §6.1).
 *
 * The size ceiling is deliberately NOT in this schema. A shape failure is 400
 * VALIDATION_FAILED and a size failure is 413 CONTENT_TOO_LARGE, and re-mapping one to the
 * other by matching on a Zod issue message is a string-matching hack. The handler runs
 * `contentByteSize(input.content) > MAX_CONTENT_BYTES` as a separate step after parsing (§7.8).
 *
 * The refinement sets `path: ['title']` on purpose: `z.flattenError` keys by `issue.path[0]`,
 * so a pathless refinement would land in `formErrors` where no field can render it.
 */
export const patchDocumentSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    content: documentContentSchema.optional(),
    lastKnownUpdatedAt: z.iso.datetime(),
  })
  .refine((b) => b.title !== undefined || b.content !== undefined, {
    message: "Provide at least one of `title` or `content`.",
    path: ["title"],
  });
export type PatchDocumentInput = z.infer<typeof patchDocumentSchema>;

// ---------------------------------------------------------------------------
// 7.6  POST /api/documents/import  (multipart — only the metadata is Zod-validated)
// ---------------------------------------------------------------------------

/**
 * There is no schema for the file itself: `FormData` is not JSON. Extension and size are
 * checked against `ACCEPTED_EXTENSIONS` / `MAX_FILE_BYTES` in lib/import/constants.ts, which
 * this file does not import and must not restate.
 */
export const importMetaSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
});
export type ImportMetaInput = z.infer<typeof importMetaSchema>;

// ---------------------------------------------------------------------------
// 7.10 / 7.11  Shares
// ---------------------------------------------------------------------------

/** `'OWNER'` is not grantable — ownership transfer is out of scope (00-foundation.md §4). */
export const createShareSchema = z.object({
  email: emailSchema,
  role: z.enum(["VIEWER", "EDITOR"]),
});
export type CreateShareInput = z.infer<typeof createShareSchema>;

export const updateShareSchema = z.object({
  role: z.enum(["VIEWER", "EDITOR"]),
});
export type UpdateShareInput = z.infer<typeof updateShareSchema>;

// ---------------------------------------------------------------------------
// 7.12  GET /api/users
// ---------------------------------------------------------------------------

/**
 * No minimum length and no `take: 5`. 03-auth-and-permissions.md §12.2 proposed
 * `q.length >= 3`; it was REJECTED (02-api-contract.md, Rulings item 3) because the share
 * picker queries at two characters (04-ui-spec.md §8.2) and would silently return nothing.
 */
export const userSearchSchema = z.object({
  q: z.string().trim().max(100).optional(),
});
export type UserSearchInput = z.infer<typeof userSearchSchema>;
