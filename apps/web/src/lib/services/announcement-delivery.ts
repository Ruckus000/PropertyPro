import { createElement } from 'react';
import {
  announcementDeliveryLog,
  communities,
  createScopedClient,
  notificationPreferences,
  userRoles,
  users,
} from '@propertypro/db';
import { and, eq, inArray } from '@propertypro/db/filters';
import { AnnouncementEmail, sendEmail } from '@propertypro/email';
import { hasBoardDesignation, isBoardPresident } from '@propertypro/shared';
import {
  isDigestFrequency,
  isNeverFrequency,
  type EmailFrequency,
} from '@/lib/utils/email-preferences';
import {
  enqueueDigestItems,
  type EnqueueDigestItemInput,
} from '@/lib/services/notification-digest-queue';
import { getBaseUrl } from '@/lib/utils/url';
import { loadEmailBranding } from './email-branding';
import { buildCommunityEmailUnsubscribeUrl } from './community-email-unsubscribe-token';

export type AnnouncementAudience = 'all' | 'owners_only' | 'board_only' | 'tenants_only';

interface QueueAnnouncementDeliveryParams {
  communityId: number;
  announcementId: number;
  audience: AnnouncementAudience;
  title: string;
  body: string;
  isPinned: boolean;
  authorName: string;
  /**
   * The author's user id, used only to label the email signature with their
   * title in this community. Omit it and the signature shows no title.
   */
  authorUserId?: string;
}

/**
 * The author's title for the email signature, from their role row in this
 * community: an explicit `displayTitle` first, then board designation. Returns
 * undefined rather than a guessed title (e.g. for a manager with no title set).
 */
function authorTitleFromRoleRow(row: Record<string, unknown> | undefined): string | undefined {
  if (!row) return undefined;
  const displayTitle = row['displayTitle'];
  if (typeof displayTitle === 'string' && displayTitle.trim().length > 0) return displayTitle.trim();
  const designation = row['designation'];
  if (isBoardPresident(designation)) return 'Board President';
  if (hasBoardDesignation(designation)) return 'Board Member';
  return undefined;
}

interface Recipient {
  userId: string;
  email: string;
  fullName: string;
  mode: 'immediate' | 'digest';
  frequency?: Extract<EmailFrequency, 'daily_digest' | 'weekly_digest'>;
}

function isAudienceMatch(role: string, audience: AnnouncementAudience, opts?: { isUnitOwner?: boolean; designation?: string | null }): boolean {
  if (audience === 'all') return true;
  if (audience === 'owners_only') return role === 'resident' && opts?.isUnitOwner === true;
  if (audience === 'board_only') {
    // Phase 3.2: board targeting sources from designation (role-independent, §3.2).
    return hasBoardDesignation(opts?.designation);
  }
  if (audience === 'tenants_only') return role === 'resident' && opts?.isUnitOwner !== true;
  return false;
}

function chunk<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

