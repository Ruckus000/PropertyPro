import { createElement, type ReactElement } from 'react';
import { addDays } from 'date-fns';
import type {
  CommunityType,
  ManagerPermissions,
  NewCommunityRole,
} from '@propertypro/shared';
import {
  assessmentLineItems,
  assessments,
  calendarEventReminderLog,
  communities,
  createScopedClient,
  meetings,
  notificationPreferences,
  units,
  userRoles,
  users,
} from '@propertypro/db';
import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
} from '@propertypro/db/filters';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { CalendarEventReminderEmail, sendEmail } from '@propertypro/email';
import { checkPermissionV2 } from '@/lib/db/access-control';
import {
  getCalendarReminderLeadDays,
  getDefaultPreferences,
  type CalendarReminderPreset,
  type UserNotificationPreferences,
} from '@/lib/utils/email-preferences';
import {
  dateOnlyToUtcStart,
  utcDateToWallClockValue,
  wallClockValueToUtcDate,
} from '@/lib/utils/zoned-datetime';
import { resolveTimezone } from '@/lib/utils/timezone';
import {
  listAggregateAssessmentDueRecords,
  listCommunityCalendarMeetings,
} from '@/lib/services/calendar-data-service';
import { requireCommunityType, requireNewCommunityRole } from '@/lib/utils/community-validators';
import { formatMeetingTitle } from '@/lib/utils/format-meeting-title';

const MAX_ATTEMPTS = 5;
const RETRY_MINUTES_BY_ATTEMPT = [15, 60, 240, 720] as const;
const DEFAULT_LOOKBACK_MINUTES = 30;
const DEFAULT_PROCESSING_TIMEOUT_MINUTES = 20;
const DEFAULT_CLAIM_LIMIT = 500;
const DAY_MS = 86_400_000;
const OPEN_ASSESSMENT_STATUSES = ['pending', 'overdue'] as const;

/** @internal exported for testing */
export type ReminderEventKind = 'meeting' | 'my_assessment_due' | 'assessment_due';

interface ActiveCommunity {
  id: number;
  name: string;
  timezone: string;
  communityType: CommunityType;
}

interface CommunityRoleRow {
  [key: string]: unknown;
  userId: string;
  role: NewCommunityRole;
  isUnitOwner: boolean;
  permissions: ManagerPermissions | null;
  unitId: number | null;
}

interface CommunityUserRow {
  [key: string]: unknown;
  id: string;
  email: string;
  fullName: string;
}

interface CommunityPreferenceRow {
  [key: string]: unknown;
  userId: string;
  emailFrequency: string;
  emailAnnouncements: boolean;
  emailMeetings: boolean;
  calendarReminderPreset: CalendarReminderPreset;
  calendarReminderMeetings: boolean;
  calendarReminderPersonalAssessments: boolean;
  calendarReminderCommunityAssessments: boolean;
  inAppEnabled: boolean;
  inAppAnnouncements: boolean;
  inAppDocuments: boolean;
  inAppMeetings: boolean;
  inAppMaintenance: boolean;
  inAppViolations: boolean;
  inAppElections: boolean;
}

/** @internal exported for testing */
export interface CommunityRecipient {
  userId: string;
  email: string;
  fullName: string;
  role: NewCommunityRole;
  isUnitOwner: boolean;
  isAdmin: boolean;
  unitId: number | null;
  permissions?: ManagerPermissions;
  preferences: UserNotificationPreferences;
  canReadMeetings: boolean;
  canReadFinances: boolean;
}

interface OwnerAssessmentLineItemRow {
  [key: string]: unknown;
  id: number;
  assessmentId: number | null;
  unitId: number;
  amountCents: number;
  lateFeeCents: number;
  dueDate: string;
  status: (typeof OPEN_ASSESSMENT_STATUSES)[number];
}

interface AssessmentTitleRow {
  [key: string]: unknown;
  id: number;
  title: string;
}

interface UnitLabelRow {
  [key: string]: unknown;
  id: number;
  unitNumber: string;
  building: string | null;
}

interface MeetingRow {
  [key: string]: unknown;
  id: number;
  title: string;
  meetingType: string;
  startsAt: Date;
  location: string;
}

interface ClaimedReminderRow {
  id: number;
  communityId: number;
  userId: string;
  eventKind: ReminderEventKind;
  eventKey: string;
  reminderPreset: CalendarReminderPreset;
  attemptCount: number;
}

interface ReminderEmailPayload {
  subject: string;
  react: ReactElement;
}

export interface CalendarEventReminderProcessorOptions {
  now?: Date;
  lookbackMinutes?: number;
  processingTimeoutMinutes?: number;
  claimLimit?: number;
}

