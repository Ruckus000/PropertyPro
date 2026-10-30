'use client';

/**
 * The website home's "records still missing" alert (`/api/v1/pm/site/records-alert`, D11):
 * how many Florida records the website still lacks, and this manager's snooze.
 *
 * `snooze` sets the seven-day snooze and puts the answer straight into the
 * cache, so the alert hides at once. The count ignores the snooze (the
 * navigation badge shows it regardless); a caller shows the alert only while
 * `missingCount > 0` and `snoozedUntil` is null.
 *
 * The key sits under `['pm', 'site']`, so anything that invalidates the site's
 * queries (publishing, a look switch) refreshes the alert too. A caller that
 * has just changed the records invalidates `recordsAlertQueryKey` itself.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { JSON_HEADERS, requestJson } from '@/lib/api/request-json';
import type { RecordsAlert } from '@/app/api/v1/pm/site/records-alert/contract';

const ALERT_URL = '/api/v1/pm/site/records-alert';

export function recordsAlertQueryKey(communityId: number) {
  return ['pm', 'site', 'records-alert', communityId] as const;
}

export interface UseRecordsAlertOptions {
  /** False sends no request. The sidebar badge asks only where the answer can be non-zero. */
  enabled?: boolean;
  /** How long an answer counts as fresh, in ms; the query client's default when omitted. */
  staleTime?: number;
}

export function useRecordsAlert(communityId: number, { enabled = true, staleTime }: UseRecordsAlertOptions = {}) {
  const qc = useQueryClient();

  const query = useQuery<RecordsAlert>({
    queryKey: recordsAlertQueryKey(communityId),
    queryFn: () => requestJson<RecordsAlert>(`${ALERT_URL}?communityId=${communityId}`),
    enabled,
    // Spread, not `staleTime,`: an explicit undefined would override the query
    // client's default (the website home passes none and keeps it).
    ...(staleTime === undefined ? {} : { staleTime }),
  });

  const snooze = useMutation<{ snoozedUntil: string }, Error, void>({
    mutationFn: () =>
      requestJson<{ snoozedUntil: string }>(ALERT_URL, {
        method: 'PATCH',
        headers: JSON_HEADERS,
        body: JSON.stringify({ communityId, snoozeDays: 7 }),
      }),
    onSuccess: ({ snoozedUntil }) => {
      qc.setQueryData<RecordsAlert>(recordsAlertQueryKey(communityId), (alert) =>
        alert ? { ...alert, snoozedUntil } : alert,
      );
    },
  });

  return { ...query, snooze };
}
