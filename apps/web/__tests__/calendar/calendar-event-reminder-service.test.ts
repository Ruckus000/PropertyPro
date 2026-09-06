import { describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/pg-proxy';
import {
  notificationPreferences,
  userRoles,
  users,
  assessmentLineItems,
  assessments,
  units,
  meetings,
} from '@propertypro/db';
import { and, eq, gte, inArray, lte } from '@propertypro/db/filters';
import {
  addDaysToDateOnly,
  getBackoffMinutes,
  getMeetingTriggerAt,
  isEligibleForEventKind,
  type CommunityRecipient,
} from '@/lib/services/calendar-event-reminder-service';
import { getDefaultPreferences } from '@/lib/utils/email-preferences';

/**
 * Regression guard for PR #122 `loadCommunityRecipients` bug: the
 * `notification_preferences` projection had `userId: userRoles.userId`,
 * which produced SQL referencing `user_roles.user_id` with no `user_roles`
 * in the FROM clause and crashed `.toSQL()`. These tests rebuild each
 * projection through Drizzle's real SQL builder; a repeat of that mistake
 * would throw "field references a column ... not part of the query".
 */
describe('calendar-event-reminder-service SQL-shape regression', () => {
  const db = drizzle(async () => ({ rows: [] }));

  it('builds notification_preferences projection with no cross-table column refs', () => {
    const sql = db
      .select({
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
      })
      .from(notificationPreferences)
      .toSQL();

    expect(sql.sql).toContain('"notification_preferences"');
    expect(sql.sql).not.toContain('"user_roles"');
  });

  it('builds user_roles projection', () => {
    const sql = db
      .select({
        userId: userRoles.userId,
        role: userRoles.role,
        isUnitOwner: userRoles.isUnitOwner,
        unitId: userRoles.unitId,
      })
      .from(userRoles)
      .toSQL();

    expect(sql.sql).toContain('"user_roles"');
    expect(sql.sql).not.toContain('"notification_preferences"');
  });

  it('builds owner line-item projection with multi-predicate where', () => {
    const sql = db
      .select({
        id: assessmentLineItems.id,
        assessmentId: assessmentLineItems.assessmentId,
        unitId: assessmentLineItems.unitId,
        amountCents: assessmentLineItems.amountCents,
        lateFeeCents: assessmentLineItems.lateFeeCents,
        dueDate: assessmentLineItems.dueDate,
        status: assessmentLineItems.status,
      })
      .from(assessmentLineItems)
      .where(
        and(
          inArray(assessmentLineItems.unitId, [1, 2]),
          inArray(assessmentLineItems.status, ['pending', 'overdue']),
          gte(assessmentLineItems.dueDate, '2026-04-21'),
          lte(assessmentLineItems.dueDate, '2026-04-28'),
        ),
      )
      .toSQL();

    expect(sql.sql).toContain('"assessment_line_items"');
  });

  it('builds meeting projection', () => {
    const sql = db
      .select({
        id: meetings.id,
        title: meetings.title,
        meetingType: meetings.meetingType,
        startsAt: meetings.startsAt,
        location: meetings.location,
      })
      .from(meetings)
      .where(eq(meetings.id, 1))
      .toSQL();
    expect(sql.sql).toContain('"meetings"');
    expect(sql.sql).not.toContain('"user_roles"');
    expect(sql.sql).not.toContain('"assessment_line_items"');
  });

  it('builds assessment-title projection', () => {
    const sql = db
      .select({ id: assessments.id, title: assessments.title })
      .from(assessments)
      .where(eq(assessments.id, 1))
      .toSQL();
    expect(sql.sql).toContain('"assessments"');
    expect(sql.sql).not.toContain('"assessment_line_items"');
  });

  it('builds unit label projection', () => {
    const sql = db
      .select({ id: units.id, unitNumber: units.unitNumber, building: units.building })
      .from(units)
      .where(eq(units.id, 1))
      .toSQL();
    expect(sql.sql).toContain('"units"');
    expect(sql.sql).not.toContain('"user_roles"');
  });

  it('builds users projection for recipient lookup', () => {
    const sql = db
      .select({ id: users.id, email: users.email, fullName: users.fullName })
      .from(users)
      .where(inArray(users.id, ['u1']))
      .toSQL();
    expect(sql.sql).toContain('"users"');
    expect(sql.sql).not.toContain('"user_roles"');
    expect(sql.sql).not.toContain('"notification_preferences"');
  });
});

function makeRecipient(overrides: Partial<CommunityRecipient> = {}): CommunityRecipient {
  return {
    userId: 'u1',
    email: 'u1@example.com',
    fullName: 'User One',
    role: 'resident',
    isUnitOwner: true,
    isAdmin: false,
    unitId: 42,
    preferences: getDefaultPreferences(),
    canReadMeetings: true,
    canReadFinances: true,
    ...overrides,
  };
}

describe('isEligibleForEventKind', () => {
  it('returns false for any kind when preset is "off"', () => {
    const r = makeRecipient({
      preferences: { ...getDefaultPreferences(), calendarReminderPreset: 'off' },
    });
    expect(isEligibleForEventKind(r, 'meeting')).toBe(false);
    expect(isEligibleForEventKind(r, 'my_assessment_due')).toBe(false);
    expect(isEligibleForEventKind(r, 'assessment_due')).toBe(false);
  });

  describe('meeting', () => {
    it('requires canReadMeetings AND the meetings toggle', () => {
      expect(isEligibleForEventKind(makeRecipient(), 'meeting')).toBe(true);

      expect(
        isEligibleForEventKind(makeRecipient({ canReadMeetings: false }), 'meeting'),
      ).toBe(false);

      expect(
        isEligibleForEventKind(
          makeRecipient({
            preferences: { ...getDefaultPreferences(), calendarReminderMeetings: false },
          }),
          'meeting',
        ),
      ).toBe(false);
    });
  });

  describe('my_assessment_due', () => {
    it('requires resident + unit owner + finance + unitId + preference', () => {
      expect(isEligibleForEventKind(makeRecipient(), 'my_assessment_due')).toBe(true);
    });

    it('rejects non-residents even with a unit', () => {
      expect(
        isEligibleForEventKind(
          makeRecipient({ role: 'property_manager', isAdmin: true }),
          'my_assessment_due',
        ),
      ).toBe(false);
    });

    it('rejects residents who are not unit owners (tenants)', () => {
      expect(
        isEligibleForEventKind(makeRecipient({ isUnitOwner: false }), 'my_assessment_due'),
      ).toBe(false);
    });

    it('rejects unit owners lacking finance visibility', () => {
      expect(
        isEligibleForEventKind(makeRecipient({ canReadFinances: false }), 'my_assessment_due'),
      ).toBe(false);
    });

    it('rejects when unitId is null', () => {
      expect(
        isEligibleForEventKind(makeRecipient({ unitId: null }), 'my_assessment_due'),
      ).toBe(false);
    });

    it('rejects when the personal-assessment preference is off', () => {
      expect(
        isEligibleForEventKind(
          makeRecipient({
            preferences: {
              ...getDefaultPreferences(),
              calendarReminderPersonalAssessments: false,
            },
          }),
          'my_assessment_due',
        ),
      ).toBe(false);
    });
  });

  describe('assessment_due (community-wide)', () => {
    it('requires admin + finance + the community-assessment toggle', () => {
      const admin = makeRecipient({
        role: 'property_manager',
        isAdmin: true,
        preferences: {
          ...getDefaultPreferences(),
          calendarReminderCommunityAssessments: true,
        },
      });
      expect(isEligibleForEventKind(admin, 'assessment_due')).toBe(true);
    });

    it('rejects residents (who see my_assessment_due instead)', () => {
      expect(
        isEligibleForEventKind(
          makeRecipient({
            preferences: {
              ...getDefaultPreferences(),
              calendarReminderCommunityAssessments: true,
            },
          }),
          'assessment_due',
        ),
      ).toBe(false);
    });

    it('defaults community toggle off — admins do NOT receive without opting in', () => {
      expect(
        isEligibleForEventKind(
          makeRecipient({ role: 'property_manager', isAdmin: true }),
          'assessment_due',
        ),
      ).toBe(false);
    });

    it('rejects admins who have lost finance visibility', () => {
      expect(
        isEligibleForEventKind(
          makeRecipient({
            role: 'property_manager',
            isAdmin: true,
            canReadFinances: false,
            preferences: {
              ...getDefaultPreferences(),
              calendarReminderCommunityAssessments: true,
            },
          }),
          'assessment_due',
        ),
      ).toBe(false);
    });
  });
});

describe('getMeetingTriggerAt', () => {
  const tz = 'America/New_York';
  // Meeting is 2026-05-15T14:00:00Z (10:00 EDT — after 9 AM local)
  const startsAt = new Date('2026-05-15T14:00:00.000Z');

  it('returns null when preset is "off"', () => {
    expect(getMeetingTriggerAt(startsAt, tz, 'off')).toBeNull();
  });

  it('subtracts 1 day for "1_day_before"', () => {
    const t = getMeetingTriggerAt(startsAt, tz, '1_day_before')!;
    expect(t.toISOString()).toBe('2026-05-14T14:00:00.000Z');
  });

  it('subtracts 3 days for "3_days_before"', () => {
    const t = getMeetingTriggerAt(startsAt, tz, '3_days_before')!;
    expect(t.toISOString()).toBe('2026-05-12T14:00:00.000Z');
  });

  it('subtracts 7 days for "7_days_before"', () => {
    const t = getMeetingTriggerAt(startsAt, tz, '7_days_before')!;
    expect(t.toISOString()).toBe('2026-05-08T14:00:00.000Z');
  });

  describe('morning_of', () => {
    it('fires at 9 AM local on the meeting date when meeting is later the same day', () => {
      const t = getMeetingTriggerAt(startsAt, tz, 'morning_of')!;
      // 9 AM EDT (UTC-4 in May 2026) = 13:00 UTC
      expect(t.toISOString()).toBe('2026-05-15T13:00:00.000Z');
      expect(t.getTime()).toBeLessThan(startsAt.getTime());
    });

    it('returns startsAt when the meeting is before 9 AM local', () => {
      // 2026-05-15T12:00:00Z = 08:00 EDT — earlier than 9 AM local
      const earlyMeeting = new Date('2026-05-15T12:00:00.000Z');
      const t = getMeetingTriggerAt(earlyMeeting, tz, 'morning_of')!;
      expect(t.getTime()).toBe(earlyMeeting.getTime());
    });
  });
});

describe('getBackoffMinutes', () => {
  it('matches the documented 15 → 60 → 240 → 720 schedule and caps thereafter', () => {
    expect(getBackoffMinutes(1)).toBe(15);
    expect(getBackoffMinutes(2)).toBe(60);
    expect(getBackoffMinutes(3)).toBe(240);
    expect(getBackoffMinutes(4)).toBe(720);
    expect(getBackoffMinutes(5)).toBe(720);
    expect(getBackoffMinutes(10)).toBe(720);
  });

  it('clamps non-positive attemptCount to the first bucket', () => {
    expect(getBackoffMinutes(0)).toBe(15);
    expect(getBackoffMinutes(-1)).toBe(15);
  });
});

describe('addDaysToDateOnly', () => {
  it('adds whole days without drift', () => {
    expect(addDaysToDateOnly('2026-04-21', 7)).toBe('2026-04-28');
  });

  it('crosses a month boundary', () => {
    expect(addDaysToDateOnly('2026-04-28', 5)).toBe('2026-05-03');
  });

  it('crosses a year boundary', () => {
    expect(addDaysToDateOnly('2026-12-30', 3)).toBe('2027-01-02');
  });

  it('supports negative day offsets (used for trigger dates)', () => {
    expect(addDaysToDateOnly('2026-04-21', -7)).toBe('2026-04-14');
  });
});