export interface CalendarEventReminderProcessorSummary {
  communitiesScanned: number;
  rowsEnqueued: number;
  rowsClaimed: number;
  rowsSent: number;
  rowsDiscarded: number;
  rowsRetried: number;
  rowsFailed: number;
  emailsSent: number;
  errors: number;
  hasMore: boolean;
}

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function humanizeReminderPreset(preset: CalendarReminderPreset): string {
  switch (preset) {
    case 'morning_of':
      return 'Morning of';
    case '1_day_before':
      return '1 day before';
    case '3_days_before':
      return '3 days before';
    case '7_days_before':
      return '7 days before';
    case 'off':
    default:
      return 'Off';
  }
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function formatMeetingDateLabel(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: resolveTimezone(timezone),
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function formatMeetingTimeLabel(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: resolveTimezone(timezone),
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatDueDateLabel(dateOnly: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: resolveTimezone(timezone),
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(dateOnlyToUtcStart(dateOnly, timezone));
}

function formatUnitLabel(row: UnitLabelRow): string {
  return row.building ? `${row.building} ${row.unitNumber}` : row.unitNumber;
}

/** @internal exported for testing */
export function addDaysToDateOnly(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number);
  const utcDate = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  return addDays(utcDate, days).toISOString().slice(0, 10);
}

/** @internal exported for testing */
export function getMeetingTriggerAt(
  startsAt: Date,
  timezone: string,
  preset: CalendarReminderPreset,
): Date | null {
  const leadDays = getCalendarReminderLeadDays(preset);
  if (leadDays === null) return null;

  if (preset !== 'morning_of') {
    return new Date(startsAt.getTime() - leadDays * DAY_MS);
  }

  const meetingDate = utcDateToWallClockValue(startsAt, timezone).slice(0, 10);
  const morningOf = wallClockValueToUtcDate(`${meetingDate}T09:00`, timezone);
  return morningOf.getTime() < startsAt.getTime() ? morningOf : startsAt;
}

function isTriggerInWindow(triggerAt: Date, windowStart: Date, now: Date): boolean {
  return triggerAt.getTime() > windowStart.getTime() && triggerAt.getTime() <= now.getTime();
}

/** @internal exported for testing */
export function getBackoffMinutes(attemptCount: number): number {
  const index = Math.max(0, Math.min(RETRY_MINUTES_BY_ATTEMPT.length - 1, attemptCount - 1));
  return RETRY_MINUTES_BY_ATTEMPT[index] ?? 720;
}

function coercePreferences(
  row: CommunityPreferenceRow | undefined,
): UserNotificationPreferences {
  const defaults = getDefaultPreferences();
  if (!row) return defaults;

  return {
    emailFrequency:
      (row.emailFrequency as UserNotificationPreferences['emailFrequency'] | undefined)
      ?? defaults.emailFrequency,
    emailAnnouncements: row.emailAnnouncements ?? defaults.emailAnnouncements,
    emailMeetings: row.emailMeetings ?? defaults.emailMeetings,
    calendarReminderPreset: row.calendarReminderPreset ?? defaults.calendarReminderPreset,
    calendarReminderMeetings:
      row.calendarReminderMeetings ?? defaults.calendarReminderMeetings,
    calendarReminderPersonalAssessments:
      row.calendarReminderPersonalAssessments
      ?? defaults.calendarReminderPersonalAssessments,
    calendarReminderCommunityAssessments:
      row.calendarReminderCommunityAssessments
      ?? defaults.calendarReminderCommunityAssessments,
    inAppEnabled: row.inAppEnabled ?? defaults.inAppEnabled,
    inAppAnnouncements: row.inAppAnnouncements ?? defaults.inAppAnnouncements,
    inAppDocuments: row.inAppDocuments ?? defaults.inAppDocuments,
    inAppMeetings: row.inAppMeetings ?? defaults.inAppMeetings,
    inAppMaintenance: row.inAppMaintenance ?? defaults.inAppMaintenance,
    inAppViolations: row.inAppViolations ?? defaults.inAppViolations,
    inAppElections: row.inAppElections ?? defaults.inAppElections,
  };
}

async function loadActiveCommunities(): Promise<ActiveCommunity[]> {
  const db = createUnscopedClient();
  const rows = await db
    .select({
      id: communities.id,
      name: communities.name,
      timezone: communities.timezone,
      communityType: communities.communityType,
    })
    .from(communities)
    .where(isNull(communities.deletedAt))
    .orderBy(asc(communities.id));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    timezone: typeof row.timezone === 'string' ? row.timezone : 'America/New_York',
    communityType: requireCommunityType(
      row.communityType,
      `calendar reminder community ${row.id}`,
    ),
  }));
}

