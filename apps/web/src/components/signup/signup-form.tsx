'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CommunityType } from '@propertypro/shared';
import {
  getSignupPlansForCommunityType,
  isPlanAvailableForCommunityType,
  normalizeSignupSubdomain,
  SIGNUP_ADMIN_TYPES,
  signupSchema,
  type SignupAdminType,
  suggestSubdomainFromCommunityName,
  type SignupPlanId,
} from '@/lib/auth/signup-schema';
import { PasswordStrengthIndicator } from '@/components/auth/password-strength-indicator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  CommunityTypeSelector,
} from './community-type-selector';
import {
  SubdomainChecker,
  type SubdomainAvailability,
} from './subdomain-checker';
import { SignupAddressAutocomplete } from './address-autocomplete';

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

type SignupField =
  | 'primaryContactName'
  | 'adminType'
  | 'email'
  | 'password'
  | 'communityName'
  | 'addressLine1'
  | 'city'
  | 'state'
  | 'zipCode'
  | 'county'
  | 'unitCount'
  | 'candidateSlug'
  | 'termsAccepted'
  | 'planKey'
  | 'communityType';

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
  const [, setSubdomainAvailability] =
    useState<SubdomainAvailability | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [verificationState, setVerificationState] = useState<VerificationState>(
    { status: 'idle' },
  );

  const [primaryContactName, setPrimaryContactName] = useState('');
  const [adminType, setAdminType] = useState<SignupAdminType>('board_president');
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
  const [termsModalOpen, setTermsModalOpen] = useState(false);
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});
  const [errorField, setErrorField] = useState<SignupField | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

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
        adminType,
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
        const responseFieldErrors = payload.error?.details?.fieldErrors;
        const normalizedFieldErrors = Object.fromEntries(
          Object.entries(responseFieldErrors ?? {}).map(([field, messages]) => [field, messages?.[0]]),
        );
        if (Object.keys(normalizedFieldErrors).length > 0) {
          setFieldErrors(normalizedFieldErrors);
        }
        const firstField = Object.entries(normalizedFieldErrors).find(([, message]) => Boolean(message))?.[0] as SignupField | undefined;
        const firstFromFields =
          responseFieldErrors
          && Object.values(responseFieldErrors)
            .flat()
            .find((m): m is string => Boolean(m));
        setErrorField(firstField ?? null);
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
      setErrorField(null);
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

  const controlClassName = (hasError?: string) => `h-12 w-full rounded-md border bg-surface-card px-3.5 text-sm text-content transition-colors outline-none focus-visible:border-interactive focus-visible:ring-2 focus-visible:ring-interactive/30 ${
    hasError ? 'border-status-danger focus-visible:ring-status-danger/20' : 'border-edge-strong'
  }`;

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="mx-auto w-full max-w-5xl space-y-8 rounded-2xl border border-edge bg-surface-card p-6 shadow-e1 md:space-y-10 md:p-10">
      <div className="space-y-4 border-b border-edge pb-6 md:pb-8">
        <h2 className="text-2xl font-semibold tracking-tight text-content md:text-[1.75rem]">Community Administrator Signup</h2>
        <p className="max-w-3xl text-sm leading-6 text-content-secondary">
          Set up your community profile. Address autocomplete fills city, state, ZIP, and county when suggestions are available.
        </p>
      </div>

      {errorMessage ? (
        <div className="rounded-md border border-status-danger bg-status-danger-bg px-4 py-3 text-sm text-status-danger" role="alert">
          {errorMessage}
        </div>
      ) : null}

      <section className="space-y-6 rounded-xl border border-edge bg-surface-page/50 p-4 md:p-6">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold tracking-tight text-content md:text-xl">Account Details</h3>
          <p className="text-sm leading-6 text-content-secondary">Tell us who is creating this account for your community.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-content-secondary">Primary Contact Name</span>
            <input
              type="text"
              value={primaryContactName}
              onChange={(event) => {
                clearFieldFeedback('primaryContactName');
                setPrimaryContactName(event.target.value);
              }}
              className={controlClassName(fieldErrors.primaryContactName)}
              required
              minLength={2}
              maxLength={120}
            />
            {fieldErrors.primaryContactName ? (
              <span className="mt-1 block text-xs text-status-danger">{fieldErrors.primaryContactName}</span>
            ) : null}
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-content-secondary">I am signing up as</span>
            <select
              value={adminType}
              onChange={(event) => {
                clearFieldFeedback('adminType');
                setAdminType(event.target.value as SignupAdminType);
              }}
              className={controlClassName(fieldErrors.adminType)}
              required
            >
              {SIGNUP_ADMIN_TYPES.map((role) => {
                const label = role === 'board_president'
                  ? 'Board President'
                  : role === 'board_member'
                    ? 'Board Member'
                    : role === 'cam'
                      ? 'Community Association Manager (CAM)'
                      : role === 'property_manager_admin'
                        ? 'Property Manager Admin'
                        : 'Site Manager';
                return (
                  <option key={role} value={role}>{label}</option>
                );
              })}
            </select>
            {fieldErrors.adminType ? (
              <span className="mt-1 block text-xs text-status-danger">{fieldErrors.adminType}</span>
            ) : null}
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-content-secondary">Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => {
                clearFieldFeedback('email');
                setEmail(event.target.value);
              }}
              className={controlClassName(fieldErrors.email)}
              required
            />
            {fieldErrors.email ? (
              <span className="mt-1 block text-xs text-status-danger">{fieldErrors.email}</span>
            ) : null}
          </label>
        </div>

        <div className="block">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-content-secondary">Password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => {
                clearFieldFeedback('password');
                setPassword(event.target.value);
              }}
              className={controlClassName(fieldErrors.password)}
              required
              minLength={8}
              maxLength={72}
              aria-describedby="signup-password-strength"
            />
          </label>
          {fieldErrors.password ? (
            <span className="mt-1 block text-xs text-status-danger">{fieldErrors.password}</span>
          ) : null}
          <PasswordStrengthIndicator password={password} id="signup-password-strength" hideOnEmpty />
        </div>
      </section>

      <section className="space-y-6 rounded-xl border border-edge bg-surface-page/50 p-4 md:p-6">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold tracking-tight text-content md:text-xl">Community Setup</h3>
          <p className="text-sm leading-6 text-content-secondary">
            Choose your community type first, then enter profile details exactly as they should appear in your onboarding records.
          </p>
        </div>
        <div className="rounded-xl border border-edge bg-surface-card p-4">
          <CommunityTypeSelector
            value={communityType}
            onChange={(value) => {
              clearFieldFeedback('communityType');
              setCommunityType(value);
            }}
            disabled={isSubmitting}
          />
        </div>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-content-secondary">Community Name</span>
              <input
                type="text"
                value={communityName}
                onChange={(event) => handleCommunityNameChange(event.target.value)}
                className={controlClassName(fieldErrors.communityName)}
                required
                minLength={2}
                maxLength={160}
              />
              <span className="mt-1.5 block text-xs text-content-tertiary">Used for billing, legal profile, and communications.</span>
              {fieldErrors.communityName ? (
                <span className="mt-1 block text-xs text-status-danger">{fieldErrors.communityName}</span>
              ) : null}
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-content-secondary">Street Address</span>
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
              ) : (
                <span className="mt-1 block text-xs text-content-tertiary">Select a suggestion to auto-fill city, state, ZIP, and county.</span>
              )}
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-content-secondary">City</span>
              <input
                type="text"
                value={city}
                onChange={(event) => {
                  clearFieldFeedback('city');
                  setSelectedAddressSuggestionKey(null);
                  setCity(event.target.value);
                }}
                className={controlClassName(fieldErrors.city)}
                required
                maxLength={100}
              />
              {fieldErrors.city ? (
                <span className="mt-1 block text-xs text-status-danger">{fieldErrors.city}</span>
              ) : null}
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-content-secondary">State</span>
              <input
                type="text"
                value={state}
                onChange={(event) => {
                  clearFieldFeedback('state');
                  setSelectedAddressSuggestionKey(null);
                  setState(event.target.value.toUpperCase());
                }}
                className={controlClassName(fieldErrors.state)}
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
              <span className="mb-2 block text-sm font-medium text-content-secondary">ZIP Code</span>
              <input
                type="text"
                value={zipCode}
                onChange={(event) => {
                  clearFieldFeedback('zipCode');
                  setSelectedAddressSuggestionKey(null);
                  setZipCode(event.target.value);
                }}
                className={controlClassName(fieldErrors.zipCode)}
                required
                maxLength={10}
                inputMode="numeric"
              />
              {fieldErrors.zipCode ? (
                <span className="mt-1 block text-xs text-status-danger">{fieldErrors.zipCode}</span>
              ) : null}
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-content-secondary">County</span>
              <input
                type="text"
                value={county}
                onChange={(event) => {
                  clearFieldFeedback('county');
                  setSelectedAddressSuggestionKey(null);
                  setCounty(event.target.value);
                }}
                className={controlClassName(fieldErrors.county)}
                required
                minLength={2}
                maxLength={120}
              />
              {fieldErrors.county ? (
                <span className="mt-1 block text-xs text-status-danger">{fieldErrors.county}</span>
              ) : null}
            </label>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-content-secondary">Unit Count</span>
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
              className={controlClassName(fieldErrors.unitCount)}
              required
            />
            {fieldErrors.unitCount ? (
              <span className="mt-1 block text-xs text-status-danger">{fieldErrors.unitCount}</span>
            ) : null}
          </label>

        </div>
      </section>

      <section className="space-y-6 rounded-xl border border-edge bg-surface-page/50 p-4 md:p-6">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold tracking-tight text-content md:text-xl">Plan & Domain</h3>
          <p className="text-sm leading-6 text-content-secondary">Pick a plan and reserve your community URL before checkout.</p>
        </div>
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
                className={`min-h-28 rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive/30 ${
                  selected
                    ? 'border-interactive bg-interactive/10 shadow-e0'
                    : 'border-edge-strong bg-surface-card hover:border-interactive/60'
                }`}
              >
                <span className="block text-base font-semibold text-content">{plan.label}</span>
                <span className={`mt-1 block text-sm ${selected ? 'text-content' : 'text-content-secondary'}`}>${plan.monthlyPriceUsd}/month</span>
                <span className="mt-2 block text-xs leading-5 text-content-secondary">{plan.description}</span>
              </button>
            );
          })}
        </div>
        <SubdomainChecker
          value={candidateSlug}
          signupRequestId={signupRequestId}
          onChange={handleSubdomainChange}
          onAvailabilityChange={setSubdomainAvailability}
          disabled={isSubmitting}
        />
      </section>

      <section className="space-y-4 rounded-xl border border-edge bg-surface-page/50 p-4 md:p-6">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold tracking-tight text-content md:text-xl">Consent</h3>
          <p className="text-sm leading-6 text-content-secondary">Review legal terms without leaving this form. Your entries stay in place.</p>
        </div>
        <label className="flex items-start gap-3 text-sm text-content-secondary">
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
            <button type="button" onClick={() => setTermsModalOpen(true)} className="font-semibold text-content-link underline-offset-2 hover:underline">
              Terms of Service
            </button>
            {' '}and{' '}
            <button type="button" onClick={() => setPrivacyModalOpen(true)} className="font-semibold text-content-link underline-offset-2 hover:underline">
              Privacy Policy
            </button>
            .
          </span>
        </label>
        <p className="text-xs leading-5 text-content-tertiary">
          After you create your account, we email a verification link before checkout starts.
        </p>
      </section>

      <div className="border-t border-edge pt-6">
        <button
          type="submit"
          disabled={isSubmitting}
          className="h-12 w-full rounded-md bg-interactive px-4 text-sm font-semibold text-content-inverse transition-colors hover:bg-interactive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive/30 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Submitting...' : 'Create Account'}
        </button>
      </div>

      <Dialog open={termsModalOpen} onOpenChange={setTermsModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Terms of Service</DialogTitle>
            <DialogDescription>Review key terms without leaving signup.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] space-y-3 overflow-y-auto rounded-md border border-edge bg-surface-page p-4 text-sm text-content-secondary">
            <p><strong className="text-content">Effective Date:</strong> February 14, 2026</p>
            <p>PropertyPro provides compliance and community administration tools. Using the platform does not constitute legal advice.</p>
            <p>You are responsible for accurate account details, authorized usage, and community compliance obligations under applicable law.</p>
            <p>Subscription billing, cancellation, and retention terms apply as documented in the full policy.</p>
            <p>
              Need full legal text?{' '}
              <Link href="/legal/terms" target="_blank" className="font-semibold text-content-link">
                Open full Terms in a new tab
              </Link>.
            </p>
          </div>
          <DialogFooter>
            <button type="button" className="rounded-md border border-edge px-4 py-2 text-sm" onClick={() => setTermsModalOpen(false)}>Close</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={privacyModalOpen} onOpenChange={setPrivacyModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Privacy Policy</DialogTitle>
            <DialogDescription>Understand data handling without losing form progress.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] space-y-3 overflow-y-auto rounded-md border border-edge bg-surface-page p-4 text-sm text-content-secondary">
            <p><strong className="text-content">Effective Date:</strong> February 14, 2026</p>
            <p>We collect account and community information needed to deliver the platform and support compliance workflows.</p>
            <p>PropertyPro does not sell personal data. Service providers are limited to operational functions such as hosting, payments, email, and SMS delivery.</p>
            <p>You can request access, correction, or deletion of personal data subject to legal retention requirements.</p>
            <p>
              Need full legal text?{' '}
              <Link href="/legal/privacy" target="_blank" className="font-semibold text-content-link">
                Open full Privacy Policy in a new tab
              </Link>.
            </p>
          </div>
          <DialogFooter>
            <button type="button" className="rounded-md border border-edge px-4 py-2 text-sm" onClick={() => setPrivacyModalOpen(false)}>Close</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
