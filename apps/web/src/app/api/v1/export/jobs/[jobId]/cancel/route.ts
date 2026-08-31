/**
 * POST /api/v1/export/jobs/[jobId]/cancel — cancel a queued/running export.
 *
 * Frees the community's single in-flight slot so a new export can be requested
 * (e.g. after realising `includeDocumentFiles` should have been set). Cancelling
 * a `ready` job is a no-op — its archive stays downloadable until it expires.
 *
 * read-entitlement:exempt — see `requireExportAccess`.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { NotFoundError } from '@/lib/api/errors';
import { requireExportAccess } from '@/lib/services/export/export-route-auth';
import { cancelExportJob, findJobById } from '@/lib/services/export/export-job-service';
import { cancelExportJobContract } from '../../contract';

export const POST = withErrorHandler(
  runRoute(cancelExportJobContract, async ({ params, body, req }) => {
    const { actorUserId, communityId } = await requireExportAccess(req, body.communityId);

    const job = await findJobById(params.jobId);
    if (!job || job.communityId !== communityId) {
      throw new NotFoundError('Export job not found');
    }

    // The status guard lives in the UPDATE's WHERE clause, so a job that reached
    // `ready` between this read and the write is not retroactively cancelled.
    return { cancelled: await cancelExportJob(params.jobId, actorUserId, communityId) };
  }),
);