async function loadCommunityRecipients(
  community: ActiveCommunity,
): Promise<Map<string, CommunityRecipient>> {
  const scoped = createScopedClient(community.id);
  const roleRows = await scoped.selectFrom<CommunityRoleRow>(userRoles, {
    userId: userRoles.userId,
    role: userRoles.role,
    isUnitOwner: userRoles.isUnitOwner,
    permissions: userRoles.permissions,
    unitId: userRoles.unitId,
  });

  if (roleRows.length === 0) {
    return new Map();
  }

  const userIds = [...new Set(roleRows.map((row) => row.userId))];
  const [userRows, preferenceRows] = await Promise.all([
    scoped.selectFrom<CommunityUserRow>(
      users,
      {
        id: users.id,
        email: users.email,
        fullName: users.fullName,
      },
      inArray(users.id, userIds),
    ),
    scoped.selectFrom<CommunityPreferenceRow>(notificationPreferences, {
      userId: notificationPreferences.userId,
      emailFrequency: notificationPreferences.emailFrequency,
      emailAnnouncements: notificationPreferences.emailAnnouncements,
      emailMeetings: notificationPreferences.emailMeetings,
      calendarReminderPreset: notificationPreferences.calendarReminderPreset,
      calendarReminderMeetings: notificationPreferences.calendarReminderMeetings,
      calendarReminderPersonalAssessments:
        notificationPreferences.calendarReminderPersonalAssessments,
      calendarReminderCommunityAssessments:
        notificationPreferences.calendarReminderCommunityAssessments,
      inAppEnabled: notificationPreferences.inAppEnabled,
      inAppAnnouncements: notificationPreferences.inAppAnnouncements,
      inAppDocuments: notificationPreferences.inAppDocuments,
      inAppMeetings: notificationPreferences.inAppMeetings,
      inAppMaintenance: notificationPreferences.inAppMaintenance,
      inAppViolations: notificationPreferences.inAppViolations,
      inAppElections: notificationPreferences.inAppElections,
    }),
  ]);

  const usersById = new Map(userRows.map((row) => [row.id, row]));
  const preferencesByUserId = new Map(preferenceRows.map((row) => [row.userId, row]));
  const recipients = new Map<string, CommunityRecipient>();

  for (const row of roleRows) {
    const user = usersById.get(row.userId);
    if (!user?.email) continue;

    const role = requireNewCommunityRole(
      row.role,
      `calendar reminder role ${community.id}:${row.userId}`,
    );
    const isUnitOwner = row.isUnitOwner === true;
    const permissions = row.permissions ?? undefined;
    const preferences = coercePreferences(preferencesByUserId.get(row.userId));
    recipients.set(row.userId, {
      userId: row.userId,
      email: user.email,
      fullName: user.fullName,
      role,
      isUnitOwner,
      isAdmin: role === 'manager' || role === 'pm_admin',
      unitId: row.unitId,
      permissions,
      preferences,
      canReadMeetings: checkPermissionV2(
        role,
        community.communityType,
        'meetings',
        'read',
        {
          isUnitOwner,
          permissions,
        },
      ),
      canReadFinances: checkPermissionV2(
        role,
        community.communityType,
        'finances',
        'read',
        {
          isUnitOwner,
          permissions,
        },
      ),
    });
  }

  return recipients;
}

/** @internal exported for testing */
export function isEligibleForEventKind(
  recipient: CommunityRecipient,
  eventKind: ReminderEventKind,
): boolean {
  if (recipient.preferences.calendarReminderPreset === 'off') return false;

  if (eventKind === 'meeting') {
    return recipient.canReadMeetings && recipient.preferences.calendarReminderMeetings;
  }

  if (eventKind === 'my_assessment_due') {
    return recipient.role === 'resident'
      && recipient.isUnitOwner
      && recipient.canReadFinances
      && recipient.unitId !== null
      && recipient.preferences.calendarReminderPersonalAssessments;
  }

  return recipient.isAdmin
    && recipient.canReadFinances
    && recipient.preferences.calendarReminderCommunityAssessments;
}

function parseMeetingEventKey(value: string): { meetingId: number; startsAtIso: string } | null {
  const [kind, idRaw, startsAtIso] = value.split(':');
  const meetingId = Number(idRaw);
  if (kind !== 'meeting' || !Number.isInteger(meetingId) || !startsAtIso) {
    return null;
  }
  return { meetingId, startsAtIso };
}

function parseAssessmentEventKey(value: string): { assessmentId: number; dueDate: string } | null {
  const [kind, idRaw, dueDate] = value.split(':');
  const assessmentId = Number(idRaw);
  if (kind !== 'assessment_due' || !Number.isInteger(assessmentId) || !dueDate) {
    return null;
  }
  return { assessmentId, dueDate };
}

function parseMyAssessmentEventKey(value: string): { lineItemId: number; dueDate: string } | null {
  const [kind, idRaw, dueDate] = value.split(':');
  const lineItemId = Number(idRaw);
  if (kind !== 'my_assessment_due' || !Number.isInteger(lineItemId) || !dueDate) {
    return null;
  }
  return { lineItemId, dueDate };
}

