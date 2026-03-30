/**
 * GET /api/v1/notifications/unread-count
 *
 * Returns the count of unread, non-deleted notifications for the current user.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { countUnreadNotifications } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';

const querySchema = z.object({
  communityId: z.coerce.number().int().positive(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({ communityId: searchParams.get('communityId') });
  if (!parsed.success) throw new ValidationError('Invalid or missing communityId');

  const communityId = resolveEffectiveCommunityId(req, parsed.data.communityId);
  const userId = await requireAuthenticatedUserId();
  await requireCommunityMembership(communityId, userId);

  const count = await countUnreadNotifications(communityId, userId);
  return NextResponse.json({ data: { count } });
});
