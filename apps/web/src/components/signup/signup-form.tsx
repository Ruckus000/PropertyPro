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
import { PasswordStrengthIndicator } from '@/components/auth/password-strength-indicator';
import {
  CommunityTypeSelector,
} from './community-type-selector';
import {
  SubdomainChecker,
  type SubdomainAvailability,
} from './subdomain-checker';
import { SignupAddressAutocomplete } from './address-autocomplete';
import {
  ConfirmVerificationError,
  SignupApiError,
  useConfirmEmailVerification,
  useCreateSignup,
  type SignupField,
} from '@/hooks/use-signup';

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  return `${local[0]}${'•'.repeat(4)}@${domain}`;
}

interface SignupFormProps {
  initialCommunityType?: CommunityType;
  /** Plan pre-selected via a pricing-page deep link (`?plan=`); validated below. */
  initialPlanId?: string;
  initialSignupRequestId?: string;
  verificationReturn?: boolean;
}

type VerificationState =
  | { status: 'idle' }
  | { status: 'confirming' }
  | { status: 'confirmed'; signupRequestId: string }
  | { status: 'error'; message: string };

export function SignupForm({
  initialCommunityType = 'condo_718',
  initialPlanId,
  initialSignupRequestId,
  verificationReturn = false,
}: SignupFormProps) {
  const router = useRouter();
  const [communityType, setCommunityType] = useState<CommunityType>(initialCommunityType);
  const [planKey, setPlanKey] = useState<SignupPlanId>(() => {
    const available = getSignupPlansForCommunityType(initialCommunityType);
    // Honor a valid ?plan= deep link; the effect below self-corrects if the
    // community type later changes to one this plan isn't offered for.
    const preselected = available.find((p) => p.id === initialPlanId);
    return preselected?.id ?? available[0]!.id;
  });
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
  const [addressLine1, setAddressLine1] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [county, setCounty] = useState('');
  const [unitCount, setUnitCount] = useState('1');
  const [candidateSlug, setCandidateSlug] = useState('');
  const [selectedAddressSuggestionKey, setSelectedAddressSuggestionKey] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});
  const [errorField, setErrorField] = useState<SignupField | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const confirmMutation = useConfirmEmailVerification();
  const signupMutation = useCreateSignup();

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

  function clearFieldFeedback(field: SignupField): void {
    if (fieldErrors[field]) {
      setFieldErrors((current) => ({ ...current, [field]: undefined }));
    }
    if (errorField === field) {
      setErrorMessage(null);
      setErrorField(null);
    }
  }

  // O-01 fix: confirm email verification status on return from Supabase redirect
  const confirmVerification = useCallback(async (requestId: string) => {
    setVerificationState({ status: 'confirming' });
    try {
      const { signupRequestId: confirmedId } =
        await confirmMutation.mutateAsync(requestId);
      setVerificationState({
        status: 'confirmed',
        signupRequestId: confirmedId,
      });
    } catch (error) {
      const message =
        error instanceof ConfirmVerificationError
          ? error.message
          : 'Unable to confirm email verification. Please try again.';
      setVerificationState({ status: 'error', message });
    }
  }, [confirmMutation]);

  useEffect(() => {
    if (verificationReturn && initialSignupRequestId) {
      confirmVerification(initialSignupRequestId);
    }
  }, [verificationReturn, initialSignupRequestId, confirmVerification]);

  function handleCommunityNameChange(value: string): void {
    clearFieldFeedback('communityName');
    setCommunityName(value);
    if (!subdomainDirty) {
      setCandidateSlug(suggestSubdomainFromCommunityName(value));
    }
  }

  function handleSubdomainChange(value: string): void {
    clearFieldFeedback('candidateSlug');
    setSubdomainDirty(true);
    setCandidateSlug(value);
  }

  // Advisory-only: only local syntax blocks submit. Server's POST-time re-check
  // is still authoritative for 'taken' / 'reserved', and transient preflight
  // failures (reason='unknown') never block conversion.
  const isSubdomainBlocked = !normalizedCandidateSlug || normalizedCandidateSlug.length < 3;

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorMessage(null);
    setFieldErrors({});
    setErrorField(null);
    setIsSubmitting(true);

    try {
      const requestBody = {
        signupRequestId,
        primaryContactName,
        email,
        password,
        communityName,
        addressLine1,
        city,
        state,
        zipCode,
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
        const firstField = Object.entries(errors).find(([, message]) => Boolean(message))?.[0] as SignupField | undefined;
        const firstMsg = Object.values(errors).find(Boolean)
          ?? flat.formErrors[0]
          ?? 'Please check your signup details.';
        setErrorField(firstField ?? null);
        setErrorMessage(firstMsg);
        return;
      }

      try {
        const success = await signupMutation.mutateAsync(requestBody);
        // Navigate to the verify page with masked email in the URL
        // (sessionStorage would be lost on new tabs; query param is simplest)
        const verifyUrl = `/signup/verify?signupRequestId=${encodeURIComponent(success.signupRequestId)}&email=${encodeURIComponent(maskEmail(email))}`;
        router.push(verifyUrl);
      } catch (error) {
        if (error instanceof SignupApiError) {
          if (error.fieldErrors) {
            setFieldErrors(error.fieldErrors);
          }
          const firstField = error.fieldErrors
            ? (Object.entries(error.fieldErrors).find(([, message]) => Boolean(message))?.[0] as SignupField | undefined)
            : undefined;
          setErrorField(firstField ?? null);
          setErrorMessage(error.message);
        } else {
          setErrorField(null);
          setErrorMessage(
            error instanceof Error ? error.message : 'Unable to complete signup right now.',
          );
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  // O-02 fix: when verification is confirmed, show checkout navigation instead of form
  if (verificationState.status === 'confirming') {
    return (
      <div className="space-y-6 rounded-md border border-edge bg-surface-card p-6 shadow-e0" role="status" aria-live="polite">
        <div className="flex items-center gap-3 rounded-md border border-status-info-border bg-interactive-subtle px-4 py-3">
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
          className="block w-full rounded-md bg-interactive px-4 py-2.5 text-center text-sm font-semibold text-content-inverse hover:bg-interactive-hover"
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
            className="w-full rounded-md bg-interactive px-4 py-2.5 text-sm font-semibold text-content-inverse hover:bg-interactive-hover"
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

      {/* B4 (regroup increment): the previously-ungrouped 12-field form is now
          chunked into three labeled sections so it scans as progressive steps.
          The full Next/Back step wizard is a follow-up. */}
      <h2 className="text-sm font-semibold uppercase tracking-wide text-content-tertiary">
        1 · Your account
      </h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-content-secondary">Primary Contact Name</span>
          <input
            type="text"
            value={primaryContactName}
            onChange={(event) => {
              clearFieldFeedback('primaryContactName');
              setPrimaryContactName(event.target.value);
            }}
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
            onChange={(event) => {
              clearFieldFeedback('email');
              setEmail(event.target.value);
              // A6: if the user returned via "Wrong email? Go back" and is now
              // editing the email, don't reuse the original signupRequestId — the
              // server rejects a reused id with a changed email (hijack guard).
              // Dropping it makes the corrected email start a fresh signup.
              if (initialSignupRequestId && signupRequestId === initialSignupRequestId) {
                setSignupRequestId(undefined);
              }
            }}
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
            onChange={(event) => {
              clearFieldFeedback('password');
              setPassword(event.target.value);
            }}
            className={`w-full rounded-md border px-3 py-2 text-sm ${fieldErrors.password ? 'border-status-danger' : 'border-edge-strong'}`}
            required
            minLength={8}
            maxLength={72}
            aria-describedby="signup-password-strength"
          />
        </label>
        {fieldErrors.password ? (
          <span className="mt-1 block text-xs text-status-danger">{fieldErrors.password}</span>
        ) : null}
        <PasswordStrengthIndicator
          password={password}
          id="signup-password-strength"
          hideOnEmpty
        />
      </div>

      <h2 className="text-sm font-semibold uppercase tracking-wide text-content-tertiary">
        2 · Your community
      </h2>

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
          <span className="mb-1 block text-sm font-medium text-content-secondary">Street Address</span>
          <SignupAddressAutocomplete
            inputId="signup-address-line-1"
            value={addressLine1}
            selectedSuggestionKey={selectedAddressSuggestionKey}
            onValueChange={(nextValue) => {
              clearFieldFeedback('addressLine1');
              setAddressLine1(nextValue);
            }}
            onSuggestionSelect={(suggestion) => {
              clearFieldFeedback('addressLine1');
              clearFieldFeedback('city');
              clearFieldFeedback('state');
              clearFieldFeedback('zipCode');
              clearFieldFeedback('county');
              setAddressLine1(suggestion.addressLine1);
              setCity(suggestion.city);
              setState(suggestion.state);
              setZipCode(suggestion.zipCode);
              setCounty(suggestion.county);
            }}
            onSelectedSuggestionChange={setSelectedAddressSuggestionKey}
            disabled={isSubmitting}
            invalid={Boolean(fieldErrors.addressLine1)}
          />
          {fieldErrors.addressLine1 ? (
            <span className="mt-1 block text-xs text-status-danger">{fieldErrors.addressLine1}</span>
          ) : null}
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-content-secondary">City</span>
          <input
            type="text"
            value={city}
            onChange={(event) => {
              clearFieldFeedback('city');
              setSelectedAddressSuggestionKey(null);
              setCity(event.target.value);
            }}
            className={`w-full rounded-md border px-3 py-2 text-sm ${fieldErrors.city ? 'border-status-danger' : 'border-edge-strong'}`}
            required
            maxLength={100}
          />
          {fieldErrors.city ? (
            <span className="mt-1 block text-xs text-status-danger">{fieldErrors.city}</span>
          ) : null}
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-content-secondary">State</span>
          <input
            type="text"
            value={state}
            onChange={(event) => {
              clearFieldFeedback('state');
              setSelectedAddressSuggestionKey(null);
              setState(event.target.value.toUpperCase());
            }}
            className={`w-full rounded-md border px-3 py-2 text-sm ${fieldErrors.state ? 'border-status-danger' : 'border-edge-strong'}`}
            required
            maxLength={2}
          />
          {fieldErrors.state ? (
            <span className="mt-1 block text-xs text-status-danger">{fieldErrors.state}</span>
          ) : null}
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-content-secondary">ZIP Code</span>
          <input
            type="text"
            value={zipCode}
            onChange={(event) => {
              clearFieldFeedback('zipCode');
              setSelectedAddressSuggestionKey(null);
              setZipCode(event.target.value);
            }}
            className={`w-full rounded-md border px-3 py-2 text-sm ${fieldErrors.zipCode ? 'border-status-danger' : 'border-edge-strong'}`}
            required
            maxLength={10}
            inputMode="numeric"
          />
          {fieldErrors.zipCode ? (
            <span className="mt-1 block text-xs text-status-danger">{fieldErrors.zipCode}</span>
          ) : null}
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-content-secondary">County</span>
          <input
            type="text"
            value={county}
            onChange={(event) => {
              clearFieldFeedback('county');
              setSelectedAddressSuggestionKey(null);
              setCounty(event.target.value);
            }}
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
            onChange={(event) => {
              clearFieldFeedback('unitCount');
              setUnitCount(event.target.value);
            }}
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
        onChange={(value) => {
          clearFieldFeedback('communityType');
          setCommunityType(value);
        }}
        disabled={isSubmitting}
      />

      <h2 className="text-sm font-semibold uppercase tracking-wide text-content-tertiary">
        3 · Your plan
      </h2>

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
                onClick={() => {
                  clearFieldFeedback('planKey');
                  setPlanKey(plan.id);
                }}
                disabled={isSubmitting}
                className={`rounded-md border p-3 text-left transition-colors ${
                  selected
                    ? 'border-interactive bg-interactive-subtle'
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
          onChange={(event) => {
            clearFieldFeedback('termsAccepted');
            setTermsAccepted(event.target.checked);
          }}
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
        className="w-full rounded-md bg-interactive px-4 py-2.5 text-sm font-semibold text-content-inverse hover:bg-interactive-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? 'Submitting...' : 'Create Account'}
      </button>
    </form>
  );
}