async function enqueueReminderRows(params: {
  community: ActiveCommunity;
  recipients: CommunityRecipient[];
  now: Date;
  windowStart: Date;
}): Promise<number> {
  const db = createUnscopedClient();
  const candidates: Array<typeof calendarEventReminderLog.$inferInsert> = [];

  const meetingRecipients = params.recipients.filter((recipient) =>
    isEligibleForEventKind(recipient, 'meeting'),
  );
  if (meetingRecipients.length > 0) {
    const maxLeadDays = Math.max(
      ...meetingRecipients
        .map((recipient) => getCalendarReminderLeadDays(recipient.preferences.calendarReminderPreset))
        .filter((value): value is number => value !== null),
    );
    const meetingRows = await listCommunityCalendarMeetings(params.community.id, {
      startUtc: params.windowStart,
      endUtcExclusive: new Date(
        params.now.getTime() + maxLeadDays * DAY_MS + DEFAULT_LOOKBACK_MINUTES * 60 * 1000,
      ),
    });

    for (const meeting of meetingRows) {
      const startsAt = meeting.startsAt instanceof Date
        ? meeting.startsAt
        : new Date(meeting.startsAt);
      for (const recipient of meetingRecipients) {
        const triggerAt = getMeetingTriggerAt(
          startsAt,
          params.community.timezone,
          recipient.preferences.calendarReminderPreset,
        );
        if (!triggerAt) continue;
        if (!isTriggerInWindow(triggerAt, params.windowStart, params.now)) continue;

        candidates.push({
          communityId: params.community.id,
          userId: recipient.userId,
          eventKind: 'meeting',
          eventKey: `meeting:${meeting.id}:${startsAt.toISOString()}`,
          reminderPreset: recipient.preferences.calendarReminderPreset,
          nextAttemptAt: params.now,
        });
      }
    }
  }

  const aggregateRecipients = params.recipients.filter((recipient) =>
    isEligibleForEventKind(recipient, 'assessment_due'),
  );
  if (aggregateRecipients.length > 0) {
    const timezone = params.community.timezone;
    const todayLocal = utcDateToWallClockValue(params.now, timezone).slice(0, 10);
    const maxLeadDays = Math.max(
      ...aggregateRecipients
        .map((recipient) => getCalendarReminderLeadDays(recipient.preferences.calendarReminderPreset))
        .filter((value): value is number => value !== null),
    );
    const assessmentRows = await listAggregateAssessmentDueRecords(params.community.id, {
      start: todayLocal,
      end: addDaysToDateOnly(todayLocal, maxLeadDays),
    });

    for (const assessment of assessmentRows) {
      for (const recipient of aggregateRecipients) {
        const leadDays = getCalendarReminderLeadDays(recipient.preferences.calendarReminderPreset);
        if (leadDays === null) continue;
        const triggerDate = addDaysToDateOnly(assessment.dueDate, -leadDays);
        const triggerAt = wallClockValueToUtcDate(`${triggerDate}T09:00`, timezone);
        if (!isTriggerInWindow(triggerAt, params.windowStart, params.now)) continue;

        candidates.push({
          communityId: params.community.id,
          userId: recipient.userId,
          eventKind: 'assessment_due',
          eventKey: `assessment_due:${assessment.assessmentId}:${assessment.dueDate}`,
          reminderPreset: recipient.preferences.calendarReminderPreset,
          nextAttemptAt: params.now,
        });
      }
    }
  }

  const ownerRecipients = params.recipients.filter((recipient) =>
    isEligibleForEventKind(recipient, 'my_assessment_due'),
  );
  if (ownerRecipients.length > 0) {
    const timezone = params.community.timezone;
    const todayLocal = utcDateToWallClockValue(params.now, timezone).slice(0, 10);
    const maxLeadDays = Math.max(
      ...ownerRecipients
        .map((recipient) => getCalendarReminderLeadDays(recipient.preferences.calendarReminderPreset))
        .filter((value): value is number => value !== null),
    );
    const ownerUnitIds = [
      ...new Set(
        ownerRecipients
          .map((recipient) => recipient.unitId)
          .filter((value): value is number => Number.isInteger(value)),
      ),
    ];

    if (ownerUnitIds.length > 0) {
      const scoped = createScopedClient(params.community.id);
      const lineItems = await scoped
        .selectFrom<OwnerAssessmentLineItemRow>(
          assessmentLineItems,
          {
            id: assessmentLineItems.id,
            assessmentId: assessmentLineItems.assessmentId,
            unitId: assessmentLineItems.unitId,
            amountCents: assessmentLineItems.amountCents,
            lateFeeCents: assessmentLineItems.lateFeeCents,
            dueDate: assessmentLineItems.dueDate,
            status: assessmentLineItems.status,
          },
          and(
            inArray(assessmentLineItems.unitId, ownerUnitIds),
            inArray(assessmentLineItems.status, [...OPEN_ASSESSMENT_STATUSES]),
            gte(assessmentLineItems.dueDate, todayLocal),
            lte(assessmentLineItems.dueDate, addDaysToDateOnly(todayLocal, maxLeadDays)),
          ),
        )
        .orderBy(asc(assessmentLineItems.dueDate), asc(assessmentLineItems.id));

      const recipientsByUnitId = new Map<number, CommunityRecipient[]>();
      for (const recipient of ownerRecipients) {
        if (recipient.unitId === null) continue;
        const existing = recipientsByUnitId.get(recipient.unitId) ?? [];
        existing.push(recipient);
        recipientsByUnitId.set(recipient.unitId, existing);
      }

      for (const lineItem of lineItems) {
        const unitRecipients = recipientsByUnitId.get(lineItem.unitId) ?? [];
        for (const recipient of unitRecipients) {
          const leadDays = getCalendarReminderLeadDays(recipient.preferences.calendarReminderPreset);
          if (leadDays === null) continue;
          const triggerDate = addDaysToDateOnly(lineItem.dueDate, -leadDays);
          const triggerAt = wallClockValueToUtcDate(`${triggerDate}T09:00`, timezone);
          if (!isTriggerInWindow(triggerAt, params.windowStart, params.now)) continue;

          candidates.push({
            communityId: params.community.id,
            userId: recipient.userId,
            eventKind: 'my_assessment_due',
            eventKey: `my_assessment_due:${lineItem.id}:${lineItem.dueDate}`,
            reminderPreset: recipient.preferences.calendarReminderPreset,
            nextAttemptAt: params.now,
          });
        }
      }
    }
  }

  if (candidates.length === 0) return 0;

  const inserted = await db
    .insert(calendarEventReminderLog)
    .values(candidates)
    .onConflictDoNothing({
      target: [
        calendarEventReminderLog.communityId,
        calendarEventReminderLog.userId,
        calendarEventReminderLog.eventKind,
        calendarEventReminderLog.eventKey,
        calendarEventReminderLog.reminderPreset,
      ],
    })
    .returning({ id: calendarEventReminderLog.id });

  return inserted.length;
}

