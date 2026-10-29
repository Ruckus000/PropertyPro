'use client';

/**
 * The website home's **Email owners** offer (D5): `send` emails owners that the
 * site is live (once per community; a second send is a 409), `dismiss` retires
 * the offer. Both invalidate the website home's data so the offer goes away.
 *
 * `send` resolves with how the send went (`sent`, `partial` or `failed`). A
 * `failed` send released its claim, so the offer stays.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { JSON_HEADERS, requestJson } from '@/lib/api/request-json';

const LIVE_NOTICE_URL = '/api/v1/pm/site/live-notice';

export interface SendSiteLiveNoticeResult {
  status: 'sent' | 'partial' | 'failed';
  recipientCount?: number;
  reason?: string;
}

export function useSiteLiveNotice(communityId: number) {
  const qc = useQueryClient();
  const invalidateSite = () => qc.invalidateQueries({ queryKey: ['pm', 'site'] });
  // One scope: a click on Send and a click on Dismiss never run side by side.
  const scope = { id: `site-live-notice-${communityId}` };

  const send = useMutation<SendSiteLiveNoticeResult, Error, void>({
    scope,
    mutationFn: () =>
      requestJson<SendSiteLiveNoticeResult>(LIVE_NOTICE_URL, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ communityId }),
      }),
    onSuccess: invalidateSite,
  });

  const dismiss = useMutation<unknown, Error, void>({
    scope,
    mutationFn: () =>
      requestJson(LIVE_NOTICE_URL, {
        method: 'PATCH',
        headers: JSON_HEADERS,
        body: JSON.stringify({ communityId, dismissed: true }),
      }),
    onSuccess: invalidateSite,
  });

  return { send, dismiss };
}
