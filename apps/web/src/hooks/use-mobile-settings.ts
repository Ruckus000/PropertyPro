'use client';

import { useMutation } from '@tanstack/react-query';
import type { CalendarReminderPreset } from '@/lib/utils/email-preferences';

export interface MobileSettingsProfileInput {
  communityId: number;
  fullName: string | undefined;
  phone: string | null;
}

export interface MobileSettingsNotificationPreferencesInput {
  communityId: number;
  emailFrequency: string;
  emailAnnouncements: boolean;
  emailMeetings: boolean;
  calendarReminderPreset: CalendarReminderPreset;
  calendarReminderMeetings: boolean;
  calendarReminderPersonalAssessments: boolean;
  calendarReminderCommunityAssessments: boolean;
  inAppEnabled: boolean;
  smsEnabled: boolean;
}

export interface UpdateMobileSettingsInput {
  profile: MobileSettingsProfileInput;
  notificationPreferences: MobileSettingsNotificationPreferencesInput;
}

/**
 * Save the mobile settings form: updates the user profile, then (only if that
 * succeeds) the notification preferences.
 *
 * Mutation-only flow: the original component just set a local `saved` flag on
 * success — there is no cached query to invalidate, so this hook intentionally
 * does no invalidation.
 *
 * Short-circuit behavior preserved exactly from the original component: if the
 * profile PATCH is not OK, the function throws immediately and the
 * notification-preferences PATCH is never issued.
 */
export function useUpdateMobileSettings() {
  return useMutation<void, Error, UpdateMobileSettingsInput>({
    // Documented exception to the requestJson rule: the component shows the
    // thrown error's message verbatim, and the two failure paths must keep
    // their EXACT fallback literals 'Failed to update profile' /
    // 'Failed to update notification preferences' when the error body has no
    // message. requestJson's non-OK fallback is the generic 'Request failed',
    // which would change that user-facing copy. (await-throw already
    // short-circuits the second PATCH, so that is not the reason for the
    // exception.)
    mutationFn: async ({ profile, notificationPreferences }) => {
      // Update profile
      const profileRes = await fetch('/api/v1/account/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          communityId: profile.communityId,
          fullName: profile.fullName,
          phone: profile.phone,
        }),
      });

      if (!profileRes.ok) {
        const body = await profileRes.json().catch(() => null);
        throw new Error(
          (body as { error?: { message?: string } } | null)?.error?.message
            ?? 'Failed to update profile',
        );
      }

      // Update notification preferences
      const prefsRes = await fetch('/api/v1/notification-preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          communityId: notificationPreferences.communityId,
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
          smsEnabled: notificationPreferences.smsEnabled,
        }),
      });

      if (!prefsRes.ok) {
        const body = await prefsRes.json().catch(() => null);
        throw new Error(
          (body as { error?: { message?: string } } | null)?.error?.message
            ?? 'Failed to update notification preferences',
        );
      }
    },
  });
}
