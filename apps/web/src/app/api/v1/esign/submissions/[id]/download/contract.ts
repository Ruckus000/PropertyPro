/**
 * Route contract for `GET /api/v1/esign/submissions/[id]/download`.
 *
 * Plan A1 auto-drain. Returns a presigned download URL for a submission's
 * signed document. Sibling submission-detail route drained in #118; this
 * route shares the identical auth chain and the `parseCommunityIdFromQuery`
 * in-handler pattern.
 *
 * Auth-first GET: contract omits `communityId` from the query schema so an
 * invalid/missing `communityId` does NOT 400 before
 * `requireAuthenticatedUserId` runs. `communityId` is parsed in-handler via
 * `parseCommunityIdFromQuery` (preserves the pre-migration
 * `BadRequestError('communityId query parameter is required')` /
 * `'communityId must be a positive integer'` messages).
 *
 * Auth surface (preserved verbatim from pre-migration handler; handler order
 * after runRoute validates `params`):
 *   requireAuthenticatedUserId
 *     → parseCommunityIdFromQuery(req)
 *     → requireCommunityMembership
 *     → requireEsignReadPermission (async — awaited)
 *     → getSubmission(communityId, id)
 *     → (business rule) signedDocumentPath present
 *     → createPresignedDownloadUrl('documents', signedDocumentPath)
 *
 * Pre-migration the `[id]` was parsed via `Number(params?.id)` +
 * `BadRequestError('Invalid ID')`; this is now expressed via Zod params
 * coercion (`z.coerce.number().int().positive()`). Behavior change: 400 for
 * invalid `[id]` shifts to the canonical `VALIDATION_ERROR` envelope (status
 * unchanged at 400).
 *
 * Response: tight `z.object({ downloadUrl: z.string() })`. The handler returns
 * a synthesized string-only shape (`{ downloadUrl }`) with no `Date` fields,
 * so a tight schema is safe (no safeParse failure).
 *
 * The business-rule error
 * `BadRequestError('No signed document available for this submission')` is
 * preserved byte-identical inside the handler — it fires AFTER the contract
 * has validated, so it is intentionally NOT modeled in the contract.
 *
 * `permission` metadata is illustrative; the effective gate is the
 * `requireEsignReadPermission` esign helper. `esign` IS in `RBAC_RESOURCES`
 * (`packages/shared/src/rbac-matrix.ts`).
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const esignSubmissionDownloadContract = defineRoute({
  method: 'GET',
  path: '/api/v1/esign/submissions/[id]/download',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
  },
  response: z.object({
    downloadUrl: z.string(),
  }),
  permission: { resource: 'esign', action: 'read' },
});
