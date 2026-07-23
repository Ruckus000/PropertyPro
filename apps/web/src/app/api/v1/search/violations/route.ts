/**
 * Command-palette violations search.
 *
 * GET /api/v1/search/violations
 * Query: { q?, limit?, communityId? }
 *
 * Plan A1 Bundle PR #3, drain #60. Migrated to `runRoute(contract, handler)`;
 * see `./contract.ts` for the schema. Auth chain preserved verbatim — note
 * `requireViolationsEnabled` is async and gates feature/plan ahead of the
 * RBAC `requirePermission` check.
 *
 * Envelope migration: `{ results, totalCount, status }` → `{ data: {...} }`.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { searchViolationsByTrigram } from '@propertypro/db';
import { requirePermission } from '@/lib/db/access-control';
import { requireViolationsEnabled } from '@/lib/violations/common';
import { searchViolationsContract } from './contract';

export const GET = withErrorHandler(
  runRoute(searchViolationsContract, async ({ query, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId ?? null);
    const membership = await requireCommunityMembership(communityId, userId);
    await requireViolationsEnabled(membership);
    requirePermission(membership, 'violations', 'read');
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);

    const q = query.q?.trim() ?? '';
    const limit = Math.min(Math.max(query.limit ?? 3, 1), 20);

    const isNumeric = /^\d+$/.test(q);
    if (q.length < (isNumeric ? 1 : 2)) {
      return { results: [], totalCount: 0, status: 'ok' as const };
    }

    const { results, totalCount } = await searchViolationsByTrigram(communityId, q, limit, {
      isAdmin: membership.isAdmin,
      userId: membership.userId,
    });

    return {
      results: results.map((r) => ({
        id: r.id,
        title: r.description.slice(0, 100),
        subtitle: `${r.severity} · ${r.status}`,
        href: `/violations/${r.id}`,
        entityType: 'violation' as const,
        status: r.status,
        severity: r.severity,
        relevance: r.relevance,
      })),
      totalCount,
      status: 'ok' as const,
    };
  }),
);