async function resolveRecipients(
  communityId: number,
  audience: AnnouncementAudience,
  authorUserId?: string,
): Promise<{ recipients: Recipient[]; authorTitle: string | undefined }> {
  const scoped = createScopedClient(communityId);
  const [roleRows, preferenceRows] = await Promise.all([
    scoped.query(userRoles),
    scoped.query(notificationPreferences),
  ]);

  const preferencesByUserId = new Map<
    string,
    { emailAnnouncements: boolean; emailFrequency: EmailFrequency }
  >();
  for (const row of preferenceRows) {
    const userId = row['userId'];
    if (typeof userId === 'string') {
      const rawFrequency = row['emailFrequency'];
      const emailFrequency: EmailFrequency =
        rawFrequency === 'immediate' ||
        rawFrequency === 'daily_digest' ||
        rawFrequency === 'weekly_digest' ||
        rawFrequency === 'never'
          ? rawFrequency
          : 'immediate';

      preferencesByUserId.set(userId, {
        emailAnnouncements: (row['emailAnnouncements'] as boolean | undefined) ?? true,
        emailFrequency,
      });
    }
  }

  // Decide who qualifies from roles + preferences first, then load only those
  // users: `users` is platform-global, so it is never read wholesale.
  const candidates: Array<{ userId: string; emailFrequency: EmailFrequency }> = [];
  for (const row of roleRows) {
    const userId = row['userId'];
    const role = row['role'];
    const isUnitOwner = row['isUnitOwner'] === true;
    const designation = row['designation'] as string | null | undefined;
    if (typeof userId !== 'string' || typeof role !== 'string') continue;
    if (!isAudienceMatch(role, audience, { isUnitOwner, designation })) continue;

    const prefs = preferencesByUserId.get(userId) ?? {
      emailAnnouncements: true,
      emailFrequency: 'immediate' as const,
    };

    if (!prefs.emailAnnouncements) continue;
    if (isNeverFrequency(prefs.emailFrequency)) continue;
    candidates.push({ userId, emailFrequency: prefs.emailFrequency });
  }

  const userRows = await scoped.selectFrom<{ id: string; email: string; fullName: string }>(
    users,
    { id: users.id, email: users.email, fullName: users.fullName },
    inArray(users.id, candidates.map((c) => c.userId)),
  );
  const usersById = new Map(userRows.map((user) => [user.id, user]));

  const recipients: Recipient[] = [];
  for (const { userId, emailFrequency } of candidates) {
    const user = usersById.get(userId);
    if (!user) continue;
    const { email, fullName } = user;

    if (isDigestFrequency(emailFrequency)) {
      recipients.push({
        userId,
        email,
        fullName,
        mode: 'digest',
        frequency: emailFrequency,
      });
      continue;
    }

    recipients.push({
      userId,
      email,
      fullName,
      mode: 'immediate',
    });
  }

  // The role rows are already loaded for audience matching, so the author's
  // title costs no extra query.
  const authorTitle = authorUserId
    ? authorTitleFromRoleRow(roleRows.find((row) => row['userId'] === authorUserId))
    : undefined;

  return { recipients, authorTitle };
}

async function markStatus(
  communityId: number,
  announcementId: number,
  userId: string,
  values: {
    status: 'sent' | 'failed';
    providerMessageId?: string;
    errorMessage?: string;
  },
): Promise<void> {
  const scoped = createScopedClient(communityId);
  const existing = (
    await scoped.queryWhere(
      announcementDeliveryLog,
      and(
        eq(announcementDeliveryLog.announcementId, announcementId),
        eq(announcementDeliveryLog.userId, userId),
      ),
    )
  )[0];

  if (!existing) return;

  const existingAttemptCount = existing['attemptCount'];
  const nextAttemptCount =
    typeof existingAttemptCount === 'number' ? existingAttemptCount + 1 : 1;

  await scoped.update(
    announcementDeliveryLog,
    {
      status: values.status,
      providerMessageId: values.providerMessageId ?? null,
      errorMessage: values.errorMessage ?? null,
      attemptCount: nextAttemptCount,
      attemptedAt: new Date(),
    },
    eq(announcementDeliveryLog.id, Number(existing['id'])),
  );
}

async function createAnnouncementLogRows(
  communityId: number,
  announcementId: number,
  recipients: Recipient[],
): Promise<void> {
  const scoped = createScopedClient(communityId);

  for (const recipient of recipients) {
    await scoped.insert(announcementDeliveryLog, {
      announcementId,
      userId: recipient.userId,
      email: recipient.email,
      status: recipient.mode === 'digest' ? 'queued_digest' : 'pending',
    });
  }
}

