/**
 * Bulk Announcements API — send announcements to multiple communities at once.
 *
 * POST /api/v1/pm/bulk/announcements
 *
 * Plan A1 drain #168. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts`.
 *
 * Authorization: caller must hold property_manager_admin in at least one community.
 * Each communityId in the request is validated against the user's managed set.
 */
import { runRoute } from '@propertypro/api-contract';
// AUTHZ: Phase 2C: Bulk operations — cross-community announcements + document uploads
import { findManagedCommunitiesPortfolioUnscoped } from '@propertypro/db/unsafe';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError } from '@/lib/api/errors';
import { requirePmPortfolioAccess } from '@/lib/api/pm-portfolio-access';
import { type AnnouncementAudience } from '@/lib/services/announcement-delivery';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { sanitizeHtml } from '@/lib/utils/html-sanitizer';
import { broadcastBulkAnnouncementToCommunity } from '@/lib/pm/bulk-announcement-broadcast';
import { pmBulkAnnouncementsPostContract } from './contract';

interface BulkResult {
  communityId: number;
  communityName: string;
  status: 'sent' | 'failed';
  error?: string;
}

export const POST = withErrorHandler(
  runRoute(pmBulkAnnouncementsPostContract, async ({ body }) => {
    const userId = await requirePmPortfolioAccess(
      'Only property managers can send bulk announcements',
    );

    const { communityIds, title, body: rawBody, audience, isPinned } = body;
    const sanitizedBody = sanitizeHtml(rawBody);

    const managed = await findManagedCommunitiesPortfolioUnscoped(userId);
    const managedMap = new Map(managed.map((c) => [c.communityId, c.communityName]));

    const invalidIds = communityIds.filter((id) => !managedMap.has(id));
    if (invalidIds.length > 0) {
      throw new ForbiddenError(
        `You do not manage communities: ${invalidIds.join(', ')}`,
      );
    }

    const results = await Promise.allSettled(
      communityIds.map(async (communityId): Promise<BulkResult> => {
        await assertNotDemoGrace(communityId);
        const communityName = managedMap.get(communityId) ?? `Community ${communityId}`;

        await broadcastBulkAnnouncementToCommunity({
          communityId,
          userId,
          title,
          body: rawBody,
          sanitizedBody,
          audience: audience as AnnouncementAudience,
          isPinned,
        });

        return { communityId, communityName, status: 'sent' };
      }),
    );

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
        error:
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
      };
    });

    return { results: mapped };
  }),
);
