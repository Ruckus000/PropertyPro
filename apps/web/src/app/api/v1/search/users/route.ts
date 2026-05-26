/**
 * Command-palette / audit-log user search.
 *
 * GET /api/v1/search/users
 * Query: { q?, limit?, communityId? }
 *
 * Plan A1 Bundle PR #3, drain #59. Migrated to `runRoute(contract, handler)`;
 * see `./contract.ts` for the schema. Auth chain preserved verbatim — note
 * the permission resource is `audit` (not `users`), matching the
 * pre-migration `requirePermission(membership, 'audit', 'read')` gate.
 *
 * Default limit 10 (vs 3 for other search routes). Envelope migration:
 * `{ results, totalCount, status }` → `{ data: {...} }`. Consumer hook
 * `use-user-search` updated to unwrap `.data` manually.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import { searchUsersByTrigram, type UserSearchHit } from '@propertypro/db';
import { escapeLikePattern } from '@/lib/utils/escape-like';
import { searchUsersContract } from './contract';

function humanizePresetKey(presetKey: string | null): string {
  if (!presetKey?.trim()) return '';
  const s = presetKey.replace(/_/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

function mapUserSearchRow(r: UserSearchHit) {
  const presetPretty = humanizePresetKey(r.preset_key);

  const title =
    r.full_name?.trim()
    || r.display_title?.trim()
    || presetPretty
    || (r.role === 'resident' ? 'Resident'
      : r.role === 'manager' ? 'Staff member'
      : r.role === 'pm_admin' ? 'PM administrator'
      : String(r.role));

  let subtitle: string;
  if (r.unit_number) {
    subtitle = `Unit ${r.unit_number}`;
  } else if (r.display_title?.trim()) {
    subtitle = r.display_title.trim();
  } else if (presetPretty) {
    subtitle = presetPretty;
  } else {
    subtitle =
      r.role === 'manager'
        ? 'Staff'
        : r.role === 'resident'
          ? 'Resident'
          : r.role === 'pm_admin'
            ? 'PM admin'
            : String(r.role);
  }

  return {
    id: r.id,
    title,
    subtitle,
    role: r.role,
  };
}

export const GET = withErrorHandler(
  runRoute(searchUsersContract, async ({ query, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId ?? null);
    const membership = await requireCommunityMembership(communityId, userId);

    requirePermission(membership, 'audit', 'read');

    const q = query.q?.trim() ?? '';
    const limit = Math.min(Math.max(query.limit ?? 10, 1), 20);

    const isNumeric = /^\d+$/.test(q);
    if (q.length < (isNumeric ? 1 : 2)) {
      return { results: [], totalCount: 0, status: 'ok' as const };
    }

    const sanitizedInput = escapeLikePattern(q);
    const { results, totalCount } = await searchUsersByTrigram(
      communityId,
      q,
      sanitizedInput,
      limit,
    );

    return {
      results: results.map(mapUserSearchRow),
      totalCount,
      status: 'ok' as const,
    };
  }),
);
