import { createElement } from 'react';
import {
  announcementDeliveryLog,
  communities,
  createScopedClient,
  notificationPreferences,
  userRoles,
  users,
} from '@propertypro/db';
import { AnnouncementEmail, sendEmail } from '@propertypro/email';
import { eq } from 'drizzle-orm';

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
}

const BOARD_ROLES = new Set(['board_member', 'board_president']);

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

function isAudienceMatch(role: string, audience: AnnouncementAudience): boolean {
  if (audience === 'all') return true;
  if (audience === 'owners_only') return role === 'owner';
  if (audience === 'board_only') return BOARD_ROLES.has(role);
  if (audience === 'tenants_only') return role === 'tenant';
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

  const preferencesByUserId = new Map<string, boolean>();
  for (const row of preferenceRows) {
    const userId = row['userId'];
    const emailAnnouncements = row['emailAnnouncements'];
    if (typeof userId === 'string' && typeof emailAnnouncements === 'boolean') {
      preferencesByUserId.set(userId, emailAnnouncements);
    }
  }

  const recipients: Recipient[] = [];
  for (const row of roleRows) {
    const userId = row['userId'];
    const role = row['role'];
    if (typeof userId !== 'string' || typeof role !== 'string') continue;
    if (!isAudienceMatch(role, audience)) continue;

    const allowAnnouncements = preferencesByUserId.get(userId);
    if (allowAnnouncements === false) continue;

    const user = usersById.get(userId);
    if (!user) continue;

    const email = user['email'];
    const fullName = user['fullName'];
    if (typeof email !== 'string' || typeof fullName !== 'string') continue;

    recipients.push({
      userId,
      email,
      fullName,
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

async function deliverAnnouncementEmails(params: QueueAnnouncementDeliveryParams): Promise<number> {
  const scoped = createScopedClient(params.communityId);
  const recipients = await resolveRecipients(params.communityId, params.audience);
  const branding = await loadBranding(params.communityId);

  for (const recipient of recipients) {
    await scoped.insert(announcementDeliveryLog, {
      announcementId: params.announcementId,
      userId: recipient.userId,
      email: recipient.email,
      status: 'pending',
    });
  }

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

export function queueAnnouncementDelivery(
  params: QueueAnnouncementDeliveryParams,
): Promise<number> {
  return deliverAnnouncementEmails(params);
}
