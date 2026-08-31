/**
 * POST /api/v1/export/jobs — queue a full community data export
 * GET  /api/v1/export/jobs — list this community's export jobs
 *
 * read-entitlement:exempt — a lapsed association must be able to retrieve its
 * own statutory records; see `requireExportAccess`, which carries the full
 * rationale and is the single place this decision lives.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-07.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireExportAccess } from '@/lib/services/export/export-route-auth';
import {
  listJobsForCommunity,
  queueExportJob,
} from '@/lib/services/export/export-job-service';
import { createExportJobContract, listExportJobsContract } from './contract';

export const POST = withErrorHandler(
  runRoute(createExportJobContract, async ({ body, req }) => {
    const { actorUserId, communityId } = await requireExportAccess(req, body.communityId);

    // Returns the existing in-flight job when one exists rather than queueing a
    // second copy of the entire association — a double-click must not cost two
    // full exports. Enforced by a partial unique index, not by this call.
    const { job, deduplicated } = await queueExportJob({
      communityId,
      requestedBy: actorUserId,
      includeDocumentFiles: body.includeDocumentFiles,
    });

    return { job, deduplicated };
  }),
);

export const GET = withErrorHandler(
  runRoute(listExportJobsContract, async ({ query, req }) => {
    const { communityId } = await requireExportAccess(req, query.communityId);
    return { jobs: await listJobsForCommunity(communityId) };
  }),
);
