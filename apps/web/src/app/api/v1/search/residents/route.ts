/**
 * Command-palette resident search.
 *
 * GET /api/v1/search/residents
 * Query: { q?, limit?, communityId? }
 *
 * Plan A1 Bundle PR #3, drain #58. Migrated to `runRoute(contract, handler)`;
 * see `./contract.ts` for the schema. Auth chain preserved verbatim.
 *
 * Envelope migration: `{ results, totalCount, status }` → `{ data: {...} }`.
 * Consumer hook `use-resident-search` updated to unwrap `.data` manually.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { requirePermission } from '@/lib/db/access-control';
import { searchResidentsByTrigram } from '@propertypro/db';
import { escapeLikePattern } from '@/lib/utils/escape-like';
import { searchResidentsContract } from './contract';

export const GET = withErrorHandler(
  runRoute(searchResidentsContract, async ({ query, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId ?? null);
    const membership = await requireCommunityMembership(communityId, userId);

    // Residents cannot search other residents (privacy)
    requirePermission(membership, 'residents', 'read');
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);

    const q = query.q?.trim() ?? '';
    const limit = Math.min(Math.max(query.limit ?? 3, 1), 20);

    // Numeric input: 1 char min (unit numbers). Alpha: 2 char min.
    const isNumeric = /^\d+$/.test(q);
    if (q.length < (isNumeric ? 1 : 2)) {
      return { results: [], totalCount: 0, status: 'ok' as const };
    }

    const sanitizedInput = escapeLikePattern(q);
    const { results, totalCount } = await searchResidentsByTrigram(
      communityId,
      q,
      sanitizedInput,
      limit,
    );

    return {
      results: results.map((r) => ({
        id: r.id,
        title: r.full_name ?? r.email,
        subtitle: r.unit_number ? `Unit ${r.unit_number}` : r.role,
        href: `/residents/${r.id}`,
        entityType: 'resident' as const,
        role: r.role,
        unitNumber: r.unit_number,
        relevance: r.relevance,
      })),
      totalCount,
      status: 'ok' as const,
    };
  }),
);
