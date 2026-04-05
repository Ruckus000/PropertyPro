import { NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { listCommunitiesForUser } from '@/lib/api/user-communities';

/**
 * GET /api/v1/me/communities
 *
 * Returns the list of communities the authenticated user belongs to.
 * Used by the community switcher and overview page for multi-community
 * users.
 *
 * Authorization: user is the anchor — only returns rows from the
 * user's own user_roles.
 */
export const GET = withErrorHandler(async () => {
  const userId = await requireAuthenticatedUserId();
  const rows = await listCommunitiesForUser(userId);
  const data = rows.map((r) => ({
    id: r.communityId,
    name: r.communityName,
    slug: r.slug,
    role: r.role,
    displayTitle: r.displayTitle,
    communityType: r.communityType,
  }));
  return NextResponse.json({ data });
});
