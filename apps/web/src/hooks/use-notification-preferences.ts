'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';
import type {
  CalendarReminderPreset,
  EmailFrequency,
} from '@/lib/utils/email-preferences';

export interface NotificationPreferences {
  emailFrequency: EmailFrequency;
  emailAnnouncements: boolean;
  emailMeetings: boolean;
  calendarReminderPreset: CalendarReminderPreset;
  calendarReminderMeetings: boolean;
  calendarReminderPersonalAssessments: boolean;
  calendarReminderCommunityAssessments: boolean;
  inAppEnabled: boolean;
}

export const notificationPreferencesKey = (communityId: number) =>
  ['notification-preferences', communityId] as const;

export function useNotificationPreferences(communityId: number) {
  return useQuery<NotificationPreferences>({
    queryKey: notificationPreferencesKey(communityId),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ communityId: String(communityId) });
      return requestJson<NotificationPreferences>(
        `/api/v1/notification-preferences?${params.toString()}`,
        { signal },
      );
    },
  });
}

export function useUpdateNotificationPreferences(communityId: number) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, NotificationPreferences>({
    mutationFn: async (values) => {
      await requestJson<unknown>('/api/v1/notification-preferences', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, ...values }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: notificationPreferencesKey(communityId),
      });
    },
  });
}
