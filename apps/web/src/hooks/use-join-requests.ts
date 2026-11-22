'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';

export interface CreateJoinRequestInput {
  communityId: number;
  unitIdentifier: string;
  residentType: 'owner' | 'tenant';
}

/** One of the signed-in user's own join requests (GET /api/v1/account/join-requests). */
export interface MyJoinRequest {
  id: number;
  communityId: number;
  communityName: string | null;
  unitIdentifier: string;
  residentType: string;
  status: string;
  reviewNotes: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export const MY_JOIN_REQUESTS_KEY = ['account', 'join-requests'] as const;

/** The signed-in user's own join requests across communities, newest first. */
export function useMyJoinRequests() {
  return useQuery<MyJoinRequest[]>({
    queryKey: MY_JOIN_REQUESTS_KEY,
    queryFn: () => requestJson<MyJoinRequest[]>('/api/v1/account/join-requests'),
  });
}

const REASON_MESSAGES: Record<string, string> = {
  already_member: "You're already a member of this community.",
  pending_request: 'You already have a pending request for this community.',
  recently_denied:
    'A previous request for this community was denied in the last 30 days. Please contact your community admin.',
};

export function useCreateJoinRequest() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, CreateJoinRequestInput>({
    // The new request should appear in "Your requests" straight away.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MY_JOIN_REQUESTS_KEY }),
    // Documented exception to the requestJson rule: this route surfaces a
    // ConflictError whose `error.details.reason` / `error.code` drives a
    // friendly-message map. `requestJson` only exposes `error.message`, so it
    // cannot reproduce that mapping — raw fetch + bespoke error parsing is
    // retained here (same precedent as ResidentSearchCombobox / ArticleViewTracker).
    mutationFn: async ({ communityId, unitIdentifier, residentType }) => {
      const res = await fetch('/api/v1/account/join-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          communityId,
          unitIdentifier,
          residentType,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const reason =
          (body?.error?.details?.reason as string | undefined) ??
          (body?.error?.code as string | undefined) ??
          '';
        const message =
          REASON_MESSAGES[reason] ??
          body?.error?.message ??
          'Submission failed. Please try again.';
        throw new Error(message);
      }
    },
  });
}
