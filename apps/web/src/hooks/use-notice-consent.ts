'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';

/** The signed-in owner's consent to electronic notice. Mirrors `/api/v1/notice-consent`. */
export interface NoticeConsentState {
  consented: boolean;
  givenAt: string | null;
  version: string | null;
  /** The address the active consent covers. */
  email: string | null;
  /** The signed-in user's email now — what a new consent would cover. */
  currentEmail: string | null;
}

export const noticeConsentKey = (communityId: number) => ['notice-consent', communityId] as const;

function url(communityId: number): string {
  return `/api/v1/notice-consent?${new URLSearchParams({ communityId: String(communityId) }).toString()}`;
}

export function useNoticeConsent(communityId: number) {
  return useQuery<NoticeConsentState>({
    queryKey: noticeConsentKey(communityId),
    queryFn: ({ signal }) => requestJson<NoticeConsentState>(url(communityId), { signal }),
  });
}

/** `true` gives consent, `false` withdraws it. */
export function useSetNoticeConsent(communityId: number) {
  const queryClient = useQueryClient();
  return useMutation<NoticeConsentState, Error, boolean>({
    mutationFn: (give) => requestJson<NoticeConsentState>(url(communityId), { method: give ? 'POST' : 'DELETE' }),
    onSuccess: (state) => {
      queryClient.setQueryData(noticeConsentKey(communityId), state);
    },
  });
}
