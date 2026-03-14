import { createElement } from 'react';
import {
  announcementDeliveryLog,
  communities,
  createScopedClient,
  notificationPreferences,
  userRoles,
  users,
} from '@propertypro/db';
import { and, eq } from '@propertypro/db/filters';
import { AnnouncementEmail, sendEmail } from '@propertypro/email';
// Note: BOARD_ROLES from shared still use legacy role names.
// The isAudienceMatch function below uses new role names + presetKey directly.
import {
  isDigestFrequency,
  isNeverFrequency,
  type EmailFrequency,
} from '@/lib/utils/email-preferences';
import {
  enqueueDigestItems,
  type EnqueueDigestItemInput,
} from '@/lib/services/notification-digest-queue';

export type AnnouncementAudience = 'all' | 'owners_only' | 'board_only' | 'tenants_only';

interface QueueAnnouncementDeliveryParams {
  communityId: number;
  announcementId: number;
  audience: AnnouncementAudience;
  title: string;
  body: string;
  isPinned: boolean;
  authorName: string;
}

interface Recipient {
  userId: string;
  email: string;
  fullName: string;
  mode: 'immediate' | 'digest';
  frequency?: Extract<EmailFrequency, 'daily_digest' | 'weekly_digest'>;
}

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

function isAudienceMatch(role: string, audience: AnnouncementAudience, opts?: { isUnitOwner?: boolean; presetKey?: string }): boolean {
  if (audience === 'all') return true;
  if (audience === 'owners_only') return role === 'resident' && opts?.isUnitOwner === true;
  if (audience === 'board_only') {
    if (role === 'manager') {
      return opts?.presetKey === 'board_member' || opts?.presetKey === 'board_president';
    }
    return false;
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
): Promise<Recipient[]> {
  const scoped = createScopedClient(communityId);
  const [roleRows, userRows, preferenceRows] = await Promise.all([
    scoped.query(userRoles),
    scoped.query(users),
    scoped.query(notificationPreferences),
  ]);

  const usersById = new Map<string, Record<string, unknown>>();
  for (const row of userRows) {
    const userId = row['id'];
    if (typeof userId === 'string') {
      usersById.set(userId, row);
    }
  }

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

  const recipients: Recipient[] = [];
  for (const row of roleRows) {
    const userId = row['userId'];
    const role = row['role'];
    const isUnitOwner = row['isUnitOwner'] === true;
    const presetKey = row['presetKey'] as string | undefined;
    if (typeof userId !== 'string' || typeof role !== 'string') continue;
    if (!isAudienceMatch(role, audience, { isUnitOwner, presetKey })) continue;

    const prefs = preferencesByUserId.get(userId) ?? {
      emailAnnouncements: true,
      emailFrequency: 'immediate' as const,
    };

    if (!prefs.emailAnnouncements) continue;
    if (isNeverFrequency(prefs.emailFrequency)) continue;

    const user = usersById.get(userId);
    if (!user) continue;

    const email = user['email'];
    const fullName = user['fullName'];
    if (typeof email !== 'string' || typeof fullName !== 'string') continue;

    if (isDigestFrequency(prefs.emailFrequency)) {
      recipients.push({
        userId,
        email,
        fullName,
        mode: 'digest',
        frequency: prefs.emailFrequency,
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

  return recipients;
}

async function loadBranding(communityId: number): Promise<{ communityName: string }> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.query(communities);
  const community = rows.find((row) => row['id'] === communityId);
  return {
    communityName:
      typeof community?.['name'] === 'string' ? (community['name'] as string) : 'PropertyPro',
  };
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
  const existing = (await scoped.query(announcementDeliveryLog)).find(
    (row) => row['announcementId'] === announcementId && row['userId'] === userId,
  );

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
): Promise<number> {
  if (recipients.length === 0) return 0;

  const branding = await loadBranding(params.communityId);
  const portalUrl = `${getBaseUrl()}/dashboard?communityId=${params.communityId}`;
  const unsubscribeUrl = `${getBaseUrl()}/settings?communityId=${params.communityId}`;

  for (const batch of chunk(recipients, 100)) {
    await Promise.all(
      batch.map(async (recipient) => {
        try {
          const result = await sendEmail({
            to: recipient.email,
            subject: `${params.isPinned ? '[Important] ' : ''}${params.title}`,
            category: 'non-transactional',
            unsubscribeUrl,
            react: createElement(AnnouncementEmail, {
              branding,
              recipientName: recipient.fullName,
              announcementTitle: params.title,
              announcementBody: params.body,
              authorName: params.authorName,
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
  const recipients = await resolveRecipients(params.communityId, params.audience);

  await createAnnouncementLogRows(params.communityId, params.announcementId, recipients);

  const immediateRecipients = recipients.filter((recipient) => recipient.mode === 'immediate');
  const digestRecipients = recipients.filter((recipient) => recipient.mode === 'digest');

  await enqueueDigestRecipients(params, digestRecipients);
  await deliverImmediateAnnouncementEmails(params, immediateRecipients);

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
