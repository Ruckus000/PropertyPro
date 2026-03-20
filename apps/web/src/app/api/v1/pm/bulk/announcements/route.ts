/**
 * Bulk Announcements API — send announcements to multiple communities at once.
 *
 * POST /api/v1/pm/bulk/announcements
 *
 * Authorization: caller must hold property_manager_admin in at least one community.
 * Each communityId in the request is validated against the user's managed set.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createScopedClient,
  announcements,
  users,
} from '@propertypro/db';
import {
  isPmAdminInAnyCommunity,
  findManagedCommunitiesPortfolioUnscoped,
} from '@propertypro/db/unsafe';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError, ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import {
  queueAnnouncementDelivery,
  type AnnouncementAudience,
} from '@/lib/services/announcement-delivery';
import { sanitizeHtml } from '@/lib/utils/html-sanitizer';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const bulkAnnouncementSchema = z.object({
  communityIds: z.array(z.number().int().positive()).min(1, 'At least one community is required'),
  title: z.string().min(1, 'Title is required').max(500, 'Title must be 500 characters or fewer'),
  body: z.string().min(1, 'Body is required'),
  audience: z.enum(['all', 'owners_only', 'board_only', 'tenants_only']).default('all'),
  isPinned: z.boolean().default(false),
});


// ---------------------------------------------------------------------------
// POST — Bulk create announcements across communities
// ---------------------------------------------------------------------------

interface BulkResult {
  communityId: number;
  communityName: string;
  status: 'sent' | 'failed';
  error?: string;
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();

  // Verify PM role
  const isPm = await isPmAdminInAnyCommunity(userId);
  if (!isPm) {
    throw new ForbiddenError('Only property managers can send bulk announcements');
  }

  const body: unknown = await req.json();
  const parseResult = bulkAnnouncementSchema.safeParse(body);
  if (!parseResult.success) {
    throw new ValidationError('Invalid bulk announcement payload', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const { communityIds, title, body: rawBody, audience, isPinned } = parseResult.data;
  const sanitizedBody = sanitizeHtml(rawBody);

  // Validate each communityId belongs to this PM's managed set
  const managed = await findManagedCommunitiesPortfolioUnscoped(userId);
  const managedMap = new Map(managed.map((c) => [c.communityId, c.communityName]));

  const invalidIds = communityIds.filter((id) => !managedMap.has(id));
  if (invalidIds.length > 0) {
    throw new ForbiddenError(
      `You do not manage communities: ${invalidIds.join(', ')}`,
    );
  }

  // Send announcement to each community using Promise.allSettled
  const results = await Promise.allSettled(
    communityIds.map(async (communityId): Promise<BulkResult> => {
      const communityName = managedMap.get(communityId) ?? `Community ${communityId}`;

      const scoped = createScopedClient(communityId);

      // Insert announcement
      const rows = await scoped.insert(announcements, {
        title,
        body: sanitizedBody,
        audience,
        isPinned,
        publishedBy: userId,
      });
      const created = rows[0] as Record<string, unknown>;

      // Resolve author name
      const authorRows = await scoped.query(users);
      const author = authorRows.find((row) => row['id'] === userId);
      const authorName =
        typeof author?.['fullName'] === 'string'
          ? (author['fullName'] as string)
          : 'Community Team';

      // Queue email delivery (non-blocking for partial failures)
      await queueAnnouncementDelivery({
        communityId,
        announcementId: Number(created['id']),
        audience: audience as AnnouncementAudience,
        title,
        body: rawBody,
        isPinned,
        authorName,
      });

      return { communityId, communityName, status: 'sent' };
    }),
  );

  // Map settled results
  const mapped: BulkResult[] = results.map((result, idx) => {
    const communityId = communityIds[idx]!;
    const communityName = managedMap.get(communityId) ?? `Community ${communityId}`;

    if (result.status === 'fulfilled') {
      return result.value;
    }

    return {
      communityId,
      communityName,
      status: 'failed' as const,
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
    };
  });

  return NextResponse.json({ results: mapped });
});
