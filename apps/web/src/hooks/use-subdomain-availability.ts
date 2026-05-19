'use client';

import { useEffect, useMemo, useState } from 'react';
import { normalizeSignupSubdomain } from '@/lib/auth/signup-schema';
import { requestJson } from '@/lib/api/request-json';

export interface SubdomainAvailability {
  normalizedSubdomain: string;
  available: boolean;
  reason: 'invalid' | 'reserved' | 'taken' | 'available' | 'checking' | 'unknown';
  message: string;
}

export const UNKNOWN_MESSAGE =
  "We couldn't verify this subdomain right now — we'll check again when you submit.";

/**
 * Debounced, abortable subdomain-availability lookup.
 *
 * Behavior preserved byte-for-byte from the former inline effect in
 * `subdomain-checker.tsx`:
 * - empty normalized value → `null` (no fetch)
 * - normalized length < 3 → synthetic `invalid` state (no fetch)
 * - otherwise → immediate synthetic `checking` state, then a 350ms debounced
 *   `GET /api/v1/auth/signup?subdomain=…[&signupRequestId=…]`. Success maps the
 *   standard `{ data }` envelope; AbortError is ignored; any other failure maps
 *   to the synthetic `unknown` state with {@link UNKNOWN_MESSAGE}.
 *
 * Uses `requestJson` directly (no TanStack Query primitive), so consumers do
 * NOT need a `QueryClientProvider`.
 */
export function useSubdomainAvailability(
  value: string,
  signupRequestId?: string,
): SubdomainAvailability | null {
  const [availability, setAvailability] = useState<SubdomainAvailability | null>(null);

  const normalizedValue = useMemo(
    () => normalizeSignupSubdomain(value),
    [value],
  );

  useEffect(() => {
    if (!normalizedValue) {
      setAvailability(null);
      return;
    }

    if (normalizedValue.length < 3) {
      setAvailability({
        normalizedSubdomain: normalizedValue,
        available: false,
        reason: 'invalid',
        message: 'Subdomain must be at least 3 characters.',
      });
      return;
    }

    setAvailability({
      normalizedSubdomain: normalizedValue,
      available: false,
      reason: 'checking',
      message: 'Checking availability...',
    });

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      const query = new URLSearchParams({ subdomain: normalizedValue });
      if (signupRequestId) {
        query.set('signupRequestId', signupRequestId);
      }

      try {
        const data = await requestJson<SubdomainAvailability>(
          `/api/v1/auth/signup?${query.toString()}`,
          {
            method: 'GET',
            signal: controller.signal,
          },
        );

        setAvailability(data);
      } catch (error) {
        if ((error as { name?: string }).name === 'AbortError') {
          return;
        }

        setAvailability({
          normalizedSubdomain: normalizedValue,
          available: false,
          reason: 'unknown',
          message: UNKNOWN_MESSAGE,
        });
      }
    }, 350);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [normalizedValue, signupRequestId]);

  return availability;
}
