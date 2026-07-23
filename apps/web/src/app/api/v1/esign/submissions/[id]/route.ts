/**
 * E-Sign submission detail API — get submission with preview/download URLs.
 *
 * GET /api/v1/esign/submissions/[id]
 *
 * Plan A1 drain #118 — migrated to `runRoute(contract, handler)`;
 * see `./contract.ts` for schemas and auth-chain rationale.
 */
import { runRoute } from '@propertypro/api-contract';
import { createPresignedDownloadUrl } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { parseCommunityIdFromQuery } from '@/lib/finance/request';
import { requireEsignReadPermission } from '@/lib/esign/esign-route-helpers';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { getSubmission, getTemplate } from '@/lib/services/esign-service';
import { esignSubmissionDetailContract } from './contract';

export const GET = withErrorHandler(
  runRoute(esignSubmissionDetailContract, async ({ params, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromQuery(req);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireEsignReadPermission(membership);
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);

    const data = await getSubmission(communityId, params.id);
    const template = await getTemplate(communityId, data.submission.templateId);

    const previewPath =
      data.submission.signedDocumentPath ?? template.sourceDocumentPath ?? null;

    let previewPdfUrl: string | null = null;
    if (previewPath) {
      try {
        previewPdfUrl = await createPresignedDownloadUrl('documents', previewPath);
      } catch {
        previewPdfUrl = null;
      }
    }

    let downloadUrl: string | null = null;
    if (data.submission.signedDocumentPath) {
      try {
        downloadUrl = await createPresignedDownloadUrl(
          'documents',
          data.submission.signedDocumentPath,
        );
      } catch {
        downloadUrl = null;
      }
    }

    return {
      ...data,
      previewPdfUrl,
      downloadUrl,
    };
  }),
);
