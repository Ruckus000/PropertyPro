import { NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { listCommunitiesForUser } from '@/lib/api/user-communities';

export const GET = withErrorHandler(async () => {
  const userId = await requireAuthenticatedUserId();
  const communities = await listCommunitiesForUser(userId);
  return NextResponse.json({ data: { count: communities.length } });
});
