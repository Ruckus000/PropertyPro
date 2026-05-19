'use client';

import { useMutation } from '@tanstack/react-query';

export interface AcceptInvitationInput {
  token: string;
  communityId: number;
  password: string;
}

/**
 * Accepts an invitation by setting the account password. Returns the email
 * of the now-active account so the caller can sign the user in.
 */
export function useAcceptInvitation() {
  return useMutation<string, Error, AcceptInvitationInput>({
    // Documented exception to the requestJson rule: the route surfaces
    // `error.code` (TOKEN_USED / TOKEN_EXPIRED) that drives distinct
    // user-facing copy, and the success payload's `email` is consumed by
    // the caller. requestJson exposes neither `error.code` nor lets the
    // caller read the body, so raw fetch + bespoke parsing is retained.
    mutationFn: async ({ token, communityId, password }) => {
      const res = await fetch('/api/v1/invitations', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, communityId, password }),
      });

      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: { code?: string; message?: string };
        };
        if (json?.error?.code === 'TOKEN_USED') {
          throw new Error('This invitation link has already been used.');
        }
        if (json?.error?.code === 'TOKEN_EXPIRED') {
          throw new Error('This invitation link has expired.');
        }
        throw new Error(json?.error?.message ?? 'Failed to accept invitation.');
      }

      const json = (await res.json()) as { data: { email: string } };
      return json.data.email;
    },
  });
}
