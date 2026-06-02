/**
 * Route contracts for `/api/v1/notification-preferences`.
 *
 * Plan A1 drain #106. GET reads per-user preferences; PATCH upserts fields
 * with TCPA SMS consent timestamps and `settings_changed` audit log.
 *
 * PATCH auth-chain order is preserved verbatim from pre-migration:
 *   resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace
 *     → requireAuthenticatedUserId
 *     → requireCommunityMembership
 * Demo-grace fires before membership (drain #4/#13 precedent for PATCH).
 *
 * Response: loose `z.unknown()` — PATCH may return `Date` values in SMS
 * consent fields before JSON serialization; GET projection mixes DB row +
 * defaults.
 *
 * `permission: { resource: 'settings', action: 'read' | 'write' }` —
 * metadata only; route does not call `requirePermission` (any member may
 * read/update own preferences).
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const getNotificationPreferencesContract = defineRoute({
  method: 'GET',
  path: '/api/v1/notification-preferences',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'settings', action: 'read' },
});

const emailFrequencySchema = z.enum([
  'immediate',
  'daily_digest',
  'weekly_digest',
  'never',
]);

const calendarReminderPresetSchema = z.enum([
  'morning_of',
  '1_day_before',
  '3_days_before',
  '7_days_before',
  'off',
]);

export const patchNotificationPreferencesContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/notification-preferences',
  request: {
    body: z.object({
      communityId: z.number().int().positive(),
      emailFrequency: emailFrequencySchema.optional(),
      emailAnnouncements: z.boolean().optional(),
      emailMeetings: z.boolean().optional(),
      calendarReminderPreset: calendarReminderPresetSchema.optional(),
      calendarReminderMeetings: z.boolean().optional(),
      calendarReminderPersonalAssessments: z.boolean().optional(),
      calendarReminderCommunityAssessments: z.boolean().optional(),
      inAppEnabled: z.boolean().optional(),
      smsEnabled: z.boolean().optional(),
      smsEmergencyOnly: z.boolean().optional(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'settings', action: 'write' },
});
