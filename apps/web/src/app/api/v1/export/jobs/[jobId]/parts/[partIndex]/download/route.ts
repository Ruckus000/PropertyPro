/**
 * GET /api/v1/export/jobs/[jobId]/parts/[partIndex]/download
 *
 * Mints a short-lived signed URL for one zip volume.
 *
 * Returns JSON `{ url }` rather than a 302 for two reasons: the contract runner
 * cannot express a redirect, and a JSON URL lets the client show the expiry and
 * re-request rather than following a redirect it cannot inspect.
 *
 * Every download is audit-logged. An export volume is a copy of the entire
 * association including resident PII, so "who downloaded the whole association,
 * and when" must be answerable.
 *
 * read-entitlement:exempt — see `requireExportAccess`.
 */
import { runRoute } from '@propertypro/api-contract';
import {
  COMMUNITY_EXPORTS_BUCKET,
  COMMUNITY_EXPORT_SIGNED_URL_TTL_SECONDS,
  createPresignedDownloadUrl,
  logAuditEvent,
} from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { NotFoundError, UnprocessableEntityError } from '@/lib/api/errors';
import { requireExportAccess } from '@/lib/services/export/export-route-auth';
import { findJobById, listJobParts } from '@/lib/services/export/export-job-service';
import { downloadExportPartContract } from '../../../../contract';

export const GET = withErrorHandler(
  runRoute(downloadExportPartContract, async ({ params, query, req }) => {
    const { actorUserId, communityId } = await requireExportAccess(req, query.communityId);

    const job = await findJobById(params.jobId);
    if (!job || job.communityId !== communityId) {
      throw new NotFoundError('Export job not found');
    }

    if (job.status !== 'ready') {
      throw new UnprocessableEntityError(
        `Export is not ready to download (status: ${job.status}).`,
      );
    }

    // An expired archive has had its objects deleted by the reaper; a signed URL
    // would 404 confusingly. Say so, and point at re-requesting — which is free.
    if (job.expiresAt && job.expiresAt.getTime() <= Date.now()) {
      throw new UnprocessableEntityError(
        'This export has expired and its files have been deleted. Request a new export — there is no charge or limit.',
      );
    }

    const part = (await listJobParts(job.id)).find((p) => p.partIndex === params.partIndex);
    if (!part) {
      throw new NotFoundError('Export part not found');
    }

    const url = await createPresignedDownloadUrl(
      COMMUNITY_EXPORTS_BUCKET,
      part.storagePath,
      COMMUNITY_EXPORT_SIGNED_URL_TTL_SECONDS,
    );

    await logAuditEvent({
      userId: actorUserId,
      action: 'community_export_downloaded',
      resourceType: 'community_export_download',
      resourceId: `${job.id}:${params.partIndex}`,
      communityId,
      metadata: { partIndex: params.partIndex, byteSize: part.byteSize },
    });

    return {
      url,
      expiresInSeconds: COMMUNITY_EXPORT_SIGNED_URL_TTL_SECONDS,
      fileName: `community-${communityId}-export-part-${String(params.partIndex).padStart(3, '0')}.zip`,
      byteSize: part.byteSize,
    };
  }),
);
