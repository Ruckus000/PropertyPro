/**
 * GET /api/v1/documents/search — full-text document search for a community.
 *
 * Plan A1 drain #143. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for schemas and B1 envelope rationale.
 */
import { runRoute } from '@propertypro/api-contract';
import { searchDocuments } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';

import { documentSearchContract } from './contract';

export const GET = withErrorHandler(
  runRoute(documentSearchContract, async ({ query, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, userId);

    const result = await searchDocuments({
      communityId,
      query: query.q,
      categoryId: query.categoryId,
      mimeType: query.mimeType,
      createdFrom: query.from ? new Date(query.from) : null,
      createdTo: query.to ? new Date(query.to) : null,
      cursor: query.cursor ?? null,
      limit: query.limit,
      role: membership.role,
      communityType: membership.communityType,
      isUnitOwner: membership.isUnitOwner,
      permissions: membership.permissions,
    });

    return {
      data: result.data,
      pagination: {
        nextCursor: result.nextCursor,
        limit: query.limit ?? 20,
      },
    };
  }),
);
