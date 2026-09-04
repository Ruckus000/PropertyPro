/**
 * Tell residents that the community website changed.
 *
 * Launch blocker #6 (gap audit G-05). Before this, `publishCommunitySite`
 * updated the public site and notified nobody — and residents do not poll a
 * website. The product is sold against a statutory clock, and §718's clock is
 * about residents *being informed*; a notice posted where nobody looks meets
 * the letter and misses the point.
 *
 * ## Why this creates an announcement rather than sending mail directly
 *
 * The whole resident-delivery path is keyed to an `announcementId`:
 * `announcement_delivery_log` rows FK to it, and that is what carries per-
 * recipient status, the digest-vs-immediate split, and the unsubscribe token.
 * Sending mail "directly" would mean reimplementing all of it, unlogged.
 * Creating the announcement instead buys, for free and already tested:
 *
 *   - the in-app feed entry (residents who never open mail still see it),
 *   - each recipient's `daily_digest` / `weekly_digest` preference,
 *   - one-click unsubscribe,
 *   - a delivery log to answer "was this association actually told?".
 *
 * ## Failure semantics — the reason this returns a result instead of throwing
 *
 * By the time this runs, `publishCommunitySite`'s transaction has COMMITTED.
 * The site is live and there is nothing to roll back, so a delivery failure
 * must not fail the publish.
 *
 * But it must not be swallowed either. Every item on the launch-blockers list
 * shares one failure mode — degrading silently while dashboards stay green —
 * and "we told your residents" is exactly the claim a PM must not be given
 * falsely. So this never throws: it reports what happened, and the route puts
 * that on the wire so the publish sheet can say so.
 *
 * `partial` is a real state, not defensive padding: the announcement row and
 * the email fan-out are separate writes, so the feed entry can exist while the
 * mail did not go. A PM told "sent" in that case would believe an untruth.
 */
import { communities, createScopedClient, logAuditEvent } from '@propertypro/db';
import { queueAnnouncementDelivery } from './announcement-delivery';
import {
  createAnnouncementForCommunity,
  getAnnouncementAuthorName,
} from './announcement-service';
import { createNotificationsForEvent } from './notification-service';
import { buildCommunityUrl } from '@/lib/utils/community-url';
import { sanitizeHtml } from '@/lib/utils/html-sanitizer';

export { SITE_PUBLISH_SUMMARY_MAX_LENGTH } from '@/lib/site-editor/publish-notification';

export type SitePublishNotificationResult =
  /** Announcement created and the delivery fan-out completed. */
  | { status: 'sent'; announcementId: number; recipientCount: number }
  /**
   * The announcement exists — residents see it in the app — but the email
   * fan-out failed. Reported distinctly so the PM is not told "emailed".
   */
  | { status: 'partial'; announcementId: number; reason: string }
  /** Nothing was recorded. Residents were not told at all. */
  | { status: 'failed'; reason: string };

export interface NotifyResidentsOfSitePublishInput {
  communityId: number;
  actorUserId: string;
  /** The PM's one-line description of what changed. Already length-validated. */
  summary: string;
}

/** Escape before interpolating PM text into the announcement body HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Look up the community's public slug so the announcement can link to the site
 * it is announcing. Returns null rather than throwing — a missing slug should
 * cost the reader a link, never the whole notification.
 */
async function resolveCommunitySlug(communityId: number): Promise<string | null> {
  try {
    const scoped = createScopedClient(communityId);
    const rows = await scoped.query(communities);
    const row = rows.find((candidate) => candidate['id'] === communityId);
    const slug = row?.['slug'];
    return typeof slug === 'string' && slug.length > 0 ? slug : null;
  } catch {
    return null;
  }
}

/**
 * Post the publish as an announcement and fan it out to every resident.
 *
 * Never throws. See the failure-semantics note above.
 */
export async function notifyResidentsOfSitePublish({
  communityId,
  actorUserId,
  summary,
}: NotifyResidentsOfSitePublishInput): Promise<SitePublishNotificationResult> {
  const trimmed = summary.trim();

  const slug = await resolveCommunitySlug(communityId);
  const siteUrl = slug ? buildCommunityUrl(slug, '/') : null;

  // Title carries the PM's specific message; the body carries the context and
  // the link. Putting the summary in both would read as a stutter in the feed.
  const title = trimmed;
  const body = sanitizeHtml(
    [
      '<p>The community website has been updated.</p>',
      siteUrl
        ? `<p><a href="${escapeHtml(siteUrl)}">View the updated site</a></p>`
        : '',
    ]
      .filter(Boolean)
      .join(''),
  );

  let announcementId: number;
  try {
    const created = await createAnnouncementForCommunity(communityId, {
      title,
      body,
      audience: 'all',
      // Never pinned. A site update is routine; pinning it would displace
      // whatever the board actually chose to pin.
      isPinned: false,
      publishedBy: actorUserId,
    });
    announcementId = created.id;
  } catch (error) {
    console.error('[site-publish-notification] announcement creation failed', {
      communityId,
      error: messageOf(error),
    });
    return { status: 'failed', reason: messageOf(error) };
  }

  // In-app notifications are fire-and-forget and deliberately not awaited into
  // the result: the announcement row is already the durable record, and the
  // feed reads from it. Mirrors the announcements route.
  void createNotificationsForEvent(
    communityId,
    {
      category: 'announcement',
      title,
      body: 'The community website has been updated.',
      actionUrl: `/announcements/${announcementId}`,
      sourceType: 'announcement',
      sourceId: String(announcementId),
    },
    'all',
    actorUserId,
  ).catch((error: unknown) => {
    console.error('[site-publish-notification] in-app notification failed', {
      communityId,
      announcementId,
      error: messageOf(error),
    });
  });

  try {
    const authorName = await getAnnouncementAuthorName(communityId, actorUserId);
    const recipientCount = await queueAnnouncementDelivery({
      communityId,
      announcementId,
      audience: 'all',
      title,
      body,
      isPinned: false,
      authorName,
    });

    // Reuses the existing `announcement_email_sent` action rather than minting a
    // site-publish-specific one: this IS an announcement email send, and the
    // announcements route already writes that action for the same event. The
    // site-publish origin is carried in `metadata.source` so the trail stays
    // greppable without splitting one concept across two action names.
    await logAuditEvent({
      userId: actorUserId,
      action: 'announcement_email_sent',
      resourceType: 'announcement',
      resourceId: String(announcementId),
      communityId,
      metadata: { recipientCount, audience: 'all', source: 'site_publish' },
    });

    return { status: 'sent', announcementId, recipientCount };
  } catch (error) {
    console.error('[site-publish-notification] delivery failed', {
      communityId,
      announcementId,
      error: messageOf(error),
    });

    // A console line is not a record. The announcement exists and the mail did
    // not go, which is precisely the state someone will later need to explain —
    // so it goes in the audit trail, best-effort. A failure to LOG the failure
    // must not escalate into a thrown error, since the caller's contract is
    // that this function never throws.
    try {
      await logAuditEvent({
        userId: actorUserId,
        action: 'notification_delivery_partial',
        resourceType: 'announcement',
        resourceId: String(announcementId),
        communityId,
        // The reason is an internal error message, never recipient data — the
        // audit log is append-only and manager-readable, so nothing sensitive
        // may enter it.
        metadata: { source: 'site_publish', reason: messageOf(error) },
      });
    } catch {
      // Deliberately swallowed; the returned `partial` status is the signal.
    }

    return { status: 'partial', announcementId, reason: messageOf(error) };
  }
}
