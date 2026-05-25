/**
 * GET /api/v1/help/views?communityId=X
 *
 * Returns slugs of help articles the calling user has viewed in this
 * community.
 *
 * Plan A1 drain #26 (Move 2 bundle): input validation (query) and output
 * envelope wrapping delegated to `runRoute()` from `@propertypro/api-contract`.
 * Auth chain preserved verbatim. Wire shape is `{ data: { slugs } }`,
 * byte-identical to pre-migration.
 *
 * Behavior change: pre-migration 400s threw `ValidationError('Invalid
 * communityId')`; runner produces the canonical `VALIDATION_ERROR` envelope.
 * Status code (400) and error code (`VALIDATION_ERROR`) unchanged — message
 * shifts to the runner's standard text.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { listViewedArticleSlugs } from '@/lib/services/help-views-service';
import { helpViewsGetContract } from './contract';

export const GET = withErrorHandler(
  runRoute(helpViewsGetContract, async ({ query, req }) => {
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const userId = await requireAuthenticatedUserId();
    await requireCommunityMembership(communityId, userId);

    const slugs = await listViewedArticleSlugs(communityId, userId);
    return { slugs };
  }),
);
