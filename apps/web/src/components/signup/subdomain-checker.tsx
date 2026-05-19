'use client';

import { useEffect } from 'react';
import { normalizeSignupSubdomain } from '@/lib/auth/signup-schema';
import {
  useSubdomainAvailability,
  type SubdomainAvailability,
} from '@/hooks/use-subdomain-availability';

// Re-exported so existing consumers (e.g. signup-form.tsx) keep importing the
// type from this module without an import-path change.
export type { SubdomainAvailability };

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
  const availability = useSubdomainAvailability(value, signupRequestId);

  useEffect(() => {
    onAvailabilityChange(availability);
  }, [availability, onAvailabilityChange]);

  const helperColor = availability?.reason === 'available'
    ? 'text-status-success'
    : availability?.reason === 'checking' || availability?.reason === 'unknown'
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
