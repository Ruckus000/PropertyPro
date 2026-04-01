/**
 * GET /api/v1/notifications
 *
 * Returns a paginated list of in-app notifications for the current user.
 * Excludes archived and soft-deleted. Cursor-based pagination (id < cursor).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { listNotifications, type NotificationCategory } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';

const VALID_CATEGORIES = [
  'announcement', 'document', 'meeting', 'maintenance',
  'violation', 'election', 'system',
] as const;

const querySchema = z.object({
  communityId: z.coerce.number().int().positive(),
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  category: z.enum(VALID_CATEGORIES).optional(),
  unread_only: z.coerce.boolean().default(false),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    communityId: searchParams.get('communityId'),
    cursor: searchParams.get('cursor') ?? undefined,
    limit: searchParams.get('limit') ?? undefined,
    category: searchParams.get('category') ?? undefined,
    unread_only: searchParams.get('unread_only') ?? undefined,
  });

  if (!parsed.success) {
    throw new ValidationError('Invalid query parameters');
  }

  const { cursor, limit, category, unread_only } = parsed.data;
  const communityId = resolveEffectiveCommunityId(req, parsed.data.communityId);
  const userId = await requireAuthenticatedUserId();
  await requireCommunityMembership(communityId, userId);

  const rows = await listNotifications({
    communityId,
    userId,
    cursor,
    limit: limit + 1,
    category: category as NotificationCategory | undefined,
    unreadOnly: unread_only,
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? String(items[items.length - 1]?.id) : null;

  return NextResponse.json({
    data: {
      notifications: items,
      nextCursor,
    },
  });
});
