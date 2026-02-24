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
    <form onSubmit={handleSubmit} className="space-y-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      {verificationReturn ? (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Verification returned successfully. Complete signup with the same request details below.
        </div>
      ) : null}

      {errorMessage ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {errorMessage}
        </div>
      ) : null}

      {successResult ? (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700" role="status">
          {successResult.message}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Primary Contact Name</span>
          <input
            type="text"
            value={primaryContactName}
            onChange={(event) => setPrimaryContactName(event.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            required
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Email</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            required
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">Password</span>
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          placeholder="At least 8 chars, mixed case, number, symbol"
          required
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Community Name</span>
          <input
            type="text"
            value={communityName}
            onChange={(event) => handleCommunityNameChange(event.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            required
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Address</span>
          <input
            type="text"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            required
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">County</span>
          <input
            type="text"
            value={county}
            onChange={(event) => setCounty(event.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            required
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Unit Count</span>
          <input
            type="number"
            min={1}
            step={1}
            value={unitCount}
            onChange={(event) => setUnitCount(event.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
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
        <h2 className="mb-2 text-sm font-medium text-gray-700">Plan Selection</h2>
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
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-300 bg-white hover:border-gray-400'
                }`}
              >
                <span className="block text-sm font-semibold text-gray-900">{plan.label}</span>
                <span className="mt-1 block text-sm text-gray-700">${plan.monthlyPriceUsd}/month</span>
                <span className="mt-1 block text-xs text-gray-600">{plan.description}</span>
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

      <label className="flex items-start gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={termsAccepted}
          onChange={(event) => setTermsAccepted(event.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-gray-300"
          required
        />
        <span>
          I agree to the{' '}
          <Link href="/legal/terms" className="text-blue-600 hover:text-blue-500">
            Terms of Service
          </Link>
          {' '}and{' '}
          <Link href="/legal/privacy" className="text-blue-600 hover:text-blue-500">
            Privacy Policy
          </Link>
          .
        </span>
      </label>

      <button
        type="submit"
        disabled={isSubmitting || isSubdomainBlocked}
        className="w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? 'Submitting...' : 'Create Account'}
      </button>
    </form>
  );
}
