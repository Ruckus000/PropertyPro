'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CommunityType } from '@propertypro/shared';
import {
  getSignupPlansForCommunityType,
  isPlanAvailableForCommunityType,
  normalizeSignupSubdomain,
  signupSchema,
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

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  return `${local[0]}${'•'.repeat(4)}@${domain}`;
}

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

type VerificationState =
  | { status: 'idle' }
  | { status: 'confirming' }
  | { status: 'confirmed'; signupRequestId: string }
  | { status: 'error'; message: string };

export function SignupForm({
  initialCommunityType = 'condo_718',
  initialSignupRequestId,
  verificationReturn = false,
}: SignupFormProps) {
  const router = useRouter();
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
  const [verificationState, setVerificationState] = useState<VerificationState>(
    { status: 'idle' },
  );

  const [primaryContactName, setPrimaryContactName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [communityName, setCommunityName] = useState('');
  const [address, setAddress] = useState('');
  const [county, setCounty] = useState('');
  const [unitCount, setUnitCount] = useState('1');
  const [candidateSlug, setCandidateSlug] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});
  const formRef = useRef<HTMLFormElement>(null);

  const passwordChecks = useMemo(() => ({
    length: password.length >= 8,
    lowercase: /[a-z]/.test(password),
    uppercase: /[A-Z]/.test(password),
    number: /\d/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  }), [password]);

  const plans = useMemo(
    () => getSignupPlansForCommunityType(communityType),
    [communityType],
  );

  const normalizedCandidateSlug = useMemo(
    () => normalizeSignupSubdomain(candidateSlug),
    [candidateSlug],
  );

  useEffect(() => {
    if (!isPlanAvailableForCommunityType(communityType, planKey)) {
      setPlanKey(plans[0]!.id);
    }
  }, [communityType, planKey, plans]);

  // O-01 fix: confirm email verification status on return from Supabase redirect
  const confirmVerification = useCallback(async (requestId: string) => {
    setVerificationState({ status: 'confirming' });
    try {
      const response = await fetch('/api/v1/auth/confirm-verification', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ signupRequestId: requestId }),
      });

      const payload = (await response.json()) as {
        data?: { success: boolean; signupRequestId: string };
        error?: { message?: string };
      };

      if (!response.ok || !payload.data?.success) {
        setVerificationState({
          status: 'error',
          message: payload.error?.message ?? 'Unable to confirm email verification.',
        });
        return;
      }

      setVerificationState({
        status: 'confirmed',
        signupRequestId: payload.data.signupRequestId,
      });
    } catch {
      setVerificationState({
        status: 'error',
        message: 'Unable to confirm email verification. Please try again.',
      });
    }
  }, []);

  useEffect(() => {
    if (verificationReturn && initialSignupRequestId) {
      confirmVerification(initialSignupRequestId);
    }
  }, [verificationReturn, initialSignupRequestId, confirmVerification]);

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
    !normalizedCandidateSlug
    || normalizedCandidateSlug.length < 3
    || (
      subdomainAvailability
      && subdomainAvailability.reason !== 'available'
      && subdomainAvailability.reason !== 'checking'
    ),
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorMessage(null);
    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const requestBody = {
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
      };

      const parsed = signupSchema.safeParse(requestBody);
      if (!parsed.success) {
        const flat = parsed.error.flatten();
        const errors: Record<string, string | undefined> = {};
        for (const [field, msgs] of Object.entries(flat.fieldErrors)) {
          errors[field] = msgs?.[0];
        }
        setFieldErrors(errors);
        const firstMsg = Object.values(errors).find(Boolean)
          ?? flat.formErrors[0]
          ?? 'Please check your signup details.';
        setErrorMessage(firstMsg);
        return;
      }

      const response = await fetch('/api/v1/auth/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const payload = (await response.json()) as {
        data?: SignupApiSuccess;
        error?: {
          message?: string;
          details?: { fieldErrors?: Record<string, string[] | undefined> };
        };
      };

      if (!response.ok || !payload.data) {
        const fieldErrors = payload.error?.details?.fieldErrors;
        const firstFromFields =
          fieldErrors
          && Object.values(fieldErrors)
            .flat()
            .find((m): m is string => Boolean(m));
        setErrorMessage(
          firstFromFields
          ?? payload.error?.message
          ?? 'Unable to complete signup right now.',
        );
        return;
      }

      // Navigate to the verify page with masked email in the URL
      // (sessionStorage would be lost on new tabs; query param is simplest)
      const verifyUrl = `/signup/verify?signupRequestId=${encodeURIComponent(payload.data.signupRequestId)}&email=${encodeURIComponent(maskEmail(email))}`;
      router.push(verifyUrl);
    } catch {
      setErrorMessage('Unable to complete signup right now.');
    } finally {
      setIsSubmitting(false);
    }
  }

  // O-02 fix: when verification is confirmed, show checkout navigation instead of form
  if (verificationState.status === 'confirming') {
    return (
      <div className="space-y-6 rounded-md border border-edge bg-surface-card p-6 shadow-e0" role="status" aria-live="polite">
        <div className="flex items-center gap-3 rounded-md border border-status-info-border bg-interactive/10 px-4 py-3">
          <svg className="h-5 w-5 animate-spin text-interactive" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-sm text-content-secondary">Confirming your email verification...</span>
        </div>
      </div>
    );
  }

  if (verificationState.status === 'confirmed') {
    return (
      <div className="space-y-6 rounded-md border border-edge bg-surface-card p-6 shadow-e0">
        <div className="rounded-md border border-status-success-border bg-status-success-bg px-4 py-3" role="status">
          <p className="text-sm font-medium text-status-success">Email verified successfully.</p>
          <p className="mt-1 text-sm text-content-secondary">Your email has been confirmed. Proceed to checkout to activate your community.</p>
        </div>
        <Link
          href={`/signup/checkout?signupRequestId=${encodeURIComponent(verificationState.signupRequestId)}`}
          className="block w-full rounded-md bg-interactive px-4 py-2.5 text-center text-sm font-semibold text-content-inverse hover:bg-interactive/90"
        >
          Proceed to Checkout
        </Link>
      </div>
    );
  }

  if (verificationState.status === 'error') {
    return (
      <div className="space-y-6 rounded-md border border-edge bg-surface-card p-6 shadow-e0">
        <div className="rounded-md border border-status-danger bg-status-danger-bg px-4 py-3" role="alert">
          <p className="text-sm font-medium text-status-danger">Verification failed</p>
          <p className="mt-1 text-sm text-content-secondary">{verificationState.message}</p>
        </div>
        {initialSignupRequestId ? (
          <button
            type="button"
            onClick={() => confirmVerification(initialSignupRequestId)}
            className="w-full rounded-md bg-interactive px-4 py-2.5 text-sm font-semibold text-content-inverse hover:bg-interactive/90"
          >
            Retry Verification
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-6 rounded-md border border-edge bg-surface-card p-6 shadow-e0">

      {errorMessage ? (
        <div className="rounded-md border border-status-danger bg-status-danger-bg px-4 py-3 text-sm text-status-danger" role="alert">
          {errorMessage}
        </div>
      ) : null}


      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-content-secondary">Primary Contact Name</span>
          <input
            type="text"
            value={primaryContactName}
            onChange={(event) => setPrimaryContactName(event.target.value)}
            className={`w-full rounded-md border px-3 py-2 text-sm ${fieldErrors.primaryContactName ? 'border-status-danger' : 'border-edge-strong'}`}
            required
            minLength={2}
            maxLength={120}
          />
          {fieldErrors.primaryContactName ? (
            <span className="mt-1 block text-xs text-status-danger">{fieldErrors.primaryContactName}</span>
          ) : null}
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-content-secondary">Email</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={`w-full rounded-md border px-3 py-2 text-sm ${fieldErrors.email ? 'border-status-danger' : 'border-edge-strong'}`}
            required
          />
          {fieldErrors.email ? (
            <span className="mt-1 block text-xs text-status-danger">{fieldErrors.email}</span>
          ) : null}
        </label>
      </div>

      <div className="block">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-content-secondary">Password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={`w-full rounded-md border px-3 py-2 text-sm ${fieldErrors.password ? 'border-status-danger' : 'border-edge-strong'}`}
            required
            minLength={8}
            maxLength={72}
          />
        </label>
        {fieldErrors.password ? (
          <span className="mt-1 block text-xs text-status-danger">{fieldErrors.password}</span>
        ) : null}
        {password.length > 0 ? (
          <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs" aria-label="Password requirements">
            <li className={passwordChecks.length ? 'text-status-success' : 'text-content-secondary'}>
              {passwordChecks.length ? '\u2713' : '\u2022'} 8+ characters
            </li>
            <li className={passwordChecks.lowercase ? 'text-status-success' : 'text-content-secondary'}>
              {passwordChecks.lowercase ? '\u2713' : '\u2022'} Lowercase letter
            </li>
            <li className={passwordChecks.uppercase ? 'text-status-success' : 'text-content-secondary'}>
              {passwordChecks.uppercase ? '\u2713' : '\u2022'} Uppercase letter
            </li>
            <li className={passwordChecks.number ? 'text-status-success' : 'text-content-secondary'}>
              {passwordChecks.number ? '\u2713' : '\u2022'} Number
            </li>
            <li className={passwordChecks.special ? 'text-status-success' : 'text-content-secondary'}>
              {passwordChecks.special ? '\u2713' : '\u2022'} Special character
            </li>
          </ul>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-content-secondary">Community Name</span>
          <input
            type="text"
            value={communityName}
            onChange={(event) => handleCommunityNameChange(event.target.value)}
            className={`w-full rounded-md border px-3 py-2 text-sm ${fieldErrors.communityName ? 'border-status-danger' : 'border-edge-strong'}`}
            required
            minLength={2}
            maxLength={160}
          />
          {fieldErrors.communityName ? (
            <span className="mt-1 block text-xs text-status-danger">{fieldErrors.communityName}</span>
          ) : null}
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-content-secondary">Address</span>
          <input
            type="text"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            className={`w-full rounded-md border px-3 py-2 text-sm ${fieldErrors.address ? 'border-status-danger' : 'border-edge-strong'}`}
            required
            minLength={5}
            maxLength={240}
          />
          {fieldErrors.address ? (
            <span className="mt-1 block text-xs text-status-danger">{fieldErrors.address}</span>
          ) : null}
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-content-secondary">County</span>
          <input
            type="text"
            value={county}
            onChange={(event) => setCounty(event.target.value)}
            className={`w-full rounded-md border px-3 py-2 text-sm ${fieldErrors.county ? 'border-status-danger' : 'border-edge-strong'}`}
            required
            minLength={2}
            maxLength={120}
          />
          {fieldErrors.county ? (
            <span className="mt-1 block text-xs text-status-danger">{fieldErrors.county}</span>
          ) : null}
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-content-secondary">Unit Count</span>
          <input
            type="number"
            min={1}
            max={20000}
            step={1}
            value={unitCount}
            onChange={(event) => setUnitCount(event.target.value)}
            className={`w-full rounded-md border px-3 py-2 text-sm ${fieldErrors.unitCount ? 'border-status-danger' : 'border-edge-strong'}`}
            required
          />
          {fieldErrors.unitCount ? (
            <span className="mt-1 block text-xs text-status-danger">{fieldErrors.unitCount}</span>
          ) : null}
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
        className="w-full rounded-md bg-interactive px-4 py-2.5 text-sm font-semibold text-content-inverse hover:bg-interactive/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? 'Submitting...' : 'Create Account'}
      </button>
    </form>
  );
}
