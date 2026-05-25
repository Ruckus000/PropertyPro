/**
 * GET /api/v1/emergency-broadcasts/templates?communityId=N
 *
 * Returns the static list of pre-built emergency broadcast templates.
 *
 * Plan A1 drain #29 (Move 2 bundle): input validation (query) and output
 * envelope wrapping delegated to `runRoute()` from `@propertypro/api-contract`.
 * Auth chain preserved verbatim. Wire shape `{ data: EMERGENCY_TEMPLATES }`
 * byte-identical to pre-migration.
 *
 * Behavior change: pre-migration 400s threw `ValidationError` with two
 * different messages (`'communityId query parameter is required'` /
 * `'communityId must be a positive integer'`); runner produces the canonical
 * `VALIDATION_ERROR` envelope for both cases. Status code (400) unchanged.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import { EMERGENCY_TEMPLATES } from '@/lib/constants/emergency-templates';
import { emergencyBroadcastsTemplatesGetContract } from './contract';

export const GET = withErrorHandler(
  runRoute(emergencyBroadcastsTemplatesGetContract, async ({ query, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, userId);
    requirePermission(membership, 'emergency_broadcasts', 'read');

    return EMERGENCY_TEMPLATES;
  }),
);
