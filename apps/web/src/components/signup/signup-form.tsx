'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { CommunityType } from '@propertypro/shared';
import {
  getSignupPlansForCommunityType,
  isPlanAvailableForCommunityType,
  suggestSubdomainFromCommunityName,
  type SignupPlanId,
} from '@/lib/auth/signup-schema';
import {
  CommunityTypeSelector,
} from './community-type-selector';
import {
  SubdomainChecker,
  type SubdomainAvailability,
} from './subdomain-checker';

interface SignupFormProps {
  initialCommunityType?: CommunityType;
  initialSignupRequestId?: string;
  verificationReturn?: boolean;
}

interface SignupApiSuccess {
  signupRequestId: string;
  subdomain: string;
  verificationRequired: true;
  checkoutEligible: false;
  message: string;
}

export function SignupForm({
  initialCommunityType = 'condo_718',
  initialSignupRequestId,
  verificationReturn = false,
}: SignupFormProps) {
  const [communityType, setCommunityType] = useState<CommunityType>(initialCommunityType);
  const [planKey, setPlanKey] = useState<SignupPlanId>(
    getSignupPlansForCommunityType(initialCommunityType)[0]!.id,
  );
  const [signupRequestId, setSignupRequestId] = useState<string | undefined>(
    initialSignupRequestId,
  );
  const [subdomainDirty, setSubdomainDirty] = useState(false);
  const [subdomainAvailability, setSubdomainAvailability] =
    useState<SubdomainAvailability | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<SignupApiSuccess | null>(null);

  const [primaryContactName, setPrimaryContactName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [communityName, setCommunityName] = useState('');
  const [address, setAddress] = useState('');
  const [county, setCounty] = useState('');
  const [unitCount, setUnitCount] = useState('1');
  const [candidateSlug, setCandidateSlug] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);

  const plans = useMemo(
    () => getSignupPlansForCommunityType(communityType),
    [communityType],
  );

  useEffect(() => {
    if (!isPlanAvailableForCommunityType(communityType, planKey)) {
      setPlanKey(plans[0]!.id);
    }
  }, [communityType, planKey, plans]);

  function handleCommunityNameChange(value: string): void {
    setCommunityName(value);
    if (!subdomainDirty) {
      setCandidateSlug(suggestSubdomainFromCommunityName(value));
    }
  }

  function handleSubdomainChange(value: string): void {
    setSubdomainDirty(true);
    setCandidateSlug(value);
  }

  const isSubdomainBlocked = Boolean(
    subdomainAvailability
    && subdomainAvailability.reason !== 'available'
    && subdomainAvailability.reason !== 'checking',
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessResult(null);
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/v1/auth/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          signupRequestId,
          primaryContactName,
          email,
          password,
          communityName,
          address,
          county,
          unitCount: Number(unitCount),
          communityType,
          planKey,
          candidateSlug,
          termsAccepted,
        }),
      });

      const payload = (await response.json()) as {
        data?: SignupApiSuccess;
        error?: { message?: string };
      };

      if (!response.ok || !payload.data) {
        setErrorMessage(payload.error?.message ?? 'Unable to complete signup right now.');
        return;
      }

      setSignupRequestId(payload.data.signupRequestId);
      setSuccessResult(payload.data);
      setSubdomainDirty(true);
    } catch {
      setErrorMessage('Unable to complete signup right now.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-md border border-edge bg-surface-card p-6 shadow-e0">
      {verificationReturn ? (
        <div className="rounded-md border border-status-info-border bg-interactive/10 px-4 py-3 text-sm text-content-link">
          Verification returned successfully. Complete signup with the same request details below.
        </div>
      ) : null}

      {errorMessage ? (
        <div className="rounded-md border border-status-danger bg-status-danger-bg px-4 py-3 text-sm text-status-danger" role="alert">
          {errorMessage}
        </div>
      ) : null}

      {successResult ? (
        <div className="rounded-md border border-status-success-border bg-status-success-bg px-4 py-3 text-sm text-status-success" role="status">
          {successResult.message}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-content-secondary">Primary Contact Name</span>
          <input
            type="text"
            value={primaryContactName}
            onChange={(event) => setPrimaryContactName(event.target.value)}
            className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
            required
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-content-secondary">Email</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
            required
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-content-secondary">Password</span>
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
          placeholder="At least 8 chars, mixed case, number, symbol"
          required
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-content-secondary">Community Name</span>
          <input
            type="text"
            value={communityName}
            onChange={(event) => handleCommunityNameChange(event.target.value)}
            className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
            required
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-content-secondary">Address</span>
          <input
            type="text"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
            required
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-content-secondary">County</span>
          <input
            type="text"
            value={county}
            onChange={(event) => setCounty(event.target.value)}
            className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
            required
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-content-secondary">Unit Count</span>
          <input
            type="number"
            min={1}
            step={1}
            value={unitCount}
            onChange={(event) => setUnitCount(event.target.value)}
            className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
            required
          />
        </label>
      </div>

      <CommunityTypeSelector
        value={communityType}
        onChange={(value) => setCommunityType(value)}
        disabled={isSubmitting}
      />

      <div>
        <h2 className="mb-2 text-sm font-medium text-content-secondary">Plan Selection</h2>
        <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label="Plan selection">
          {plans.map((plan) => {
            const selected = plan.id === planKey;
            return (
              <button
                key={plan.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setPlanKey(plan.id)}
                disabled={isSubmitting}
                className={`rounded-md border p-3 text-left transition-colors ${
                  selected
                    ? 'border-interactive bg-interactive/10'
                    : 'border-edge-strong bg-surface-card hover:border-edge-strong'
                }`}
              >
                <span className="block text-sm font-semibold text-content">{plan.label}</span>
                <span className="mt-1 block text-sm text-content-secondary">${plan.monthlyPriceUsd}/month</span>
                <span className="mt-1 block text-xs text-content-secondary">{plan.description}</span>
              </button>
            );
          })}
        </div>
      </div>

      <SubdomainChecker
        value={candidateSlug}
        signupRequestId={signupRequestId}
        onChange={handleSubdomainChange}
        onAvailabilityChange={setSubdomainAvailability}
        disabled={isSubmitting}
      />

      <label className="flex items-start gap-2 text-sm text-content-secondary">
        <input
          type="checkbox"
          checked={termsAccepted}
          onChange={(event) => setTermsAccepted(event.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-edge-strong"
          required
        />
        <span>
          I agree to the{' '}
          <Link href="/legal/terms" className="text-content-link hover:text-content-link">
            Terms of Service
          </Link>
          {' '}and{' '}
          <Link href="/legal/privacy" className="text-content-link hover:text-content-link">
            Privacy Policy
          </Link>
          .
        </span>
      </label>

      <button
        type="submit"
        disabled={isSubmitting || isSubdomainBlocked}
        className="w-full rounded-md bg-interactive px-4 py-2.5 text-sm font-semibold text-content-inverse hover:bg-interactive/100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? 'Submitting...' : 'Create Account'}
      </button>
    </form>
  );
}
