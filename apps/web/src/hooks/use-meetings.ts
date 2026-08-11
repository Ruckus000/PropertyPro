'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CalendarEvent } from '@/lib/calendar/event-types';
import type { MeetingDeadlines } from '@/lib/meetings/meeting-response';
import type { NoticeWarning } from '@/lib/compliance/notice-window';
import { requestJson, requestJsonEnvelope } from '@/lib/api/request-json';

export interface MeetingListItem {
  id: number;
  title: string;
  meetingType: string;
  startsAt: string;
  endsAt: string | null;
  location: string;
  noticePostedAt: string | null;
  minutesApprovedAt: string | null;
  deadlines: MeetingDeadlines;
}

export interface MeetingDocumentItem {
  id: number;
  title: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  category: string | null;
  attachedAt: string;
}

export interface MeetingDetailItem extends MeetingListItem {
  documents: MeetingDocumentItem[];
}

export const MEETING_KEYS = {
  all: ['meetings'] as const,
  list: (communityId: number, start?: string, end?: string) =>
    [...MEETING_KEYS.all, 'list', communityId, start ?? 'all', end ?? 'all'] as const,
  detail: (communityId: number, meetingId: number) =>
    [...MEETING_KEYS.all, 'detail', communityId, meetingId] as const,
  calendarEvents: (communityId: number, start: string, end: string) =>
    [...MEETING_KEYS.all, 'calendar', communityId, start, end] as const,
};


export function useMeetings(
  communityId: number,
  options?: { start?: string; end?: string },
) {
  return useQuery({
    // Keep showing the previous page while a filter/page change refetches.
    placeholderData: keepPreviousData,
    queryKey: MEETING_KEYS.list(communityId, options?.start, options?.end),
    queryFn: async () => {
      const params = new URLSearchParams({ communityId: String(communityId) });
      if (options?.start) {
        params.set('start', options.start);
      }
      if (options?.end) {
        params.set('end', options.end);
      }

      return requestJson<MeetingListItem[]>(`/api/v1/meetings?${params.toString()}`);
    },
    enabled: communityId > 0,
  });
}

export function useMeeting(communityId: number, meetingId: number | null) {
  return useQuery({
    queryKey: meetingId ? MEETING_KEYS.detail(communityId, meetingId) : [...MEETING_KEYS.all, 'detail', communityId, 'none'] as const,
    queryFn: async () => requestJson<MeetingDetailItem>(
      `/api/v1/meetings/${meetingId}?communityId=${communityId}`,
    ),
    enabled: communityId > 0 && meetingId !== null,
  });
}

export function useCalendarEvents(
  communityId: number,
  start: string,
  end: string,
) {
  return useQuery({
    // Keep showing the previous page while a filter/page change refetches.
    placeholderData: keepPreviousData,
    queryKey: MEETING_KEYS.calendarEvents(communityId, start, end),
    queryFn: async () =>
      requestJson<CalendarEvent[]>(
        `/api/v1/calendar/events?communityId=${communityId}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
      ),
    enabled: communityId > 0 && start.length > 0 && end.length > 0,
  });
}

/**
 * `{ data, warnings }` rather than the bare meeting.
 *
 * The route attaches a `notice_window_missed` warning when the schedule is
 * already inside its statutory notice window (#932). Going through
 * `requestJson` would drop it silently — the meeting saves, the board is never
 * told the notice deadline is unreachable.
 */
export type MeetingMutationResult = {
  data: MeetingListItem;
  warnings: NoticeWarning[];
};

export function useCreateMeeting(communityId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      title: string;
      meetingType: string;
      startsAt: string;
      endsAt?: string | null;
      location: string;
    }): Promise<MeetingMutationResult> =>
      requestJsonEnvelope<MeetingListItem>('/api/v1/meetings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, ...payload }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: MEETING_KEYS.all });
    },
  });
}

export function useUpdateMeeting(communityId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      id: number;
      title?: string;
      meetingType?: string;
      startsAt?: string;
      endsAt?: string | null;
      location?: string;
    }): Promise<MeetingMutationResult> =>
      requestJsonEnvelope<MeetingListItem>('/api/v1/meetings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'update', communityId, ...payload }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: MEETING_KEYS.all });
    },
  });
}

export function useDeleteMeeting(communityId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (meetingId: number) =>
      requestJson<{ success: boolean }>('/api/v1/meetings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'delete', communityId, id: meetingId }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: MEETING_KEYS.all });
    },
  });
}
