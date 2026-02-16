import { createElement } from 'react';
import { eq } from 'drizzle-orm';
import {
  claimDigestQueueRows,
  communities,
  createScopedClient,
  findCandidateDigestCommunityIds,
  hasMoreDigestRows,
  notificationDigestQueue,
  notificationPreferences,
  users,
  type DigestFrequency,
} from '@propertypro/db';
import { NotificationDigestEmail, sendEmail } from '@propertypro/email';
import {
  getDefaultPreferences,
  isNotificationTypeEnabled,
  type NotificationKind,
  type UserNotificationPreferences,
} from '@/lib/utils/email-preferences';
import { updateQueuedDigestAnnouncementStatus } from '@/lib/services/announcement-delivery';

const MAX_ATTEMPTS = 5;
const RETRY_MINUTES_BY_ATTEMPT = [15, 60, 240, 720] as const;
const DEFAULT_COMMUNITY_LIMIT = 20;
const DEFAULT_ROWS_PER_COMMUNITY = 200;
const DEFAULT_EMAILS_PER_TICK = 500;
const DEFAULT_CONCURRENCY = 8;
const DEFAULT_PROCESSING_TIMEOUT_MINUTES = 20;
const DEFAULT_TIMEZONE = 'America/New_York';

export interface DigestProcessorOptions {
  now?: Date;
  communityLimit?: number;
  rowsPerCommunity?: number;
  emailsPerTick?: number;
  concurrency?: number;
  processingTimeoutMinutes?: number;
}

export interface DigestProcessorSummary {
  communitiesScanned: number;
  communitiesProcessed: number;
  rowsClaimed: number;
  rowsSent: number;
  rowsFailed: number;
  rowsDiscarded: number;
  rowsRetried: number;
  emailsSent: number;
  hasMore: boolean;
}

interface LocalTimeParts {
  hour: number;
  weekday: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
}

interface ClaimedRow {
  id: number;
  communityId: number;
  userId: string;
  frequency: DigestFrequency;
  sourceType: string;
  sourceId: string;
  eventType: string;
  eventTitle: string;
  eventSummary: string | null;
  actionUrl: string | null;
  attemptCount: number;
}

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

function toLocalTimeParts(date: Date, timezone: string): LocalTimeParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  });
  const parts = formatter.formatToParts(date);

  const hourPart = parts.find((part) => part.type === 'hour')?.value;
  const weekdayPart = parts.find((part) => part.type === 'weekday')?.value;
  const normalizedWeekday = (weekdayPart ?? 'Mon').slice(0, 3) as LocalTimeParts['weekday'];

  return {
    hour: hourPart ? Number(hourPart) : 0,
    weekday: normalizedWeekday,
  };
}

function frequencyLabel(frequency: DigestFrequency): string {
  return frequency === 'weekly_digest' ? 'Weekly' : 'Daily';
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function getBackoffMinutes(attemptCount: number): number {
  const index = Math.max(0, Math.min(RETRY_MINUTES_BY_ATTEMPT.length - 1, attemptCount - 1));
  return RETRY_MINUTES_BY_ATTEMPT[index] ?? 720;
}

function mapEventTypeToKind(eventType: string): NotificationKind | null {
  if (eventType === 'announcement') return 'announcement';
  if (eventType === 'meeting_notice') return 'meeting';
  if (eventType === 'document_posted') return 'document';
  if (eventType === 'maintenance_update') return 'maintenance';
  if (eventType === 'compliance_alert') return 'meeting';
  return null;
}

function groupRowsByRecipientAndFrequency(rows: ClaimedRow[]): ClaimedRow[][] {
  const groups = new Map<string, ClaimedRow[]>();
  for (const row of rows) {
    const key = `${row.userId}:${row.frequency}`;
    const existing = groups.get(key);
    if (existing) existing.push(row);
    else groups.set(key, [row]);
  }
  return Array.from(groups.values());
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  let index = 0;

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (index < items.length) {
        const current = items[index];
        index += 1;
        if (!current) continue;
        await worker(current);
      }
    }),
  );
}

function coercePreferences(row: Record<string, unknown> | undefined): UserNotificationPreferences {
  if (!row) return getDefaultPreferences();
  return {
    emailAnnouncements: (row['emailAnnouncements'] as boolean | undefined) ?? true,
    emailDocuments: (row['emailDocuments'] as boolean | undefined) ?? true,
    emailMeetings: (row['emailMeetings'] as boolean | undefined) ?? true,
    emailMaintenance: (row['emailMaintenance'] as boolean | undefined) ?? true,
    emailFrequency:
      (row['emailFrequency'] as 'immediate' | 'daily_digest' | 'weekly_digest' | 'never' | undefined)
      ?? 'immediate',
  };
}

