'use client';

import { useMutation } from '@tanstack/react-query';

export interface CreateJoinRequestInput {
  communityId: number;
  unitIdentifier: string;
  residentType: 'owner' | 'tenant';
}

const REASON_MESSAGES: Record<string, string> = {
  already_member: "You're already a member of this community.",
  pending_request: 'You already have a pending request for this community.',
  recently_denied:
    'A previous request for this community was denied in the last 30 days. Please contact your community admin.',
};

export function useCreateJoinRequest() {
  return useMutation<void, Error, CreateJoinRequestInput>({
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
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
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
