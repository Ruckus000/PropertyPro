import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import { searchUsersByTrigram, type UserSearchHit } from '@propertypro/db';
import { escapeLikePattern } from '@/lib/utils/escape-like';

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

export const GET = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();
  const { searchParams } = new URL(req.url);
  const communityId = resolveEffectiveCommunityId(
    req,
    Number(searchParams.get('communityId')) || null,
  );
  const membership = await requireCommunityMembership(communityId, userId);

  requirePermission(membership, 'audit', 'read');

  const q = searchParams.get('q')?.trim() ?? '';
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 10, 1), 20);

  const isNumeric = /^\d+$/.test(q);
  if (q.length < (isNumeric ? 1 : 2)) {
    return NextResponse.json({ results: [], totalCount: 0, status: 'ok' });
  }

  const sanitizedInput = escapeLikePattern(q);
  const { results, totalCount } = await searchUsersByTrigram(
    communityId,
    q,
    sanitizedInput,
    limit,
  );

  return NextResponse.json({
    results: results.map(mapUserSearchRow),
    totalCount,
    status: 'ok',
  });
});