async function markRowSent(row: ClaimedRow, providerMessageId: string, now: Date): Promise<void> {
  const scoped = createScopedClient(row.communityId);
  await scoped.update(
    notificationDigestQueue,
    {
      status: 'sent',
      attemptCount: row.attemptCount + 1,
      lastAttemptedAt: now,
      processingStartedAt: null,
      nextAttemptAt: now,
      errorMessage: null,
    },
    eq(notificationDigestQueue.id, row.id),
  );

  if (row.sourceType === 'announcement') {
    const announcementId = Number(row.sourceId);
    if (Number.isInteger(announcementId)) {
      await updateQueuedDigestAnnouncementStatus(row.communityId, announcementId, row.userId, {
        status: 'sent',
        providerMessageId,
      });
    }
  }
}

async function markRowDiscarded(row: ClaimedRow, reason: string, now: Date): Promise<void> {
  const scoped = createScopedClient(row.communityId);
  await scoped.update(
    notificationDigestQueue,
    {
      status: 'discarded',
      errorMessage: reason,
      lastAttemptedAt: now,
      processingStartedAt: null,
      nextAttemptAt: now,
    },
    eq(notificationDigestQueue.id, row.id),
  );

  if (row.sourceType === 'announcement') {
    const announcementId = Number(row.sourceId);
    if (Number.isInteger(announcementId)) {
      await updateQueuedDigestAnnouncementStatus(row.communityId, announcementId, row.userId, {
        status: 'discarded',
        errorMessage: reason,
      });
    }
  }
}

async function markRowFailedOrRetry(row: ClaimedRow, errorMessage: string, now: Date): Promise<'failed' | 'retried'> {
  const scoped = createScopedClient(row.communityId);
  const nextAttemptCount = row.attemptCount + 1;
  const terminal = nextAttemptCount >= MAX_ATTEMPTS;

  if (terminal) {
    await scoped.update(
      notificationDigestQueue,
      {
        status: 'failed',
        attemptCount: nextAttemptCount,
        errorMessage,
        lastAttemptedAt: now,
        processingStartedAt: null,
      },
      eq(notificationDigestQueue.id, row.id),
    );

    if (row.sourceType === 'announcement') {
      const announcementId = Number(row.sourceId);
      if (Number.isInteger(announcementId)) {
        await updateQueuedDigestAnnouncementStatus(row.communityId, announcementId, row.userId, {
          status: 'failed',
          errorMessage,
        });
      }
    }

    return 'failed';
  }

  const backoffMinutes = getBackoffMinutes(nextAttemptCount);
  await scoped.update(
    notificationDigestQueue,
    {
      status: 'pending',
      attemptCount: nextAttemptCount,
      errorMessage,
      lastAttemptedAt: now,
      processingStartedAt: null,
      nextAttemptAt: addMinutes(now, backoffMinutes),
    },
    eq(notificationDigestQueue.id, row.id),
  );
  return 'retried';
}

async function releaseRowForNextTick(row: ClaimedRow, now: Date): Promise<void> {
  const scoped = createScopedClient(row.communityId);
  await scoped.update(
    notificationDigestQueue,
    {
      status: 'pending',
      processingStartedAt: null,
      nextAttemptAt: now,
    },
    eq(notificationDigestQueue.id, row.id),
  );
}