async function claimReminderRows(params: {
  now: Date;
  staleBefore: Date;
  limit: number;
}): Promise<ClaimedReminderRow[]> {
  const db = createUnscopedClient();
  const dueRows = await db
    .select({ id: calendarEventReminderLog.id })
    .from(calendarEventReminderLog)
    .where(
      or(
        and(
          eq(calendarEventReminderLog.status, 'pending'),
          lte(calendarEventReminderLog.nextAttemptAt, params.now),
        ),
        and(
          eq(calendarEventReminderLog.status, 'processing'),
          isNotNull(calendarEventReminderLog.processingStartedAt),
          lt(calendarEventReminderLog.processingStartedAt, params.staleBefore),
        ),
      ),
    )
    .orderBy(asc(calendarEventReminderLog.nextAttemptAt), asc(calendarEventReminderLog.createdAt))
    .limit(params.limit);

  if (dueRows.length === 0) return [];

  const ids = dueRows.map((row) => row.id);
  return db
    .update(calendarEventReminderLog)
    .set({
      status: 'processing',
      processingStartedAt: params.now,
      updatedAt: params.now,
    })
    .where(
      and(
        inArray(calendarEventReminderLog.id, ids),
        or(
          and(
            eq(calendarEventReminderLog.status, 'pending'),
            lte(calendarEventReminderLog.nextAttemptAt, params.now),
          ),
          and(
            eq(calendarEventReminderLog.status, 'processing'),
            isNotNull(calendarEventReminderLog.processingStartedAt),
            lt(calendarEventReminderLog.processingStartedAt, params.staleBefore),
          ),
        ),
      ),
    )
    .returning({
      id: calendarEventReminderLog.id,
      communityId: calendarEventReminderLog.communityId,
      userId: calendarEventReminderLog.userId,
      eventKind: calendarEventReminderLog.eventKind,
      eventKey: calendarEventReminderLog.eventKey,
      reminderPreset: calendarEventReminderLog.reminderPreset,
      attemptCount: calendarEventReminderLog.attemptCount,
    }) as Promise<ClaimedReminderRow[]>;
}

async function hasMoreReminderRows(params: {
  now: Date;
  staleBefore: Date;
}): Promise<boolean> {
  const db = createUnscopedClient();
  const rows = await db
    .select({ id: calendarEventReminderLog.id })
    .from(calendarEventReminderLog)
    .where(
      or(
        and(
          eq(calendarEventReminderLog.status, 'pending'),
          lte(calendarEventReminderLog.nextAttemptAt, params.now),
        ),
        and(
          eq(calendarEventReminderLog.status, 'processing'),
          isNotNull(calendarEventReminderLog.processingStartedAt),
          lt(calendarEventReminderLog.processingStartedAt, params.staleBefore),
        ),
      ),
    )
    .limit(1);

  return rows.length > 0;
}

