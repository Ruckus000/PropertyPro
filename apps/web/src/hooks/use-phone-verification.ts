'use client';

/**
 * Phone verification + SMS-consent mutations for the SMS consent form.
 *
 * Owns its OWN raw fetch to /api/v1/notification-preferences for the
 * SMS-consent PATCH — deliberately does NOT import or extend the shared
 * use-notification-preferences hook (separate concern, serialization-safe).
 *
 * Documented exception to the requestJson rule: the SMS consent form renders
 * the thrown error `.message` verbatim, and these endpoints return a
 * non-standard error body `{ error: '<string>' }` (NOT `{ error: { message } }`).
 * Each mutation replicates the original component's error-parse byte-for-byte
 * so the surfaced literal is identical.
 */
import { useMutation } from '@tanstack/react-query';

export function useSendPhoneVerification() {
  return useMutation<void, Error, { phone: string }>({
    mutationFn: async ({ phone }) => {
      const res = await fetch('/api/v1/phone/verify/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone }),
      });

      // Documented exception: bare res.json() error parse, preserved exactly
      // from the original component (data.error ?? '<literal>').
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to send verification code');
      }
    },
  });
}

export function useConfirmPhoneVerification() {
  return useMutation<void, Error, { phone: string; code: string }>({
    mutationFn: async ({ phone, code }) => {
      const res = await fetch('/api/v1/phone/verify/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone, code }),
      });

      // Documented exception: bare res.json() error parse, preserved exactly
      // from the original component (data.error ?? '<literal>').
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Invalid verification code');
      }
    },
  });
}

export function useSetSmsConsent() {
  return useMutation<
    void,
    Error,
    { communityId: number; smsEnabled: boolean }
  >({
    mutationFn: async ({ communityId, smsEnabled }) => {
      const res = await fetch('/api/v1/notification-preferences', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          communityId,
          smsEnabled,
          smsEmergencyOnly: true,
        }),
      });

      // Documented exception: original did NOT parse the body on !res.ok —
      // it threw a fixed literal. Preserved byte-for-byte.
      if (!res.ok) throw new Error('Failed to update SMS preferences');
    },
  });
}
