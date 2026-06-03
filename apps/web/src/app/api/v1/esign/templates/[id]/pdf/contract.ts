/**
 * Route contract for `GET /api/v1/esign/templates/[id]/pdf`.
 *
 * Plan A1 auto-drain. Returns a short-lived presigned download URL for the
 * template's source PDF (if one exists).
 *
 * Auth surface (preserved verbatim from pre-migration handler):
 *   requireAuthenticatedUserId
 *     → parseCommunityIdFromQuery(req)          (finance request helper)
 *     → requireCommunityMembership
 *     → requireEsignReadPermission (async — awaited)
 *     → getTemplate(communityId, id)
 *     → createPresignedDownloadUrl('documents', template.sourceDocumentPath)
 *
 * `Number(params.id)` + `if (!id || isNaN(id)) throw BadRequestError('Invalid ID')`
 * is now expressed via Zod params coercion (`z.coerce.number().int().positive()`),
 * which also rejects `0`. Behavior change: invalid `[id]` shifts from the
 * `BadRequestError('Invalid ID')` shape to the canonical `VALIDATION_ERROR`
 * envelope (still HTTP 400). Mirrors the sibling `templates/[id]` GET drain
 * (#132), which declares the same params + `communityId` query schema while
 * the handler still calls `parseCommunityIdFromQuery(req)` to extract the id
 * (the helper throws its own `BadRequestError` on a missing/invalid query
 * `communityId`).
 *
 * Response model is a tight `z.object({ pdfUrl: z.string() })` because the
 * handler returns a *synthesized* `{ pdfUrl }` shape with no Date fields — the
 * runner wraps it as `{ data: { pdfUrl } }`, byte-identical to the
 * pre-migration `NextResponse.json({ data: { pdfUrl } })`.
 *
 * The "no PDF available" branch (no `sourceDocumentPath`, or presign throws)
 * is migrated from an inline `NextResponse.json({ error: { code: 'NOT_FOUND',
 * message: 'No PDF available for this template' } }, { status: 404 })` to a
 * thrown `NotFoundError('No PDF available for this template')`, which
 * `withErrorHandler` renders to the identical 404 + `NOT_FOUND` envelope and
 * preserves the message byte-identical.
 *
 * `permission: { resource: 'esign', action: 'read' }` matches the runtime
 * `requireEsignReadPermission(membership)` gate. `esign` IS in
 * `RBAC_RESOURCES` (`packages/shared/src/rbac-matrix.ts`).
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const esignTemplatePdfGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/esign/templates/[id]/pdf',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
    query: z.object({
      communityId: z.coerce.number().int().positive(),
    }),
  },
  response: z.object({ pdfUrl: z.string() }),
  permission: { resource: 'esign', action: 'read' },
});