async function markRowSent(row: ClaimedReminderRow, providerMessageId: string, now: Date): Promise<void> {
  const scoped = createScopedClient(row.communityId);
  await scoped.update(
    calendarEventReminderLog,
    {
      status: 'sent',
      attemptCount: row.attemptCount + 1,
      sentAt: now,
      lastAttemptedAt: now,
      processingStartedAt: null,
      errorMessage: null,
      providerMessageId,
      nextAttemptAt: now,
    },
    eq(calendarEventReminderLog.id, row.id),
  );
}

async function markRowDiscarded(row: ClaimedReminderRow, reason: string, now: Date): Promise<void> {
  const scoped = createScopedClient(row.communityId);
  await scoped.update(
    calendarEventReminderLog,
    {
      status: 'discarded',
      errorMessage: reason,
      lastAttemptedAt: now,
      processingStartedAt: null,
      nextAttemptAt: now,
    },
    eq(calendarEventReminderLog.id, row.id),
  );
}

async function markRowFailedOrRetry(
  row: ClaimedReminderRow,
  errorMessage: string,
  now: Date,
): Promise<'failed' | 'retried'> {
  const scoped = createScopedClient(row.communityId);
  const nextAttemptCount = row.attemptCount + 1;
  const terminal = nextAttemptCount >= MAX_ATTEMPTS;

  if (terminal) {
    await scoped.update(
      calendarEventReminderLog,
      {
        status: 'failed',
        attemptCount: nextAttemptCount,
        errorMessage,
        lastAttemptedAt: now,
        processingStartedAt: null,
      },
      eq(calendarEventReminderLog.id, row.id),
    );
    return 'failed';
  }

  await scoped.update(
    calendarEventReminderLog,
    {
      status: 'pending',
      attemptCount: nextAttemptCount,
      errorMessage,
      lastAttemptedAt: now,
      processingStartedAt: null,
      nextAttemptAt: addMinutes(now, getBackoffMinutes(nextAttemptCount)),
    },
    eq(calendarEventReminderLog.id, row.id),
  );
  return 'retried';
}

async function buildMeetingEmailPayload(params: {
  community: ActiveCommunity;
  recipient: CommunityRecipient;
  eventKey: string;
  reminderPreset: CalendarReminderPreset;
  now: Date;
}): Promise<ReminderEmailPayload | null> {
  const parsed = parseMeetingEventKey(params.eventKey);
  if (!parsed) return null;

  const scoped = createScopedClient(params.community.id);
  const rows = await scoped.selectFrom<MeetingRow>(
    meetings,
    {
      id: meetings.id,
      title: meetings.title,
      meetingType: meetings.meetingType,
      startsAt: meetings.startsAt,
      location: meetings.location,
    },
    eq(meetings.id, parsed.meetingId),
  );
  const meeting = rows[0];
  if (!meeting) return null;
  if (meeting.startsAt.toISOString() !== parsed.startsAtIso) return null;
  if (meeting.startsAt.getTime() <= params.now.getTime()) return null;

  const eventDateLabel = formatMeetingDateLabel(meeting.startsAt, params.community.timezone);
  const eventTimeLabel = formatMeetingTimeLabel(meeting.startsAt, params.community.timezone);
  const meetingTitle = formatMeetingTitle(meeting.title);
  const baseUrl = getBaseUrl();
  const detailLines = [`${meeting.meetingType} meeting`, meeting.location].filter(
    (line) => line.trim().length > 0,
  );

  return {
    subject: `Reminder: ${meetingTitle} on ${eventDateLabel}`,
    react: createElement(CalendarEventReminderEmail, {
      branding: { communityName: params.community.name },
      recipientName: params.recipient.fullName ?? params.recipient.email,
      eventLabel: 'Meeting',
      eventTitle: meetingTitle,
      reminderTimingLabel: humanizeReminderPreset(params.reminderPreset),
      eventDateLabel,
      eventTimeLabel,
      detailLines,
      ctaLabel: 'View meetings',
      ctaUrl: `${baseUrl}/meetings?communityId=${params.community.id}`,
    }),
  };
}