export async function processNotificationDigests(
  options: DigestProcessorOptions = {},
): Promise<DigestProcessorSummary> {
  const now = options.now ?? new Date();
  const communityLimit = options.communityLimit ?? DEFAULT_COMMUNITY_LIMIT;
  const rowsPerCommunity = options.rowsPerCommunity ?? DEFAULT_ROWS_PER_COMMUNITY;
  const emailsPerTick = options.emailsPerTick ?? DEFAULT_EMAILS_PER_TICK;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const processingTimeoutMinutes =
    options.processingTimeoutMinutes ?? DEFAULT_PROCESSING_TIMEOUT_MINUTES;
  const staleBefore = addMinutes(now, -processingTimeoutMinutes);

  const summary: DigestProcessorSummary = {
    communitiesScanned: 0,
    communitiesProcessed: 0,
    rowsClaimed: 0,
    rowsSent: 0,
    rowsFailed: 0,
    rowsDiscarded: 0,
    rowsRetried: 0,
    emailsSent: 0,
    hasMore: false,
  };

  const candidateCommunityIds = await findCandidateDigestCommunityIds({
    now,
    staleBefore,
    limit: communityLimit,
  });
  summary.communitiesScanned = candidateCommunityIds.length;
  let emailBudgetRemaining = emailsPerTick;

  for (const communityId of candidateCommunityIds) {
    if (emailBudgetRemaining <= 0) break;

    const scoped = createScopedClient(communityId);
    const communityRows = await scoped.query(communities);
    const community = communityRows.find((row) => row['id'] === communityId);
    const timezone =
      typeof community?.['timezone'] === 'string' ? (community['timezone'] as string) : DEFAULT_TIMEZONE;
    const localParts = toLocalTimeParts(now, timezone);
    if (localParts.hour !== 8) continue;

    const frequencies: DigestFrequency[] = ['daily_digest'];
    if (localParts.weekday === 'Mon') {
      frequencies.push('weekly_digest');
    }

    const claimedRows = (await claimDigestQueueRows({
      communityId,
      frequencies,
      now,
      staleBefore,
      limit: rowsPerCommunity,
    })) as ClaimedRow[];

    summary.rowsClaimed += claimedRows.length;
    if (claimedRows.length === 0) continue;

    summary.communitiesProcessed += 1;

    const userRows = await scoped.query(users);
    const preferenceRows = await scoped.query(notificationPreferences);
    const usersById = new Map<string, Record<string, unknown>>();
    for (const row of userRows) {
      const userId = row['id'];
      if (typeof userId === 'string') usersById.set(userId, row);
    }
    const prefsByUserId = new Map<string, Record<string, unknown>>();
    for (const row of preferenceRows) {
      const userId = row['userId'];
      if (typeof userId === 'string') prefsByUserId.set(userId, row);
    }

    const branding = {
      communityName:
        typeof community?.['name'] === 'string' ? (community['name'] as string) : 'PropertyPro',
    };
    const baseUrl = getBaseUrl();
    const unsubscribeUrl = `${baseUrl}/settings?communityId=${communityId}`;
    const portalUrl = `${baseUrl}/dashboard?communityId=${communityId}`;

    const groups = groupRowsByRecipientAndFrequency(claimedRows);
    await runWithConcurrency(groups, concurrency, async (groupRows) => {
      if (emailBudgetRemaining <= 0) {
        await Promise.all(groupRows.map((row) => releaseRowForNextTick(row, now)));
        return;
      }
      const first = groupRows[0];
      if (!first) return;

      const user = usersById.get(first.userId);
      if (!user) {
        await Promise.all(groupRows.map((row) => markRowDiscarded(row, 'Recipient not found', now)));
        summary.rowsDiscarded += groupRows.length;
        return;
      }

      if (user['deletedAt'] != null) {
        await Promise.all(groupRows.map((row) => markRowDiscarded(row, 'Recipient inactive', now)));
        summary.rowsDiscarded += groupRows.length;
        return;
      }

      const email = user['email'];
      const fullName = user['fullName'];
      if (typeof email !== 'string' || typeof fullName !== 'string') {
        await Promise.all(groupRows.map((row) => markRowDiscarded(row, 'Recipient missing email', now)));
        summary.rowsDiscarded += groupRows.length;
        return;
      }

      const prefs = coercePreferences(prefsByUserId.get(first.userId));
      if (prefs.emailFrequency !== first.frequency) {
        await Promise.all(groupRows.map((row) => markRowDiscarded(row, 'Preference changed', now)));
        summary.rowsDiscarded += groupRows.length;
        return;
      }

      const eligibleRows: ClaimedRow[] = [];
      for (const row of groupRows) {
        const kind = mapEventTypeToKind(row.eventType);
        if (!kind || !isNotificationTypeEnabled(kind, prefs)) {
          await markRowDiscarded(row, 'Preference disallows notification', now);
          summary.rowsDiscarded += 1;
          continue;
        }
        eligibleRows.push(row);
      }

      if (eligibleRows.length === 0) return;

      try {
        emailBudgetRemaining -= 1;
        const result = await sendEmail({
          to: email,
          subject: `${frequencyLabel(first.frequency)} digest from ${branding.communityName}`,
          category: 'non-transactional',
          unsubscribeUrl,
          react: createElement(NotificationDigestEmail, {
            branding,
            recipientName: fullName,
            frequency: first.frequency,
            portalUrl,
            items: eligibleRows.map((row) => ({
              title: row.eventTitle,
              summary: row.eventSummary ?? undefined,
              actionUrl: row.actionUrl ?? undefined,
            })),
          }),
        });

        await Promise.all(eligibleRows.map((row) => markRowSent(row, result.id, now)));
        summary.rowsSent += eligibleRows.length;
        summary.emailsSent += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        for (const row of eligibleRows) {
          const outcome = await markRowFailedOrRetry(row, message, now);
          if (outcome === 'failed') summary.rowsFailed += 1;
          else summary.rowsRetried += 1;
        }
      }
    });
  }

  summary.hasMore = await hasMoreDigestRows({ now, staleBefore });
  return summary;
}
