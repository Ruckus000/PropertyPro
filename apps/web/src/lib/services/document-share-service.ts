/**
 * Send specific documents to specific members (Directory → "Send documents").
 *
 * A COURTESY COPY, not official notice: each recipient's email preference is
 * respected (never → not emailed, digest → queued for their digest), so this
 * must not be used where a statute requires delivery. The documents themselves
 * are already in every eligible member's portal; this only points them at it.
 *
 * - Access: each recipient only gets the documents their own role may open
 *   (same filter as the documents list). Nothing is sent for the rest.
 * - Versions: a document id IS a version (each version is its own row), so the
 *   audit record of ids pins exactly what was sent.
 * - Idempotent per `sendId`: the email carries a provider idempotency key and
 *   digest rows dedupe on their unique index, so a retried request with the
 *   same sendId does not send twice.
 */
import {
  buildSourceTypeFilter,
  createScopedClient,
  documents,
  getAccessibleDocuments,
  logAuditEvent,
  notificationPreferences,
  userRoles,
  users,
} from '@propertypro/db';
import { and, inArray } from '@propertypro/db/filters';
import { DocumentSharedEmail, sendEmail } from '@propertypro/email';
import { isCommunityRole, type CommunityType } from '@propertypro/shared';
import { createElement } from 'react';
import { NotFoundError } from '@/lib/api/errors';
import { getBaseUrl } from '@/lib/utils/url';
import {
  getDefaultPreferences,
  isDigestFrequency,
  isNotificationTypeEnabled,
  type EmailFrequency,
} from '@/lib/utils/email-preferences';
import { buildCommunityEmailUnsubscribeUrl } from './community-email-unsubscribe-token';
import { loadEmailBranding } from './email-branding';
import { enqueueDigestItems } from './notification-digest-queue';

export type DocumentShareStatus = 'emailed' | 'digest' | 'opted_out' | 'no_access' | 'not_member' | 'failed';

export interface DocumentShareResult {
  userId: string;
  status: DocumentShareStatus;
  /** The documents this recipient was sent (their accessible subset). */
  documentIds: number[];
}

const FREQUENCIES: readonly EmailFrequency[] = ['immediate', 'daily_digest', 'weekly_digest', 'never'];

