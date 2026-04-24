'use client';

import { useEffect, useMemo, useState } from 'react';
import { normalizeSignupSubdomain } from '@/lib/auth/signup-schema';

export interface SubdomainAvailability {
  normalizedSubdomain: string;
  available: boolean;
  reason: 'invalid' | 'reserved' | 'taken' | 'available' | 'checking' | 'unknown';
  message: string;
}

const UNKNOWN_MESSAGE =
  "We couldn't verify this subdomain right now — we'll check again when you submit.";

/**
 * Production subdomain availability (GET `/api/v1/auth/signup?...`) shared by
 * {@link SubdomainChecker} and the clean signup wizard.
 */
export function useSubdomainAvailability(
  value: string,
  signupRequestId: string | undefined,
): SubdomainAvailability | null {
  const [availability, setAvailability] = useState<SubdomainAvailability | null>(null);

  const normalizedValue = useMemo(() => normalizeSignupSubdomain(value), [value]);

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
    const timeout = window.setTimeout(async () => {
      const query = new URLSearchParams({ subdomain: normalizedValue });
      if (signupRequestId) {
        query.set('signupRequestId', signupRequestId);
      }

      try {
        const response = await fetch(`/api/v1/auth/signup?${query.toString()}`, {
          method: 'GET',
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error('Subdomain check failed');
        }

        const body = (await response.json()) as { data: SubdomainAvailability };
        setAvailability(body.data);
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
