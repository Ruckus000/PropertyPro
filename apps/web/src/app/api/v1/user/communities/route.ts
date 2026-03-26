/**
 * Lightweight endpoint for the community switcher.
 * Returns the count of communities the authenticated user belongs to.
 *
 * Used by ProfileMenu to conditionally show "Switch Community" when count > 1.
 * Lazy-loaded on dropdown open to avoid adding a DB query to every page load.
 */
import { NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { countCommunitiesForUser } from '@/lib/api/user-communities';

export const GET = withErrorHandler(async () => {
  const userId = await requireAuthenticatedUserId();
  const count = await countCommunitiesForUser(userId);
  return NextResponse.json({ data: { count } });
});
