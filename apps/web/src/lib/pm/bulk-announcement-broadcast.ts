/**
 * PM bulk announcement broadcast — per-community insert + delivery helper.
 *
 * Inserts one announcement into a single community, resolves the author's
 * display name, then enqueues email delivery via the announcement-delivery
 * service. Caller is responsible for iterating across the requested
 * communities (so that per-community Promise.allSettled error capture stays
 * at the route).
 */
import { announcements, createScopedClient, users } from '@propertypro/db';
import {
  queueAnnouncementDelivery,
  type AnnouncementAudience,
} from '@/lib/services/announcement-delivery';

/**
 * Insert an announcement into one community and queue its email delivery.
 *
 * Both `body` (raw HTML — passed to the email queue so the recipient sees
 * intent-preserving markup) and `sanitizedBody` (post-`sanitizeHtml` —
 * stored in the DB) must be supplied; the helper does NOT re-sanitize so
 * the route can choose the policy.
 *
 * AUTHZ: tenant-scoped — caller MUST have already verified the actor is a
 * property_manager_admin in this community (typically via
 * `findManagedCommunitiesPortfolioUnscoped` + membership check).
 */
export async function broadcastBulkAnnouncementToCommunity(params: {
  communityId: number;
  userId: string;
  title: string;
  /** Raw, un-sanitized body — emitted to the email queue for delivery. */
  body: string;
  /** Sanitized body — persisted to the announcements row. */
  sanitizedBody: string;
  audience: AnnouncementAudience;
  isPinned: boolean;
}): Promise<void> {
  const { communityId, userId, title, body, sanitizedBody, audience, isPinned } = params;
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

  // Resolve author display name (preserves prior route-side behavior; a
  // tighter `selectFrom(users, ..., eq(users.id, userId))` lookup would be
  // a worthwhile perf follow-up but is out of scope for this drain).
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
    audience,
    title,
    body,
    isPinned,
    authorName,
  });
}
