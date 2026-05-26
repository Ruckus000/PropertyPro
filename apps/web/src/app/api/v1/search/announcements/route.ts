/**
 * Command-palette announcement search.
 *
 * GET /api/v1/search/announcements
 * Query: { q?, limit?, communityId? }
 *
 * Plan A1 Bundle PR #3, drain #54. Migrated to `runRoute(contract, handler)`;
 * see `./contract.ts` for the schema. Auth chain preserved verbatim:
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, query.communityId)
 *     → requireCommunityMembership
 *     → requirePermission('announcements', 'read')
 *     → searchVisibleAnnouncements(communityId, membership, q, limit)
 *
 * Envelope migration: pre-migration `{ results, totalCount, status }` flat
 * envelope becomes `{ data: { results, totalCount, status } }` per B1.
 * Short-circuit on empty/short `q` preserved (1 char numeric, 2 char alpha).
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import {
  formatAnnouncementAudienceLabel,
  searchVisibleAnnouncements,
} from '@/lib/announcements/read-visibility';
import { searchAnnouncementsContract } from './contract';

export const GET = withErrorHandler(
  runRoute(searchAnnouncementsContract, async ({ query, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId ?? null);
    const membership = await requireCommunityMembership(communityId, userId);
    requirePermission(membership, 'announcements', 'read');

    const q = query.q?.trim() ?? '';
    const limit = Math.min(Math.max(query.limit ?? 3, 1), 20);

    const isNumeric = /^\d+$/.test(q);
    if (q.length < (isNumeric ? 1 : 2)) {
      return { results: [], totalCount: 0, status: 'ok' as const };
    }

    const { rows: results, totalCount } = await searchVisibleAnnouncements(
      communityId,
      membership,
      q,
      limit,
    );

    return {
      results: results.map((r) => ({
        id: r.id,
        title: r.title,
        subtitle: formatAnnouncementAudienceLabel(r.audience),
        href: `/announcements/${r.id}?communityId=${communityId}`,
        entityType: 'announcement' as const,
        audience: r.audience,
        publishedAt: r.publishedAt,
        relevance: r.relevance,
      })),
      totalCount,
      status: 'ok' as const,
    };
  }),
);
