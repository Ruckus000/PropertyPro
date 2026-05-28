/**
 * Route contract for `GET /api/v1/esign/submissions/[id]`.
 *
 * Plan A1 drain #118. Submission detail with presigned preview/download URLs.
 * Sibling collection drained in #116.
 *
 * Auth-first GET: contract omits `communityId` query so invalid/missing
 * `communityId` does not 400 before `requireAuthenticatedUserId` (forum/threads
 * #117 precedent). `communityId` parsed in-handler via `parseCommunityIdFromQuery`.
 *
 * Auth surface (handler order after runRoute validates params):
 *   requireAuthenticatedUserId
 *     → parseCommunityIdFromQuery
 *     → requireCommunityMembership
 *     → requireEsignReadPermission (async)
 *     → getSubmission + getTemplate + presigned URLs
 *
 * Response: loose `z.unknown()` — submission rows may carry `Date` fields.
 *
 * `permission` metadata is illustrative; effective gate is esign helper.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const esignSubmissionDetailContract = defineRoute({
  method: 'GET',
  path: '/api/v1/esign/submissions/[id]',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'esign', action: 'read' },
});
