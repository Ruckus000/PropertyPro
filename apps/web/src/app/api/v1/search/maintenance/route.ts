/**
 * Command-palette maintenance ticket search.
 *
 * GET /api/v1/search/maintenance
 * Query: { q?, limit?, communityId? }
 *
 * Plan A1 Bundle PR #3, drain #56. Migrated to `runRoute(contract, handler)`;
 * see `./contract.ts` for the schema. Auth chain preserved verbatim.
 *
 * Envelope migration: `{ results, totalCount, status }` → `{ data: {...} }`.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import { searchMaintenanceByTrigram } from '@propertypro/db';
import { operationsHubHref } from '@/lib/operations/routes';
import { searchMaintenanceContract } from './contract';

export const GET = withErrorHandler(
  runRoute(searchMaintenanceContract, async ({ query, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId ?? null);
    const membership = await requireCommunityMembership(communityId, userId);
    requirePermission(membership, 'maintenance', 'read');

    const q = query.q?.trim() ?? '';
    const limit = Math.min(Math.max(query.limit ?? 3, 1), 20);

    const isNumeric = /^\d+$/.test(q);
    if (q.length < (isNumeric ? 1 : 2)) {
      return { results: [], totalCount: 0, status: 'ok' as const };
    }

    const { results, totalCount } = await searchMaintenanceByTrigram(communityId, q, limit, {
      isAdmin: membership.isAdmin,
      userId: membership.userId,
    });

    return {
      results: results.map((r) => ({
        id: r.id,
        title: r.title,
        subtitle: `${r.priority} · ${r.status}`,
        href: operationsHubHref(communityId, 'requests'),
        entityType: 'maintenance' as const,
        status: r.status,
        priority: r.priority,
        relevance: r.relevance,
      })),
      totalCount,
      status: 'ok' as const,
    };
  }),
);
