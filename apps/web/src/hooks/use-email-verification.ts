'use client';

import { useMutation } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResendSuccessData {
  sent?: boolean;
  cooldownSeconds?: number;
  alreadyVerified?: boolean;
  signupRequestId?: string;
}

export interface ResendErrorData {
  message?: string;
  cooldownRemainingSeconds?: number;
}

export interface ResendVerificationBody {
  data?: ResendSuccessData;
  error?: ResendErrorData;
}

export interface ResendVerificationResult {
  ok: boolean;
  status: number;
  body: ResendVerificationBody;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * POSTs to /api/v1/auth/resend-verification.
 *
 * Documented exception to the requestJson rule: this endpoint uses
 * HTTP-status-driven control flow — 409 means "already verified, redirect to
 * checkout", 429 means "cooldown active", other non-OK is a soft inline error.
 * `requestJson` would throw a generic message and erase the 409/429 status the
 * component branches on. We keep the raw fetch and surface
 * `{ ok, status, body }` so the component's existing
 * `if (response.status === 409)` / `=== 429` / `if (!response.ok)` branches
 * stay byte-identical. Mutation-only → no invalidation. Only the
 * network-failure (fetch reject) path throws — preserving the component's
 * `catch { setResendError(...) }`.
 */
export function useResendVerification() {
  return useMutation<ResendVerificationResult, Error, string>({
    mutationFn: async (signupRequestId: string) => {
      const response = await fetch('/api/v1/auth/resend-verification', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ signupRequestId }),
      });

      const body = (await response.json()) as ResendVerificationBody;
      return { ok: response.ok, status: response.status, body };
    },
  });
}
