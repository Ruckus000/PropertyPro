/**
 * Mutation hooks for the self-service resident access-request form
 * (B5 batch #13 drain of access-requests/request-access-form.tsx).
 *
 * Documented exception to the requestJson rule: the public access-request
 * routes return a NON-standard error body of `{ message }` (NOT the standard
 * `{ error: { message } }`). The form renders the thrown error's `.message`
 * verbatim and depends on the exact fallback literals
 * `'Something went wrong. Please try again.'` /
 * `'Verification failed. Please try again.'`. requestJson would surface a
 * different message, so these hooks keep a raw `fetch` + manual non-OK throw
 * with the exact literals.
 *
 * Mutation-only (no cached query) → no cache invalidation.
 */
import { useMutation } from '@tanstack/react-query';

export interface SubmitAccessRequestPayload {
  communityId: number;
  communitySlug: string;
  email: string;
  fullName: string;
  phone: undefined;
  claimedUnitNumber: string | undefined;
  isUnitOwner: boolean;
  refCode: string | undefined;
}

export interface VerifyAccessRequestPayload {
  requestId: number;
  otp: string;
  communityId: number;
}

/**
 * POST /api/v1/access-requests — submit a self-service access request.
 * Resolves to `{ requestId }` extracted from the `{ data: { requestId } }`
 * success envelope.
 */
export function useSubmitAccessRequest() {
  return useMutation<{ requestId: number }, Error, SubmitAccessRequestPayload>({
    mutationFn: async (payload) => {
      const res = await fetch('/api/v1/access-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        // Documented exception: non-standard `{ message }` error body — keep
        // raw parse + exact fallback literal (see file header).
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { message?: string }).message ??
            'Something went wrong. Please try again.',
        );
      }

      const body = (await res.json()) as { data: { requestId: number } };
      return { requestId: body.data.requestId };
    },
  });
}

/**
 * POST /api/v1/access-requests/verify — verify the emailed OTP. Void result.
 */
export function useVerifyAccessRequest() {
  return useMutation<void, Error, VerifyAccessRequestPayload>({
    mutationFn: async ({ requestId, otp, communityId }) => {
      const res = await fetch('/api/v1/access-requests/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, otp, communityId }),
      });

      if (!res.ok) {
        // Documented exception: non-standard `{ message }` error body — keep
        // raw parse + exact fallback literal (see file header).
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { message?: string }).message ??
            'Verification failed. Please try again.',
        );
      }
    },
  });
}