async function enqueueDigestRecipients(
  params: QueueAnnouncementDeliveryParams,
  digestRecipients: Recipient[],
): Promise<void> {
  if (digestRecipients.length === 0) return;

  const portalUrl = `${getBaseUrl()}/dashboard?communityId=${params.communityId}`;
  const queueItems: EnqueueDigestItemInput[] = [];
  for (const recipient of digestRecipients) {
    if (!recipient.frequency) continue;
    queueItems.push({
      communityId: params.communityId,
      userId: recipient.userId,
      frequency: recipient.frequency,
      sourceType: 'announcement' as const,
      sourceId: String(params.announcementId),
      eventType: 'announcement',
      eventTitle: params.title,
      eventSummary: params.body.slice(0, 280),
      actionUrl: portalUrl,
    });
  }

  if (queueItems.length === 0) return;
  await enqueueDigestItems(queueItems);
}

async function deliverImmediateAnnouncementEmails(
  params: QueueAnnouncementDeliveryParams,
  recipients: Recipient[],
  authorTitle: string | undefined,
): Promise<number> {
  if (recipients.length === 0) return 0;

  const branding = await loadEmailBranding(params.communityId);
  const portalUrl = `${getBaseUrl()}/dashboard?communityId=${params.communityId}`;

  for (const batch of chunk(recipients, 100)) {
    await Promise.all(
      batch.map(async (recipient) => {
        try {
          // Per-recipient and no-login: the previous `/settings?communityId=`
          // URL was behind an auth wall, which defeats Gmail's one-click
          // List-Unsubscribe POST and CAN-SPAM's no-account expectation.
          const unsubscribeUrl = buildCommunityEmailUnsubscribeUrl({
            baseUrl: getBaseUrl(),
            communityId: params.communityId,
            userId: recipient.userId,
            topic: 'announcements',
          });

          const result = await sendEmail({
            to: recipient.email,
            subject: `${params.isPinned ? '[Important] ' : ''}${params.title}`,
            category: 'non-transactional',
            unsubscribeUrl,
            react: createElement(AnnouncementEmail, {
              branding: {
                ...branding,
                unsubscribeUrl,
                unsubscribeLabel: 'Unsubscribe from announcements',
              },
              recipientName: recipient.fullName,
              announcementTitle: params.title,
              announcementBody: params.body,
              authorName: params.authorName,
              authorRole: authorTitle,
              portalUrl,
              isPinned: params.isPinned,
            }),
          });

          await markStatus(params.communityId, params.announcementId, recipient.userId, {
            status: 'sent',
            providerMessageId: result.id,
          });
        } catch (error) {
          await markStatus(params.communityId, params.announcementId, recipient.userId, {
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : String(error),
          });
        }
      }),
    );
  }

  return recipients.length;
}

async function deliverAnnouncementEmails(params: QueueAnnouncementDeliveryParams): Promise<number> {
  const { recipients, authorTitle } = await resolveRecipients(
    params.communityId,
    params.audience,
    params.authorUserId,
  );

  await createAnnouncementLogRows(params.communityId, params.announcementId, recipients);

  const immediateRecipients = recipients.filter((recipient) => recipient.mode === 'immediate');
  const digestRecipients = recipients.filter((recipient) => recipient.mode === 'digest');

  await enqueueDigestRecipients(params, digestRecipients);
  await deliverImmediateAnnouncementEmails(params, immediateRecipients, authorTitle);

  return recipients.length;
}

export function queueAnnouncementDelivery(
  params: QueueAnnouncementDeliveryParams,
): Promise<number> {
  return deliverAnnouncementEmails(params);
}

export async function updateQueuedDigestAnnouncementStatus(
  communityId: number,
  announcementId: number,
  userId: string,
  values: {
    status: 'sent' | 'failed' | 'discarded';
    providerMessageId?: string;
    errorMessage?: string;
  },
): Promise<void> {
  const scoped = createScopedClient(communityId);
  await scoped.update(
    announcementDeliveryLog,
    {
      status: values.status,
      providerMessageId: values.providerMessageId ?? null,
      errorMessage: values.errorMessage ?? null,
      attemptedAt: new Date(),
    },
    and(
      eq(announcementDeliveryLog.announcementId, announcementId),
      eq(announcementDeliveryLog.userId, userId),
      eq(announcementDeliveryLog.status, 'queued_digest'),
    ),
  );
}
