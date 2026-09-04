/**
 * Route contracts for `/api/v1/documents` — GET (paginated list) + POST
 * (upload metadata) + DELETE (soft-delete).
 *
 * Plan A1 auto-drain. All three methods migrated from the pre-migration
 * `withErrorHandler` handlers in `./route.ts`.
 *
 * GET auth surface (preserved verbatim):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, query.communityId)
 *     → requireCommunityMembership
 *     → paginateAccessibleDocuments({ filter, categoryId, cursor, pageSize })
 *
 * GET inputs: `communityId` (required) and `categoryId` (optional) are now
 * Zod-validated `z.coerce.number().int().positive()` in the contract. The
 * pre-migration handler validated them by hand with bespoke messages
 * ("communityId query parameter is required and must be a positive integer"
 * / "categoryId query parameter must be a positive integer"); those become
 * the canonical 400 `VALIDATION_ERROR` — status unchanged (400 either way).
 * `cursor` / `pageSize` follow the canonical paginated shape.
 *
 * GET response: `paginated: true` with `z.unknown()` (loose). Document rows
 * carry `Date` fields (`createdAt`, etc.); a tight per-item schema would
 * `safeParse`-fail before `NextResponse.json` ISO-serializes them. Wire
 * envelope is the canonical double-wrap `{ data: { data, pagination } }`.
 *
 * POST auth surface (preserved verbatim — note the order):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → validateUploadFilePath (sync)
 *     → assertNotDemoGrace (ASYNC — awaited)
 *     → requireCommunityMembership
 *     → requirePermission(membership, 'documents', 'write') (sync)
 *     → requireActiveSubscriptionForMutation (ASYNC — awaited)
 *     → createUploadedDocument(...)
 *
 * POST `description` is `?? null`-coalesced (service signature wants
 * `string | null`). POST response is loose `z.unknown()` — `result.document`
 * is a raw Drizzle row (`Record<string, unknown>`) with Date fields, and the
 * handler additionally spreads an optional `warnings` array onto the envelope
 * when non-empty. Wire shape stays byte-identical:
 *   `{ data: <row>, warnings?: [...] }`.
 *
 * DELETE auth surface (mutating, so demo-grace first):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, query.communityId)
 *     → assertNotDemoGrace (ASYNC — awaited)
 *     → requireCommunityMembership
 *     → requirePermission(membership, 'documents', 'write') (sync)
 *     → requireActiveSubscriptionForMutation (ASYNC — awaited)
 *     → getDocumentForDeletionAudit → softDeleteDocument → logAuditEvent
 *
 * DELETE inputs `id` + `communityId` are Zod-validated positive ints. DELETE
 * response is a synthesized `{ deleted: true, id }` shape with no Dates, so a
 * tight `z.object({...})` is used.
 *
 * The DELETE gate was unified onto `documents:write` in issue #734. It used to
 * call isElevatedRole() — a read-access predicate (who may view unknown/
 * unmapped categories) — which let owners delete but blocked CAM, out of step
 * with the upload gate, the RBAC matrix, and the UI delete button.
 *
 * `permission` metadata matches the runtime gates: `documents`/`read` (GET),
 * `documents`/`write` (POST + DELETE). `documents` IS in `RBAC_RESOURCES`;
 * `RBAC_ACTIONS` has only `read`/`write`, so the DELETE pairs the verb with
 * `write`.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const listQuerySchema = z.object({
  communityId: z.coerce.number().int().positive(),
  categoryId: z.coerce.number().int().positive().optional(),
  cursor: z.string().min(1).max(256).optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

export const createDocumentBodySchema = z.object({
  communityId: z.number().int().positive(),
  title: z.string().min(1).max(500),
  description: z.string().nullable().optional(),
  categoryId: z.number().int().positive(),
  filePath: z.string().min(1),
  fileName: z.string().min(1),
  fileSize: z.number().int().positive(),
  mimeType: z.string().min(1).optional(),
  /**
   * The uploader's attestation that protected personal information has been
   * redacted (§718.111(12)(c)).
   *
   * Optional in the SCHEMA, required by the HANDLER for categories that
   * routinely contain such information — the check needs the category's name,
   * which is a database read, so Zod cannot express it. See
   * `isRedactionSensitiveCategory` and F-02.
   */
  redactionAttested: z.boolean().optional(),
});

export type CreateDocumentBody = z.infer<typeof createDocumentBodySchema>;

const deleteQuerySchema = z.object({
  id: z.coerce.number().int().positive(),
  communityId: z.coerce.number().int().positive(),
});

export const documentsListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/documents',
  request: {
    query: listQuerySchema,
  },
  response: z.unknown(),
  paginated: true,
  permission: { resource: 'documents', action: 'read' },
});

export const documentsCreateContract = defineRoute({
  method: 'POST',
  path: '/api/v1/documents',
  request: {
    body: createDocumentBodySchema,
  },
  response: z.unknown(),
  permission: { resource: 'documents', action: 'write' },
});

export const documentsDeleteContract = defineRoute({
  method: 'DELETE',
  path: '/api/v1/documents',
  request: {
    query: deleteQuerySchema,
  },
  response: z.object({
    deleted: z.literal(true),
    id: z.number().int().positive(),
  }),
  permission: { resource: 'documents', action: 'write' },
});

/**
 * PATCH — the `public_access` writer.
 *
 * `.strict()` on purpose: this endpoint exists to flip ONE flag, and an
 * unrecognised key should be refused rather than silently ignored. It is
 * deliberately not a general document PATCH — nothing else needs one, and a
 * wider body would widen what a `documents:write` holder can change here.
 */
const patchQuerySchema = z.object({
  id: z.coerce.number().int().positive(),
  communityId: z.coerce.number().int().positive(),
});

const patchBodySchema = z
  .object({
    publicAccess: z.boolean(),
    /** Fla. Stat. 718.111(12)(c) — required by category when publishing. */
    redactionAttested: z.boolean().optional(),
  })
  .strict();

export const documentsPatchContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/documents',
  request: {
    query: patchQuerySchema,
    body: patchBodySchema,
  },
  response: z.object({
    id: z.number().int().positive(),
    publicAccess: z.boolean(),
  }),
  permission: { resource: 'documents', action: 'write' },
});
