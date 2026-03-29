'use client';

import { useEffect, useMemo, useState } from 'react';
import { normalizeSignupSubdomain } from '@/lib/auth/signup-schema';

export interface SubdomainAvailability {
  normalizedSubdomain: string;
  available: boolean;
  reason: 'invalid' | 'reserved' | 'taken' | 'available' | 'checking';
  message: string;
}

interface SubdomainCheckerProps {
  value: string;
  signupRequestId?: string;
  onChange: (value: string) => void;
  onAvailabilityChange: (state: SubdomainAvailability | null) => void;
  disabled?: boolean;
}

export function SubdomainChecker({
  value,
  signupRequestId,
  onChange,
  onAvailabilityChange,
  disabled = false,
}: SubdomainCheckerProps) {
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
          reason: 'invalid',
          message: 'Unable to verify subdomain right now. Please try again.',
        });
      }
    }, 350);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [normalizedValue, signupRequestId]);

  useEffect(() => {
    onAvailabilityChange(availability);
  }, [availability, onAvailabilityChange]);

  const helperColor = availability?.reason === 'available'
    ? 'text-status-success'
    : availability?.reason === 'checking'
      ? 'text-content-tertiary'
      : 'text-status-danger';

  return (
    <div>
      <label htmlFor="candidateSlug" className="mb-1 block text-sm font-medium text-content-secondary">
        Subdomain
      </label>
      <div className="flex items-center">
        <input
          id="candidateSlug"
          name="candidateSlug"
          value={value}
          onChange={(event) => onChange(normalizeSignupSubdomain(event.target.value))}
          placeholder="your-community"
          disabled={disabled}
          className="w-full rounded-l-md border border-edge-strong px-3 py-2 text-sm text-content disabled:cursor-not-allowed disabled:bg-surface-muted"
          required
        />
        <span className="rounded-r-md border border-l-0 border-edge-strong bg-surface-page px-3 py-2 text-sm text-content-secondary">
          .getpropertypro.com
        </span>
      </div>

      {availability ? (
        <p className={`mt-1 text-xs ${helperColor}`}>{availability.message}</p>
      ) : (
        <p className="mt-1 text-xs text-content-tertiary">
          Suggested from your community name. You can customize it.
        </p>
      )}
    </div>
  );
}