async function buildAggregateAssessmentEmailPayload(params: {
  community: ActiveCommunity;
  recipient: CommunityRecipient;
  eventKey: string;
  reminderPreset: CalendarReminderPreset;
  now: Date;
}): Promise<ReminderEmailPayload | null> {
  const parsed = parseAssessmentEventKey(params.eventKey);
  if (!parsed) return null;

  const todayLocal = utcDateToWallClockValue(params.now, params.community.timezone).slice(0, 10);
  if (parsed.dueDate < todayLocal) return null;

  const records = await listAggregateAssessmentDueRecords(params.community.id, {
    start: parsed.dueDate,
    end: parsed.dueDate,
  });
  const assessment = records.find((record) => record.assessmentId === parsed.assessmentId);
  if (!assessment) return null;

  const eventDateLabel = formatDueDateLabel(assessment.dueDate, params.community.timezone);
  const baseUrl = getBaseUrl();

  return {
    subject: `Reminder: ${assessment.assessmentTitle} due ${eventDateLabel}`,
    react: createElement(CalendarEventReminderEmail, {
      branding: { communityName: params.community.name },
      recipientName: params.recipient.fullName ?? params.recipient.email,
      eventLabel: 'Assessment due date',
      eventTitle: assessment.assessmentTitle,
      reminderTimingLabel: humanizeReminderPreset(params.reminderPreset),
      eventDateLabel,
      detailLines: [
        `${assessment.unitCount} units with open balances`,
        `${formatCurrency(assessment.totalAmountCents)} total open balance`,
      ],
      ctaLabel: 'Review finance',
      ctaUrl: `${baseUrl}/finance?communityId=${params.community.id}`,
    }),
  };
}

async function buildOwnerAssessmentEmailPayload(params: {
  community: ActiveCommunity;
  recipient: CommunityRecipient;
  eventKey: string;
  reminderPreset: CalendarReminderPreset;
  now: Date;
}): Promise<ReminderEmailPayload | null> {
  const parsed = parseMyAssessmentEventKey(params.eventKey);
  if (!parsed || params.recipient.unitId === null) return null;

  const todayLocal = utcDateToWallClockValue(params.now, params.community.timezone).slice(0, 10);
  if (parsed.dueDate < todayLocal) return null;

  const scoped = createScopedClient(params.community.id);
  const lineItemRows = await scoped.selectFrom<OwnerAssessmentLineItemRow>(
    assessmentLineItems,
    {
      id: assessmentLineItems.id,
      assessmentId: assessmentLineItems.assessmentId,
      unitId: assessmentLineItems.unitId,
      amountCents: assessmentLineItems.amountCents,
      lateFeeCents: assessmentLineItems.lateFeeCents,
      dueDate: assessmentLineItems.dueDate,
      status: assessmentLineItems.status,
    },
    eq(assessmentLineItems.id, parsed.lineItemId),
  );
  const lineItem = lineItemRows[0];
  if (!lineItem) return null;
  if (lineItem.dueDate !== parsed.dueDate) return null;
  if (!OPEN_ASSESSMENT_STATUSES.includes(lineItem.status)) return null;
  if (lineItem.unitId !== params.recipient.unitId) return null;

  const [assessmentRows, unitRows] = await Promise.all([
    lineItem.assessmentId
      ? scoped.selectFrom<AssessmentTitleRow>(
          assessments,
          {
            id: assessments.id,
            title: assessments.title,
          },
          eq(assessments.id, lineItem.assessmentId),
        )
      : Promise.resolve([] as AssessmentTitleRow[]),
    scoped.selectFrom<UnitLabelRow>(
      units,
      {
        id: units.id,
        unitNumber: units.unitNumber,
        building: units.building,
      },
      eq(units.id, lineItem.unitId),
    ),
  ]);

  const assessmentTitle = assessmentRows[0]?.title ?? 'Assessment Due';
  const unitLabel = unitRows[0] ? formatUnitLabel(unitRows[0]) : `Unit ${lineItem.unitId}`;
  const eventDateLabel = formatDueDateLabel(lineItem.dueDate, params.community.timezone);
  const totalAmount = lineItem.amountCents + lineItem.lateFeeCents;
  const baseUrl = getBaseUrl();

  return {
    subject: `Reminder: ${assessmentTitle} due ${eventDateLabel}`,
    react: createElement(CalendarEventReminderEmail, {
      branding: { communityName: params.community.name },
      recipientName: params.recipient.fullName ?? params.recipient.email,
      eventLabel: 'Assessment due date',
      eventTitle: assessmentTitle,
      reminderTimingLabel: humanizeReminderPreset(params.reminderPreset),
      eventDateLabel,
      detailLines: [unitLabel, `${formatCurrency(totalAmount)} due`],
      ctaLabel: 'View payments',
      ctaUrl: `${baseUrl}/payments?communityId=${params.community.id}`,
    }),
  };
}

