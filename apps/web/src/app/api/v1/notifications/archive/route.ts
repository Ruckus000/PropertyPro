/**
 * PATCH /api/v1/notifications/archive
 *
 * Archive notifications. Body: { communityId: number, ids: number[] }
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { archiveNotifications } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';

const bodySchema = z.object({
  communityId: z.number().int().positive(),
  ids: z.array(z.number().int().positive()).min(1),
});

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const body: unknown = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) throw new ValidationError('Body must be { communityId, ids: number[] }');

  const communityId = resolveEffectiveCommunityId(req, parsed.data.communityId);
  const userId = await requireAuthenticatedUserId();
  await requireCommunityMembership(communityId, userId);

  await archiveNotifications(communityId, userId, parsed.data.ids);
  return NextResponse.json({ data: { ok: true } });
});
