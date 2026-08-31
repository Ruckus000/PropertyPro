/**
 * GET /api/v1/export/jobs/[jobId] — poll one export job.
 *
 * Returns the job plus its completed volumes. `manifest.warnings` rides along
 * verbatim: anything the worker skipped has to be visible HERE, not only inside
 * the archive, or a user could act on an export they believe is complete.
 *
 * read-entitlement:exempt — see `requireExportAccess`.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { NotFoundError } from '@/lib/api/errors';
import { requireExportAccess } from '@/lib/services/export/export-route-auth';
import { findJobById, listJobParts } from '@/lib/services/export/export-job-service';
import { getExportJobContract } from '../contract';

export const GET = withErrorHandler(
  runRoute(getExportJobContract, async ({ params, query, req }) => {
    const { communityId } = await requireExportAccess(req, query.communityId);

    const job = await findJobById(params.jobId);
    // 404 rather than 403 on a cross-tenant id: a 403 would confirm the job
    // exists in some other community, which is itself a leak.
    if (!job || job.communityId !== communityId) {
      throw new NotFoundError('Export job not found');
    }

    return { job, parts: await listJobParts(job.id) };
  }),
);
