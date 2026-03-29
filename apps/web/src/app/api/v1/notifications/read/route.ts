/**
 * PATCH /api/v1/notifications/read
 *
 * Mark notifications as read. Body: { communityId, ids: number[] } | { communityId, all: true }
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { markNotificationsRead } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';

const bodySchema = z.union([
  z.object({ communityId: z.number().int().positive(), ids: z.array(z.number().int().positive()).min(1) }),
  z.object({ communityId: z.number().int().positive(), all: z.literal(true) }),
]);

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const body: unknown = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) throw new ValidationError('Body must be { communityId, ids } or { communityId, all: true }');

  const communityId = resolveEffectiveCommunityId(req, parsed.data.communityId);
  const userId = await requireAuthenticatedUserId();
  await requireCommunityMembership(communityId, userId);

  const ids = 'ids' in parsed.data ? parsed.data.ids : undefined;
  await markNotificationsRead(communityId, userId, ids);

  return NextResponse.json({ data: { ok: true } });
});