async function buildReminderEmailPayload(params: {
  community: ActiveCommunity;
  recipient: CommunityRecipient;
  row: ClaimedReminderRow;
  now: Date;
}): Promise<ReminderEmailPayload | null> {
  if (params.row.eventKind === 'meeting') {
    return buildMeetingEmailPayload({
      community: params.community,
      recipient: params.recipient,
      eventKey: params.row.eventKey,
      reminderPreset: params.row.reminderPreset,
      now: params.now,
    });
  }

  if (params.row.eventKind === 'assessment_due') {
    return buildAggregateAssessmentEmailPayload({
      community: params.community,
      recipient: params.recipient,
      eventKey: params.row.eventKey,
      reminderPreset: params.row.reminderPreset,
      now: params.now,
    });
  }

  return buildOwnerAssessmentEmailPayload({
    community: params.community,
    recipient: params.recipient,
    eventKey: params.row.eventKey,
    reminderPreset: params.row.reminderPreset,
    now: params.now,
  });
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

/**
 * Cross-community reminder processor.
 *
 * Authorization contract: callers MUST ensure this only runs from a trusted
 * internal cron route authenticated with a server-side secret before invoking
 * the unscoped database client below.
 */
export async function processCalendarEventReminders(
  options: CalendarEventReminderProcessorOptions = {},
): Promise<CalendarEventReminderProcessorSummary> {
  const now = options.now ?? new Date();
  const lookbackMinutes = options.lookbackMinutes ?? DEFAULT_LOOKBACK_MINUTES;
  const processingTimeoutMinutes =
    options.processingTimeoutMinutes ?? DEFAULT_PROCESSING_TIMEOUT_MINUTES;
  const claimLimit = options.claimLimit ?? DEFAULT_CLAIM_LIMIT;
  const windowStart = addMinutes(now, -lookbackMinutes);
  const staleBefore = addMinutes(now, -processingTimeoutMinutes);

  const communitiesList = await loadActiveCommunities();
  const communitiesById = new Map(communitiesList.map((community) => [community.id, community]));
  const recipientCache = new Map<number, Promise<Map<string, CommunityRecipient>>>();

  const getRecipientsForCommunity = (community: ActiveCommunity) => {
    const cached = recipientCache.get(community.id);
    if (cached) return cached;
    const promise = loadCommunityRecipients(community);
    recipientCache.set(community.id, promise);
    return promise;
  };

  const summary: CalendarEventReminderProcessorSummary = {
    communitiesScanned: communitiesList.length,
    rowsEnqueued: 0,
    rowsClaimed: 0,
    rowsSent: 0,
    rowsDiscarded: 0,
    rowsRetried: 0,
    rowsFailed: 0,
    emailsSent: 0,
    errors: 0,
    hasMore: false,
  };

  for (const community of communitiesList) {
    try {
      const recipients = [...(await getRecipientsForCommunity(community)).values()];
      summary.rowsEnqueued += await enqueueReminderRows({
        community,
        recipients,
        now,
        windowStart,
      });
    } catch (error) {
      console.error(
        '[calendar-event-reminders] failed to enqueue community reminders',
        {
          communityId: community.id,
          error: error instanceof Error ? error.message : String(error),
        },
      );
      summary.errors += 1;
    }
  }

  const claimedRows = await claimReminderRows({
    now,
    staleBefore,
    limit: claimLimit,
  });
  summary.rowsClaimed = claimedRows.length;

  await runWithConcurrency(claimedRows, 8, async (row) => {
    const community = communitiesById.get(row.communityId);
    if (!community) {
      await markRowDiscarded(row, 'community unavailable', now);
      summary.rowsDiscarded += 1;
      return;
    }

    try {
      const recipients = await getRecipientsForCommunity(community);
      const recipient = recipients.get(row.userId);
      if (!recipient) {
        await markRowDiscarded(row, 'recipient unavailable', now);
        summary.rowsDiscarded += 1;
        return;
      }

      if (recipient.preferences.calendarReminderPreset !== row.reminderPreset) {
        await markRowDiscarded(row, 'reminder timing changed', now);
        summary.rowsDiscarded += 1;
        return;
      }

      if (!isEligibleForEventKind(recipient, row.eventKind)) {
        await markRowDiscarded(row, 'reminder disabled or permission changed', now);
        summary.rowsDiscarded += 1;
        return;
      }

      const payload = await buildReminderEmailPayload({
        community,
        recipient,
        row,
        now,
      });
      if (!payload) {
        await markRowDiscarded(row, 'event no longer eligible', now);
        summary.rowsDiscarded += 1;
        return;
      }

      const baseUrl = getBaseUrl();
      const result = await sendEmail({
        to: recipient.email,
        subject: payload.subject,
        react: payload.react,
        category: 'non-transactional',
        unsubscribeUrl: `${baseUrl}/settings?communityId=${community.id}`,
      });

      await markRowSent(row, result.id, now);
      summary.rowsSent += 1;
      summary.emailsSent += 1;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const outcome = await markRowFailedOrRetry(row, errorMessage, now);
      if (outcome === 'failed') summary.rowsFailed += 1;
      else summary.rowsRetried += 1;
      summary.errors += 1;
    }
  });

  summary.hasMore = await hasMoreReminderRows({ now, staleBefore });
  return summary;
}
