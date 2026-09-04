'use client';

/**
 * React Query hooks for the scheduled-publish endpoints (launch blocker #7).
 *
 * Reaches the API through `requestJson`, which unwraps the canonical
 * `{ data: T }` envelope and turns `{ error: { message } }` into a thrown
 * `ApiRequestError` carrying the server's own wording — so the sheet can show
 * "Pick a time within 90 days" rather than a generic failure.
 *
 * Kept under the `['pm','site']` key prefix so the publish mutation's existing
 * blanket invalidation reaches them: a publish can consume or invalidate a
 * pending schedule, and a stale "publishing at 3pm" banner over an
 * already-published site is exactly the sort of quiet lie this feature exists
 * to remove.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';

export interface SitePublishSchedule {
  id: number;
  status: 'pending' | 'running' | 'failed';
  /** ISO-8601. */
  scheduledFor: string;
  notifySummary: string | null;
  /** PM-facing reason, set only on `failed`. */
  errorMessage: string | null;
}

export interface ScheduleSitePublishVariables {
  scheduledFor: string;
  notifyResidents?: { summary: string };
}

export function useSitePublishSchedule(communityId: number) {
  return useQuery({
    queryKey: ['pm', 'site', 'publish-schedule', communityId],
    queryFn: async (): Promise<SitePublishSchedule | null> => {
      const { schedule } = await requestJson<{ schedule: SitePublishSchedule | null }>(
        `/api/v1/pm/site/publish/schedule?communityId=${communityId}`,
      );
      return schedule;
    },
  });
}

export function useScheduleSitePublish(communityId: number) {
  const qc = useQueryClient();
  return useMutation<SitePublishSchedule, Error, ScheduleSitePublishVariables>({
    mutationFn: async ({ scheduledFor, notifyResidents }) => {
      const { schedule } = await requestJson<{ schedule: SitePublishSchedule }>(
        '/api/v1/pm/site/publish/schedule',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            communityId,
            scheduledFor,
            // Omitted entirely for a quiet schedule, so the server sees
            // `undefined` rather than an empty object its schema would reject.
            ...(notifyResidents ? { notifyResidents } : {}),
          }),
        },
      );
      return schedule;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['pm', 'site', 'publish-schedule', communityId] });
    },
  });
}

export function useCancelSitePublishSchedule(communityId: number) {
  const qc = useQueryClient();
  return useMutation<boolean, Error, void>({
    mutationFn: async () => {
      const { canceled } = await requestJson<{ canceled: boolean }>(
        `/api/v1/pm/site/publish/schedule?communityId=${communityId}`,
        { method: 'DELETE' },
      );
      return canceled;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['pm', 'site', 'publish-schedule', communityId] });
    },
  });
}
