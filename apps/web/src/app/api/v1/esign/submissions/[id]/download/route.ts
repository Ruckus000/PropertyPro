/**
 * E-Sign submission download API — presigned URL for the signed document.
 *
 * GET /api/v1/esign/submissions/[id]/download
 *
 * Plan A1 auto-drain — migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for the schema and auth-chain rationale. Auth chain
 * preserved verbatim:
 *   requireAuthenticatedUserId
 *     → parseCommunityIdFromQuery(req)
 *     → requireCommunityMembership
 *     → requireEsignManagementRead (async, awaited)
 *     → getSubmission(communityId, id)
 *     → (business rule) signedDocumentPath present
 *     → createPresignedDownloadUrl('documents', signedDocumentPath)
 *
 * The business-rule error
 * `BadRequestError('No signed document available for this submission')` is
 * preserved byte-identical. Success wire shape `{ data: { downloadUrl } }`
 * byte-identical.
 */
import { runRoute } from '@propertypro/api-contract';
import { createPresignedDownloadUrl } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { BadRequestError } from '@/lib/api/errors';
import { parseCommunityIdFromQuery } from '@/lib/finance/request';
import { requireEsignManagementRead } from '@/lib/esign/esign-route-helpers';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { getSubmission } from '@/lib/services/esign-service';
import { esignSubmissionDownloadContract } from './contract';

export const GET = withErrorHandler(
  runRoute(esignSubmissionDownloadContract, async ({ params, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromQuery(req);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireEsignManagementRead(membership);
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);

    const { submission } = await getSubmission(communityId, params.id);

    if (!submission.signedDocumentPath) {
      throw new BadRequestError('No signed document available for this submission');
    }

    const downloadUrl = await createPresignedDownloadUrl(
      'documents',
      submission.signedDocumentPath,
    );

    return { downloadUrl };
  }),
);