export async function shareDocuments(params: {
  communityId: number;
  communityType: CommunityType;
  documentIds: number[];
  userIds: string[];
  sendId: string;
  actorUserId: string;
  senderName: string;
}): Promise<DocumentShareResult[]> {
  const { communityId, communityType, sendId, actorUserId, senderName } = params;
  const documentIds = [...new Set(params.documentIds)];
  const userIds = [...new Set(params.userIds)];
  const scoped = createScopedClient(communityId);

  // Live, user-visible documents only (no drafts, no violation evidence).
  const docRows = await scoped.selectFrom<{ id: number; title: string }>(
    documents,
    { id: documents.id, title: documents.title },
    and(inArray(documents.id, documentIds), buildSourceTypeFilter()),
  );
  if (docRows.length !== documentIds.length) {
    throw new NotFoundError('One or more documents were not found or have been deleted');
  }
  const titleById = new Map(docRows.map((d) => [d.id, d.title]));

  const [roleRows, prefRows, userRows] = await Promise.all([
    scoped.selectFrom<{ userId: string; role: string; isUnitOwner: boolean | null }>(
      userRoles,
      { userId: userRoles.userId, role: userRoles.role, isUnitOwner: userRoles.isUnitOwner },
      inArray(userRoles.userId, userIds),
    ),
    scoped.selectFrom<{ userId: string; emailFrequency: string | null }>(
      notificationPreferences,
      { userId: notificationPreferences.userId, emailFrequency: notificationPreferences.emailFrequency },
      inArray(notificationPreferences.userId, userIds),
    ),
    scoped.selectFrom<{ id: string; email: string; fullName: string }>(
      users,
      { id: users.id, email: users.email, fullName: users.fullName },
      inArray(users.id, userIds),
    ),
  ]);
  const roleByUser = new Map(roleRows.map((r) => [r.userId, r]));
  const frequencyByUser = new Map(prefRows.map((p) => [p.userId, p.emailFrequency]));
  const userById = new Map(userRows.map((u) => [u.id, u]));

  // Access depends only on (role, isUnitOwner), so resolve once per pair.
  const accessCache = new Map<string, Promise<Set<number>>>();
  const accessibleFor = (role: string, isUnitOwner: boolean) => {
    const key = `${role}:${isUnitOwner}`;
    let hit = accessCache.get(key);
    if (!hit) {
      hit = isCommunityRole(role)
        ? getAccessibleDocuments(
            { communityId, role, communityType, isUnitOwner },
            inArray(documents.id, documentIds),
          ).then((rows) => new Set(rows.map((r) => r['id'] as number)))
        : Promise.resolve(new Set<number>());
      accessCache.set(key, hit);
    }
    return hit;
  };

  const baseUrl = getBaseUrl();
  // The library, not a per-document URL: `/documents/:id` has no page (404).
  const libraryUrl = `${baseUrl}/documents?communityId=${communityId}`;
  let branding: Awaited<ReturnType<typeof loadEmailBranding>> | null = null;

  const results: DocumentShareResult[] = [];
  // ponytail: serial, ≤100 recipients per request (contract cap) — same
  // trade-off as the batch invitations route.
  for (const userId of userIds) {
    const role = roleByUser.get(userId);
    const user = userById.get(userId);
    if (!role || !user) {
      results.push({ userId, status: 'not_member', documentIds: [] });
      continue;
    }
    const allowed = await accessibleFor(role.role, role.isUnitOwner === true);
    const sendable = documentIds.filter((id) => allowed.has(id));
    if (sendable.length === 0) {
      results.push({ userId, status: 'no_access', documentIds: [] });
      continue;
    }

    const raw = frequencyByUser.get(userId);
    const frequency = FREQUENCIES.includes(raw as EmailFrequency)
      ? (raw as EmailFrequency)
      : getDefaultPreferences().emailFrequency;
    const prefs = { ...getDefaultPreferences(), emailFrequency: frequency };
    if (!isNotificationTypeEnabled('document', prefs)) {
      results.push({ userId, status: 'opted_out', documentIds: sendable });
      continue;
    }

    try {
      if (isDigestFrequency(frequency)) {
        // sourceId stays the bare document id: the digest processor drops rows
        // whose document was deleted before the digest goes out.
        await enqueueDigestItems(
          sendable.map((id) => ({
            communityId,
            userId,
            frequency,
            sourceType: 'document' as const,
            sourceId: String(id),
            eventType: 'document_shared',
            eventTitle: titleById.get(id)!,
            eventSummary: `Sent by ${senderName}`,
            actionUrl: libraryUrl,
          })),
        );
        results.push({ userId, status: 'digest', documentIds: sendable });
        continue;
      }

      branding ??= await loadEmailBranding(communityId);
      const unsubscribeUrl = buildCommunityEmailUnsubscribeUrl({
        baseUrl,
        communityId,
        userId,
        topic: 'notifications',
      });
      await sendEmail({
        to: user.email,
        subject:
          sendable.length === 1
            ? `${branding.communityName}: ${titleById.get(sendable[0]!)}`
            : `${branding.communityName}: ${sendable.length} documents for you`,
        category: 'non-transactional',
        unsubscribeUrl,
        idempotencyKey: `document-share/${communityId}/${sendId}/${userId}`,
        react: createElement(DocumentSharedEmail, {
          branding: { ...branding, unsubscribeUrl, unsubscribeLabel: 'Unsubscribe from these emails' },
          recipientName: user.fullName,
          senderName,
          documents: sendable.map((id) => ({ title: titleById.get(id)! })),
          portalUrl: libraryUrl,
        }),
      });
      results.push({ userId, status: 'emailed', documentIds: sendable });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[document-share] delivery failed', {
        communityId,
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      results.push({ userId, status: 'failed', documentIds: sendable });
    }
  }

  // One audit row per send: who, when, which document versions (ids + titles
  // as sent), and what happened for each recipient.
  await logAuditEvent({
    userId: actorUserId,
    action: 'notification_sent',
    resourceType: 'document_share',
    resourceId: sendId,
    communityId,
    metadata: {
      courtesyCopy: true,
      documents: docRows.map((d) => ({ id: d.id, title: d.title })),
      results,
    },
  });

  return results;
}
