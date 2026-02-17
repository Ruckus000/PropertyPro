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
    ? 'text-green-700'
    : availability?.reason === 'checking'
      ? 'text-gray-500'
      : 'text-red-600';

  return (
    <div>
      <label htmlFor="candidateSlug" className="mb-1 block text-sm font-medium text-gray-700">
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
          className="w-full rounded-l-md border border-gray-300 px-3 py-2 text-sm text-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100"
          required
        />
        <span className="rounded-r-md border border-l-0 border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-600">
          .propertyprofl.com
        </span>
      </div>

      {availability ? (
        <p className={`mt-1 text-xs ${helperColor}`}>{availability.message}</p>
      ) : (
        <p className="mt-1 text-xs text-gray-500">
          Suggested from your community name. You can customize it.
        </p>
      )}
    </div>
  );
}
