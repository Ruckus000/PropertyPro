/**
 * E-Sign — presigned download URL for a template's source PDF.
 *
 * GET /api/v1/esign/templates/[id]/pdf?communityId=<id>
 *
 * Plan A1 auto-drain. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for the schema and rationale. Auth chain preserved verbatim:
 *   requireAuthenticatedUserId
 *     → parseCommunityIdFromQuery(req)
 *     → requireCommunityMembership
 *     → requireEsignReadPermission (async, awaited)
 *     → getTemplate(communityId, id)
 *     → createPresignedDownloadUrl('documents', template.sourceDocumentPath)
 *
 * Success wire shape `{ data: { pdfUrl } }` byte-identical to pre-migration.
 * The "no PDF available" branch now throws `NotFoundError(...)` instead of an
 * inline `NextResponse.json({ error }, { status: 404 })` — `withErrorHandler`
 * renders the identical 404 + `NOT_FOUND` envelope, message preserved.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { NotFoundError } from '@/lib/api/errors';
import { parseCommunityIdFromQuery } from '@/lib/finance/request';
import { requireEsignReadPermission } from '@/lib/esign/esign-route-helpers';
import { getTemplate } from '@/lib/services/esign-service';
import { createPresignedDownloadUrl } from '@propertypro/db';
import { esignTemplatePdfGetContract } from './contract';

export const GET = withErrorHandler(
  runRoute(esignTemplatePdfGetContract, async ({ params, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromQuery(req);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireEsignReadPermission(membership);

    const template = await getTemplate(communityId, params.id);

    let pdfUrl: string | null = null;
    if (template.sourceDocumentPath) {
      try {
        pdfUrl = await createPresignedDownloadUrl('documents', template.sourceDocumentPath);
      } catch {
        pdfUrl = null;
      }
    }

    if (!pdfUrl) {
      throw new NotFoundError('No PDF available for this template');
    }

    return { pdfUrl };
  }),
);
