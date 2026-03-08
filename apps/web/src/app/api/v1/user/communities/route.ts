import { NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { countCommunitiesForUser } from '@/lib/api/user-communities';

export const GET = withErrorHandler(async () => {
  const userId = await requireAuthenticatedUserId();
  const count = await countCommunitiesForUser(userId);
  return NextResponse.json({ data: { count } });
});
