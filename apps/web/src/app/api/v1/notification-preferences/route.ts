/**
 * Notification Preferences API (P1-26)
 *
 * GET    /api/v1/notification-preferences?communityId=N
 * PATCH  /api/v1/notification-preferences
 *
 * Plan A1 drain #106. Contracts in `./contract.ts`; validation and
 * `{ data }` wrapping via `runRoute()`.
 */
import { runRoute } from '@propertypro/api-contract';
import { logAuditEvent } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import {
  getDefaultPreferences,
  type CalendarReminderPreset,
  type EmailFrequency,
} from '@/lib/utils/email-preferences';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { tryAutoComplete } from '@/lib/services/onboarding-checklist-service';
import {
  getNotificationPreferencesForUser,
  insertNotificationPreferences,
  updateNotificationPreferences,
} from '@/lib/services/notification-preferences-service';
import {
  getNotificationPreferencesContract,
  patchNotificationPreferencesContract,
} from './contract';

export const GET = withErrorHandler(
  runRoute(getNotificationPreferencesContract, async ({ query, req }) => {
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const userId = await requireAuthenticatedUserId();
    await requireCommunityMembership(communityId, userId);

    const row = await getNotificationPreferencesForUser(communityId, userId);
    const defaults = getDefaultPreferences();

    return row
      ? {
          userId,
          communityId,
          emailFrequency: (row['emailFrequency'] as EmailFrequency | undefined) ?? 'immediate',
          emailAnnouncements: (row['emailAnnouncements'] as boolean | undefined) ?? true,
          emailMeetings: (row['emailMeetings'] as boolean | undefined) ?? true,
          calendarReminderPreset:
            (row['calendarReminderPreset'] as CalendarReminderPreset | undefined)
            ?? defaults.calendarReminderPreset,
          calendarReminderMeetings:
            (row['calendarReminderMeetings'] as boolean | undefined)
            ?? defaults.calendarReminderMeetings,
          calendarReminderPersonalAssessments:
            (row['calendarReminderPersonalAssessments'] as boolean | undefined)
            ?? defaults.calendarReminderPersonalAssessments,
          calendarReminderCommunityAssessments:
            (row['calendarReminderCommunityAssessments'] as boolean | undefined)
            ?? defaults.calendarReminderCommunityAssessments,
          inAppEnabled: (row['inAppEnabled'] as boolean | undefined) ?? true,
          emailInsuranceAlerts: (row['emailInsuranceAlerts'] as boolean | undefined) ?? true,
          smsEnabled: (row['smsEnabled'] as boolean | undefined) ?? false,
          smsEmergencyOnly: (row['smsEmergencyOnly'] as boolean | undefined) ?? true,
          smsConsentGivenAt: (row['smsConsentGivenAt'] as string | null) ?? null,
          smsConsentRevokedAt: (row['smsConsentRevokedAt'] as string | null) ?? null,
        }
      : {
          userId,
          communityId,
          ...defaults,
          emailInsuranceAlerts: true,
          smsEnabled: false,
          smsEmergencyOnly: true,
          smsConsentGivenAt: null,
          smsConsentRevokedAt: null,
        };
  }),
);

export const PATCH = withErrorHandler(
  runRoute(patchNotificationPreferencesContract, async ({ body, req }) => {
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);

    const {
      emailFrequency,
      emailAnnouncements,
      emailMeetings,
      calendarReminderPreset,
      calendarReminderMeetings,
      calendarReminderPersonalAssessments,
      calendarReminderCommunityAssessments,
      inAppEnabled,
      emailInsuranceAlerts,
      smsEnabled,
      smsEmergencyOnly,
    } = body;
    const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown';
    const userAgent = req.headers.get('user-agent') ?? 'unknown';

    const userId = await requireAuthenticatedUserId();
    await requireCommunityMembership(communityId, userId);

    const existing = await getNotificationPreferencesForUser(communityId, userId);

    const updateValues: Record<string, unknown> = {};
    if (emailFrequency !== undefined) updateValues['emailFrequency'] = emailFrequency;
    if (emailAnnouncements !== undefined) updateValues['emailAnnouncements'] = emailAnnouncements;
    if (emailMeetings !== undefined) updateValues['emailMeetings'] = emailMeetings;
    if (calendarReminderPreset !== undefined) {
      updateValues['calendarReminderPreset'] = calendarReminderPreset;
    }
    if (calendarReminderMeetings !== undefined) {
      updateValues['calendarReminderMeetings'] = calendarReminderMeetings;
    }
    if (calendarReminderPersonalAssessments !== undefined) {
      updateValues['calendarReminderPersonalAssessments'] = calendarReminderPersonalAssessments;
    }
    if (calendarReminderCommunityAssessments !== undefined) {
      updateValues['calendarReminderCommunityAssessments'] = calendarReminderCommunityAssessments;
    }
    if (inAppEnabled !== undefined) updateValues['inAppEnabled'] = inAppEnabled;
    if (emailInsuranceAlerts !== undefined) {
      updateValues['emailInsuranceAlerts'] = emailInsuranceAlerts;
    }

    if (smsEnabled !== undefined) {
      updateValues['smsEnabled'] = smsEnabled;
      if (smsEnabled) {
        const existingConsent = existing?.['smsConsentGivenAt'];
        const existingRevoked = existing?.['smsConsentRevokedAt'];
        if (!existingConsent || existingRevoked) {
          updateValues['smsConsentGivenAt'] = new Date();
          updateValues['smsConsentRevokedAt'] = null;
          updateValues['smsConsentMethod'] = 'web_form';
        }
      } else {
        const existingConsent = existing?.['smsConsentGivenAt'];
        if (existingConsent) {
          updateValues['smsConsentRevokedAt'] = new Date();
        }
      }
    }
    if (smsEmergencyOnly !== undefined) {
      updateValues['smsEmergencyOnly'] = smsEmergencyOnly;
    }

    if (Object.keys(updateValues).length === 0) {
      throw new ValidationError('No preference updates provided');
    }

    if (!existing) {
      await insertNotificationPreferences(communityId, userId, updateValues);
    } else {
      await updateNotificationPreferences(communityId, userId, updateValues);
    }

    await logAuditEvent({
      userId,
      action: 'settings_changed',
      resourceType: 'notification_preferences',
      resourceId: `${userId}:${communityId}`,
      communityId,
      newValues: updateValues as unknown as Record<string, unknown>,
      metadata: {
        ip,
        userAgent,
        ...(smsEnabled !== undefined ? { consentMethod: 'web_form' } : {}),
      },
    });

    void tryAutoComplete(communityId, userId, 'update_preferences');

    return { userId, communityId, ...updateValues };
  }),
);
