'use client';

import {
  type ChangeEvent,
  type CSSProperties,
  type ReactNode,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CommunityType } from '@propertypro/shared';
import { buildPasswordZodSchema } from '@propertypro/shared';
import {
  getSignupPlansForCommunityType,
  normalizeSignupSubdomain,
  SIGNUP_ADMIN_TYPES,
  signupSchema,
  type SignupAdminType,
  suggestSubdomainFromCommunityName,
  type SignupPlanId,
} from '@/lib/auth/signup-schema';
import { useSubdomainAvailability } from '@/components/signup/use-subdomain-availability';
import { SignupAddressAutocomplete } from '@/components/signup/address-autocomplete';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { COMMUNITY_TYPES, REFERENCE_PLANS_CONDO_HOA, spacePx, STEPS_4 } from './clean-wizard-config';
import { cleanStyles, type StepChipState } from './clean-wizard-styles';
import { fieldToStepIndex, type CleanWizardFormState, type SignupField } from './clean-wizard-types';
import { cleanSignupFontClassName } from './fonts';
import './clean-wizard.css';

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) {
    return email;
  }
  return `${local[0]}${'•'.repeat(4)}@${domain}`;
}

function communityTypeToKey(ct: CommunityType): CleanWizardFormState['communityTypeKey'] {
  if (ct === 'condo_718') {
    return 'condo';
  }
  if (ct === 'hoa_720') {
    return 'hoa';
  }
  return 'apt';
}

function keyToCommunityType(key: CleanWizardFormState['communityTypeKey']): CommunityType {
  if (key === 'condo') {
    return 'condo_718';
  }
  if (key === 'hoa') {
    return 'hoa_720';
  }
  return 'apartment';
}

const REGULAR_GAP = spacePx('regular', { tight: 12, regular: 18, airy: 24 });

const passwordSchema = buildPasswordZodSchema();

const ADMIN_ROLE_COPY: Record<SignupAdminType, { label: string; desc: string }> = {
  board_president: { label: 'Board President', desc: 'Presiding officer for the board and public filings.' },
  board_member: { label: 'Board Member', desc: 'Director, treasurer, secretary, or other elected role.' },
  cam: { label: 'Community Association Manager (CAM)', desc: 'Licensed CAM or management company lead.' },
  property_manager_admin: { label: 'Property Manager Admin', desc: 'Portfolio or regional administrator for your firm.' },
  site_manager: { label: 'Site Manager', desc: 'On-site lead for staff and day-to-day operations.' },
};

function passwordStrength(pw: string): { score: number; label: string } {
  if (!pw) {
    return { score: 0, label: '' };
  }
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  const labels = ['Too short', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent'];
  return { score: s, label: labels[s] ?? 'Excellent' };
}

function Field({
  label,
  children,
  full,
  hint,
  optional,
  error,
  span,
}: {
  label?: string;
  children: ReactNode;
  full?: boolean;
  hint?: string;
  optional?: boolean;
  error?: string;
  span?: number;
}) {
  const style: CSSProperties = { display: 'block', minWidth: 0 };
  if (full) {
    Object.assign(style, cleanStyles.fieldFull);
  }
  if (span) {
    style.gridColumn = `span ${span}`;
  }
  return (
    <label style={style}>
      {label && (
        <span
          style={{
            ...cleanStyles.label,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            whiteSpace: 'nowrap',
          }}
        >
          <span>{label}</span>
          {optional && (
            <span style={{ fontWeight: 400, color: 'var(--ink-faint)', fontSize: 11 }}>Optional</span>
          )}
        </span>
      )}
      {children}
      {hint && !error && <div style={cleanStyles.hint}>{hint}</div>}
      {error && <div style={{ ...cleanStyles.hint, color: 'oklch(0.52 0.14 25)' }}>{error}</div>}
    </label>
  );
}

function FloatField({
  label,
  value,
  onChange,
  type = 'text',
  full,
  span,
  hint,
  suffix,
  autoComplete,
  error,
}: {
  label: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  full?: boolean;
  span?: number;
  hint?: string;
  suffix?: string;
  autoComplete?: string;
  error?: string;
}) {
  const [focused, setFocused] = useState(false);
  const float = focused || Boolean(value);
  const style: CSSProperties = { display: 'block', minWidth: 0, position: 'relative' };
  if (full) {
    Object.assign(style, cleanStyles.fieldFull);
  }
  if (span) {
    style.gridColumn = `span ${span}`;
  }
  return (
    <label style={style}>
      <div
        style={{
          position: 'relative',
          height: 52,
          border: `1px solid ${focused ? 'var(--accent)' : 'var(--line)'}`,
          borderRadius: 10,
          background: 'white',
          boxShadow: focused ? '0 0 0 3px oklch(0.68 0.12 275 / 0.15)' : 'none',
          transition: 'border-color .15s, box-shadow .15s',
          display: 'flex',
          alignItems: 'stretch',
        }}
      >
        <span
          style={{
            position: 'absolute',
            left: 14,
            top: float ? 8 : '50%',
            transform: float ? 'none' : 'translateY(-50%)',
            fontSize: float ? 10.5 : 14,
            letterSpacing: float ? '0.03em' : 0,
            textTransform: float ? 'uppercase' : 'none',
            color: 'var(--ink-faint)',
            fontWeight: float ? 500 : 400,
            pointerEvents: 'none',
            transition: 'all .15s cubic-bezier(0.2,0.8,0.2,1)',
            fontFamily: float ? 'var(--font-jetbrains-mono), "JetBrains Mono", monospace' : 'inherit',
          }}
        >
          {label}
        </span>
        <input
          type={type}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          onFocus={() => {
            setFocused(true);
          }}
          onBlur={() => {
            setFocused(false);
          }}
          style={{
            flex: 1,
            height: '100%',
            padding: '18px 14px 6px',
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontSize: 14,
            color: 'var(--ink)',
            minWidth: 0,
          }}
        />
        {suffix && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '0 14px',
              background: 'oklch(0.96 0.005 95)',
              borderLeft: '1px solid var(--line)',
              fontSize: 13,
              color: 'var(--ink-soft)',
              fontFamily: 'var(--font-jetbrains-mono), "JetBrains Mono", monospace',
              borderRadius: '0 9px 9px 0',
            }}
          >
            {suffix}
          </div>
        )}
      </div>
      {error && <div style={{ ...cleanStyles.hint, color: 'oklch(0.52 0.14 25)' }}>{error}</div>}
      {hint && !error && <div style={cleanStyles.hint}>{hint}</div>}
    </label>
  );
}

function SectionHead({ num, title, desc }: { num: string; title: string; desc?: string }) {
  return (
    <div
      style={{
        gridColumn: '1 / -1',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginTop: 10,
        marginBottom: -4,
        minWidth: 0,
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-jetbrains-mono), "JetBrains Mono", monospace',
          fontSize: 11,
          letterSpacing: '0.06em',
          color: 'var(--ink-faint)',
          flexShrink: 0,
        }}
      >
        {num}
      </span>
      <h3
        style={{
          fontSize: 13,
          fontWeight: 600,
          margin: 0,
          letterSpacing: '-0.005em',
          whiteSpace: 'nowrap',
        }}
      >
        {title}
      </h3>
      {desc && (
        <span
          style={{
            fontSize: 12,
            color: 'var(--ink-faint)',
            marginLeft: 'auto',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            minWidth: 0,
          }}
        >
          {desc}
        </span>
      )}
    </div>
  );
}

function PasswordStrength({ pw, confirm }: { pw: string; confirm: string }) {
  const { score, label } = passwordStrength(pw);
  const segs = 5;
  const match = pw && confirm && pw === confirm;
  return (
    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, display: 'flex', gap: 3 }}>
        {Array.from({ length: segs }).map((_, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 3,
              borderRadius: 2,
              background: i < score
                ? score < 3
                  ? 'oklch(0.70 0.15 45)'
                  : score < 4
                    ? 'oklch(0.72 0.13 95)'
                    : 'oklch(0.62 0.13 160)'
                : 'var(--line)',
              transition: 'background .2s',
            }}
          />
        ))}
      </div>
      <span
        style={{
          fontSize: 11,
          color: 'var(--ink-faint)',
          minWidth: 64,
          textAlign: 'right',
          fontFamily: 'var(--font-jetbrains-mono), "JetBrains Mono", monospace',
        }}
      >
        {label || '—'}
      </span>
      {pw && confirm && (
        <span
          style={{
            fontSize: 11,
            color: match ? 'oklch(0.55 0.12 160)' : 'oklch(0.55 0.14 25)',
            minWidth: 56,
            textAlign: 'right',
          }}
        >
          {match ? '✓ match' : '✗ differ'}
        </span>
      )}
    </div>
  );
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

export interface CleanSignupWizardProps {
  initialCommunityType?: CommunityType;
  initialSignupRequestId?: string;
  verificationReturn?: boolean;
}

export function CleanSignupWizard({
  initialCommunityType = 'condo_718',
  initialSignupRequestId,
  verificationReturn = false,
}: CleanSignupWizardProps) {
  const router = useRouter();

  const [form, setForm] = useState<CleanWizardFormState>(() => {
    const key = communityTypeToKey(initialCommunityType);
    return {
      firstName: '',
      lastName: '',
      adminType: 'board_president',
      email: '',
      password: '',
      confirmPassword: '',
      communityName: '',
      addressLine1: '',
      city: '',
      state: '',
      zipCode: '',
      county: '',
      communityTypeKey: key,
      unitCount: 48,
      planKey: getSignupPlansForCommunityType(initialCommunityType)[0]!.id,
      billing: 'monthly',
      candidateSlug: '',
      termsAccepted: false,
      subdomainTouched: false,
    };
  });

  const [idx, setIdx] = useState(0);
  const [selectedAddressSuggestionKey, setSelectedAddressSuggestionKey] = useState<string | null>(null);
  const [signupRequestId, setSignupRequestId] = useState<string | undefined>(initialSignupRequestId);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<SignupField, string>>>({});
  const [errorField, setErrorField] = useState<SignupField | null>(null);
  const [verificationState, setVerificationState] = useState<VerificationState>({ status: 'idle' });
  const [termsModalOpen, setTermsModalOpen] = useState(false);
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);

  const displayPlans = useMemo(() => {
    if (form.communityTypeKey === 'condo' || form.communityTypeKey === 'hoa') {
      return REFERENCE_PLANS_CONDO_HOA;
    }
    return getSignupPlansForCommunityType('apartment').map((p) => ({
      id: p.id,
      name: p.label,
      price: p.monthlyPriceUsd,
      blurb: p.description,
      bullets: [p.description] as readonly string[],
      recommended: true,
    }));
  }, [form.communityTypeKey]);

  const gap = REGULAR_GAP;
  const total = STEPS_4.length;
  const step = STEPS_4[Math.min(idx, total - 1)]!;
  const progress = ((idx + 1) / total) * 100;
  const showPanel = true;

  const communityType = useMemo(
    () => keyToCommunityType(form.communityTypeKey),
    [form.communityTypeKey],
  );

  const plansFromSchema = useMemo(
    () => getSignupPlansForCommunityType(communityType),
    [communityType],
  );

  useEffect(() => {
    const first = plansFromSchema[0];
    if (first && !plansFromSchema.some((p) => p.id === form.planKey)) {
      setForm((f) => ({ ...f, planKey: first.id }));
    }
  }, [plansFromSchema, form.planKey]);

  useEffect(() => {
    if (form.subdomainTouched) {
      return;
    }
    if (!form.communityName.trim()) {
      return;
    }
    const slug = suggestSubdomainFromCommunityName(form.communityName);
    if (slug) {
      setForm((f) => ({ ...f, candidateSlug: slug }));
    }
  }, [form.communityName, form.subdomainTouched]);

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
      void confirmVerification(initialSignupRequestId);
    }
  }, [verificationReturn, initialSignupRequestId, confirmVerification]);

  const primaryContactName = useMemo(
    () => `${form.firstName} ${form.lastName}`.trim(),
    [form.firstName, form.lastName],
  );

  const subdomainAvailability = useSubdomainAvailability(form.candidateSlug, signupRequestId);

  const update = useCallback(
    (patch: Partial<CleanWizardFormState> | ((p: CleanWizardFormState) => CleanWizardFormState)) => {
      setForm((prev) => (typeof patch === 'function' ? patch(prev) : { ...prev, ...patch }));
    },
    [],
  );

  const clearFieldFeedback = useCallback(
    (field: SignupField) => {
      if (fieldErrors[field]) {
        setFieldErrors((c) => ({ ...c, [field]: undefined }));
      }
      if (errorField === field) {
        setErrorMessage(null);
        setErrorField(null);
      }
    },
    [errorField, fieldErrors],
  );

  const routeErrorsToStep = useCallback(
    (errors: Partial<Record<SignupField, string | undefined>>) => {
      const first = (Object.keys(errors) as SignupField[]).find(
        (k) => errors[k],
      );
      if (first) {
        setIdx(fieldToStepIndex(first));
      }
    },
    [setIdx],
  );

  function validateAccountStep(): boolean {
    const nextErrors: typeof fieldErrors = {};
    if (form.firstName.trim().length < 1) {
      nextErrors.primaryContactName = 'First name is required';
    }
    if (form.lastName.trim().length < 1) {
      nextErrors.primaryContactName = 'Last name is required';
    }
    if (primaryContactName.length < 2) {
      nextErrors.primaryContactName = 'Primary contact name is required';
    }
    const em = form.email.trim();
    if (!em) {
      nextErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      nextErrors.email = 'Please enter a valid email address';
    }
    const pw = passwordSchema.safeParse(form.password);
    if (!form.password) {
      nextErrors.password = 'Password is required';
    } else if (!pw.success) {
      nextErrors.password = pw.error.issues[0]?.message ?? 'Invalid password';
    }
    if (form.password !== form.confirmPassword) {
      nextErrors.password = nextErrors.password ?? 'Passwords must match';
    }
    setFieldErrors((e) => ({ ...e, ...nextErrors }));
    if (Object.keys(nextErrors).length > 0) {
      return false;
    }
    return true;
  }

  function validateCommunityStep(): boolean {
    const nextErrors: typeof fieldErrors = {};
    if (form.communityName.trim().length < 2) {
      nextErrors.communityName = 'Community name is required';
    }
    if (!form.addressLine1.trim() || form.addressLine1.trim().length < 5) {
      nextErrors.addressLine1 = 'Street address is required';
    }
    if (!form.city.trim()) {
      nextErrors.city = 'City is required';
    }
    if (!form.state.trim() || !/^[A-Z]{2}$/i.test(form.state.trim())) {
      nextErrors.state = 'State must be a 2-letter abbreviation';
    }
    if (!form.zipCode.trim()) {
      nextErrors.zipCode = 'ZIP Code is required';
    }
    if (!form.county.trim() || form.county.trim().length < 2) {
      nextErrors.county = 'County is required';
    }
    if (!form.unitCount || form.unitCount < 1) {
      nextErrors.unitCount = 'Unit count is required';
    }
    setFieldErrors((e) => ({ ...e, ...nextErrors }));
    return Object.keys(nextErrors).length === 0;
  }

  function validatePlanStep(): boolean {
    if (!displayPlans.some((p) => p.id === form.planKey)) {
      setFieldErrors((e) => ({ ...e, planKey: 'Select a plan' }));
      return false;
    }
    return true;
  }

  function validateFinishStep(): boolean {
    const nextErrors: typeof fieldErrors = {};
    if (!form.termsAccepted) {
      nextErrors.termsAccepted = 'You must accept the Terms of Service to continue';
    }
    const slug = normalizeSignupSubdomain(form.candidateSlug);
    if (slug.length < 3) {
      nextErrors.candidateSlug = 'Subdomain must be at least 3 characters';
    }
    setFieldErrors((e) => ({ ...e, ...nextErrors }));
    return Object.keys(nextErrors).length === 0;
  }

  function validateCurrentStep(): boolean {
    if (idx === 0) {
      return validateAccountStep();
    }
    if (idx === 1) {
      return validateCommunityStep();
    }
    if (idx === 2) {
      return validatePlanStep();
    }
    return validateFinishStep();
  }

  async function runSubmit(): Promise<void> {
    if (isSubmitting) {
      return;
    }
    setErrorMessage(null);
    setErrorField(null);
    if (!validateFinishStep() || !validateAccountStep() || !validateCommunityStep() || !validatePlanStep()) {
      return;
    }

    setIsSubmitting(true);
    try {
      const requestBody = {
        signupRequestId,
        primaryContactName,
        adminType: form.adminType,
        email: form.email.trim(),
        password: form.password,
        communityName: form.communityName.trim(),
        address: '',
        addressLine1: form.addressLine1.trim(),
        city: form.city.trim(),
        state: form.state.trim().toUpperCase(),
        zipCode: form.zipCode.trim(),
        county: form.county.trim(),
        unitCount: form.unitCount,
        communityType: keyToCommunityType(form.communityTypeKey),
        planKey: form.planKey,
        candidateSlug: form.candidateSlug,
        termsAccepted: form.termsAccepted,
      };

      const parsed = signupSchema.safeParse(requestBody);
      if (!parsed.success) {
        const flat = parsed.error.flatten();
        const errors: Record<string, string | undefined> = {};
        for (const [f, msgs] of Object.entries(flat.fieldErrors)) {
          errors[f] = msgs?.[0];
        }
        setFieldErrors(errors);
        const firstField = Object.entries(errors).find(([, m]) => Boolean(m))?.[0] as SignupField | undefined;
        setErrorField(firstField ?? null);
        routeErrorsToStep(errors);
        setErrorMessage(
          Object.values(errors).find(Boolean)
            ?? flat.formErrors[0]
            ?? 'Please check your signup details.',
        );
        return;
      }

      const response = await fetch('/api/v1/auth/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (response.status === 429) {
        setErrorField(null);
        setErrorMessage('Too many signup attempts. Please wait a minute and try again.');
        return;
      }

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
          Object.entries(responseFieldErrors ?? {}).map(([f, msgs]) => [f, msgs?.[0]]),
        ) as Partial<Record<SignupField, string>>;
        if (Object.keys(normalizedFieldErrors).length > 0) {
          setFieldErrors(normalizedFieldErrors);
        }
        const firstField = Object.entries(normalizedFieldErrors).find(
          ([, m]) => Boolean(m),
        )?.[0] as SignupField | undefined;
        setErrorField(firstField ?? null);
        if (Object.keys(normalizedFieldErrors).length > 0) {
          routeErrorsToStep(normalizedFieldErrors);
        }
        const firstFromFields =
          responseFieldErrors
          && Object.values(responseFieldErrors)
            .flat()
            .find((m): m is string => Boolean(m));
        setErrorMessage(
          firstFromFields
            ?? payload.error?.message
            ?? 'Unable to complete signup right now.',
        );
        return;
      }

      if (payload.data.signupRequestId) {
        setSignupRequestId(payload.data.signupRequestId);
      }

      const verifyUrl = `/signup/verify?signupRequestId=${encodeURIComponent(
        payload.data.signupRequestId,
      )}&email=${encodeURIComponent(maskEmail(form.email))}`;
      router.push(verifyUrl);
    } catch {
      setErrorField(null);
      setErrorMessage('Unable to complete signup right now.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function goNextOrSubmit() {
    if (isSubmitting) {
      return;
    }
    if (!validateCurrentStep()) {
      setErrorMessage('Please complete the required fields in this step.');
      return;
    }
    if (idx >= total - 1) {
      void runSubmit();
    } else {
      setErrorMessage(null);
      setIdx((i) => Math.min(i + 1, total - 1));
    }
  }

  function onFormSubmit(e: FormEvent) {
    e.preventDefault();
    goNextOrSubmit();
  }

  if (verificationState.status === 'confirming') {
    return (
      <div className="clean-signup-root max-w-2xl rounded-md border p-6" style={{ borderColor: 'var(--line)' }} role="status" aria-live="polite">
        <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
          Confirming your email verification...
        </p>
      </div>
    );
  }

  if (verificationState.status === 'confirmed') {
    return (
      <div className="clean-signup-root max-w-2xl space-y-4 rounded-md border p-6" style={{ borderColor: 'var(--line)' }}>
        <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
          Email verified successfully.
        </p>
        <Link
          href={`/signup/checkout?signupRequestId=${encodeURIComponent(verificationState.signupRequestId)}`}
          className="inline-block rounded-md px-4 py-2.5 text-center text-sm font-semibold text-white"
          style={{ background: 'var(--ink)' }}
        >
          Proceed to Checkout
        </Link>
      </div>
    );
  }

  if (verificationState.status === 'error') {
    return (
      <div className="clean-signup-root max-w-2xl space-y-4 rounded-md border p-6" style={{ borderColor: 'var(--line)' }} role="alert">
        <p className="text-sm" style={{ color: 'oklch(0.52 0.14 25)' }}>{verificationState.message}</p>
        {initialSignupRequestId && (
          <button
            type="button"
            onClick={() => {
              void confirmVerification(initialSignupRequestId);
            }}
            className="rounded-md px-4 py-2 text-sm text-white"
            style={{ background: 'var(--ink)' }}
          >
            Retry verification
          </button>
        )}
      </div>
    );
  }

  const planObj = displayPlans.find((p) => p.id === form.planKey);
  const planMonthly =
    form.billing === 'annual' && planObj
      ? Math.round(planObj.price * 0.85)
      : planObj?.price ?? 0;
  const savings = form.billing === 'annual' ? '· save ~15%' : '';
  const communityLabel =
    COMMUNITY_TYPES.find((t) => t.id === form.communityTypeKey)?.label ?? '—';

  const subMessageColor =
    !subdomainAvailability
      ? 'var(--ink-faint)'
      : subdomainAvailability.reason === 'available'
        ? 'oklch(0.55 0.12 160)'
        : subdomainAvailability.reason === 'checking' || subdomainAvailability.reason === 'unknown'
          ? 'var(--ink-faint)'
          : 'oklch(0.55 0.14 25)';

  return (
    <form
      className={`clean-signup-root min-h-0 w-full min-w-0 ${cleanSignupFontClassName}`}
      onSubmit={onFormSubmit}
    >
      <div
        style={{
          ...cleanStyles.shell,
          display: 'grid',
          gridTemplateColumns: showPanel ? '1fr 280px' : '1fr',
          minHeight: '100%',
        }}
      >
        <div style={{ ...cleanStyles.shell, minWidth: 0 }}>
          <div style={cleanStyles.topbar}>
            <div style={cleanStyles.brand}>
              <span style={cleanStyles.brandDot} />
              PropertyPro
            </div>
            <div style={cleanStyles.help}>
              Already have an account?{' '}
              <Link href="/auth/login" style={cleanStyles.helpLink}>
                Log in
              </Link>
            </div>
          </div>

          <div style={cleanStyles.progressWrap}>
            <div style={cleanStyles.progressBar}>
              <div style={{ ...cleanStyles.progressFill, width: `${progress}%` }} />
            </div>
            <div style={cleanStyles.stepperRow}>
              {STEPS_4.map((s, i) => {
                const st: StepChipState = i < idx ? 'done' : i === idx ? 'current' : 'locked';
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      if (i <= idx) {
                        setIdx(i);
                      }
                    }}
                    style={{ ...cleanStyles.stepChip(st), background: 'none', border: 'none', padding: 0 }}
                  >
                    <div style={cleanStyles.stepNum(st)}>{String(i + 1).padStart(2, '0')}</div>
                    <div style={cleanStyles.stepTitle(st)}>{s.title}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={cleanStyles.body}>
            <div style={cleanStyles.eyebrow}>
              Step {String(idx + 1).padStart(2, '0')} of {String(total).padStart(2, '0')}
            </div>
            <h1 style={cleanStyles.h1}>{step.title}</h1>
            <p style={cleanStyles.sub}>{step.sub}</p>

            {errorMessage && (
              <div
                style={{
                  marginTop: 12,
                  fontSize: 13,
                  color: 'oklch(0.52 0.14 25)',
                }}
                role="alert"
              >
                {errorMessage}
              </div>
            )}

            {step.id === 'account' && (
              <div style={cleanStyles.formSection(gap)}>
                <SectionHead num="01" title="Your name" desc="Appears on compliance filings" />
                <FloatField
                  label="First name"
                  value={form.firstName}
                  onChange={(e) => {
                    clearFieldFeedback('primaryContactName');
                    update({ firstName: e.target.value });
                  }}
                  autoComplete="given-name"
                  error={errorField === 'primaryContactName' ? fieldErrors.primaryContactName : undefined}
                />
                <FloatField
                  label="Last name"
                  value={form.lastName}
                  onChange={(e) => {
                    clearFieldFeedback('primaryContactName');
                    update({ lastName: e.target.value });
                  }}
                  autoComplete="family-name"
                  error={errorField === 'primaryContactName' ? fieldErrors.primaryContactName : undefined}
                />

                <SectionHead num="02" title="Your role" desc="So we can tailor the dashboard" />
                <div
                  style={{
                    gridColumn: '1 / -1',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 10,
                  }}
                >
                  {SIGNUP_ADMIN_TYPES.map((role) => {
                    const r = ADMIN_ROLE_COPY[role];
                    const selected = form.adminType === role;
                    return (
                      <button
                        key={role}
                        type="button"
                        onClick={() => {
                          clearFieldFeedback('adminType');
                          update({ adminType: role });
                        }}
                        style={{
                          textAlign: 'left',
                          padding: '12px 14px',
                          cursor: 'pointer',
                          border: selected ? '1.5px solid var(--accent)' : '1px solid var(--line)',
                          background: selected ? 'var(--accent-wash)' : 'white',
                          borderRadius: 10,
                          transition: 'all .12s',
                          boxShadow: selected ? '0 0 0 3px oklch(0.68 0.12 275 / 0.15)' : 'none',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                        }}
                      >
                        <span
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: 999,
                            flexShrink: 0,
                            border: selected ? '5px solid var(--accent)' : '1.5px solid var(--line)',
                            background: 'white',
                            transition: 'all .12s',
                          }}
                        />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{r.label}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 2 }}>{r.desc}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {fieldErrors.adminType && (
                  <div
                    style={{ ...cleanStyles.hint, gridColumn: '1 / -1', color: 'oklch(0.52 0.14 25)' }}
                  >
                    {fieldErrors.adminType}
                  </div>
                )}

                <SectionHead num="03" title="Login details" desc="You'll use these to sign in" />
                <FloatField
                  label="Email"
                  value={form.email}
                  onChange={(e) => {
                    clearFieldFeedback('email');
                    update({ email: e.target.value });
                  }}
                  full
                  autoComplete="email"
                  type="email"
                  error={errorField === 'email' ? fieldErrors.email : undefined}
                />
                <FloatField
                  label="Password"
                  type="password"
                  value={form.password}
                  onChange={(e) => {
                    clearFieldFeedback('password');
                    update({ password: e.target.value });
                  }}
                  error={errorField === 'password' ? fieldErrors.password : undefined}
                />
                <FloatField
                  label="Confirm password"
                  type="password"
                  value={form.confirmPassword}
                  onChange={(e) => {
                    update({ confirmPassword: e.target.value });
                  }}
                />
                <div style={{ gridColumn: '1 / -1' }}>
                  <PasswordStrength pw={form.password} confirm={form.confirmPassword} />
                </div>
              </div>
            )}

            {step.id === 'community' && (
              <div style={cleanStyles.formSection(gap)}>
                <SectionHead num="01" title="Community identity" />
                <Field label="Community name" full hint="As it appears on official governing documents" error={fieldErrors.communityName}>
                  <input
                    style={cleanStyles.input}
                    placeholder="Seabreeze Towers Condominium Association"
                    value={form.communityName}
                    onChange={(e) => {
                      clearFieldFeedback('communityName');
                      update({ communityName: e.target.value });
                    }}
                  />
                </Field>

                <SectionHead num="02" title="Property address" desc="Used for jurisdiction & filings" />
                <Field label="Street address" full error={fieldErrors.addressLine1}>
                  <SignupAddressAutocomplete
                    inputId="clean-signup-address-line-1"
                    value={form.addressLine1}
                    selectedSuggestionKey={selectedAddressSuggestionKey}
                    onValueChange={(next) => {
                      clearFieldFeedback('addressLine1');
                      update({ addressLine1: next });
                    }}
                    onSuggestionSelect={(suggestion) => {
                      clearFieldFeedback('addressLine1');
                      clearFieldFeedback('city');
                      clearFieldFeedback('state');
                      clearFieldFeedback('zipCode');
                      clearFieldFeedback('county');
                      update({
                        addressLine1: suggestion.addressLine1,
                        city: suggestion.city,
                        state: suggestion.state,
                        zipCode: suggestion.zipCode,
                        county: suggestion.county,
                      });
                    }}
                    onSelectedSuggestionChange={setSelectedAddressSuggestionKey}
                    disabled={isSubmitting}
                    invalid={Boolean(fieldErrors.addressLine1)}
                    inputClassName="!h-[42px] !rounded-[10px] !border !border-[var(--line)] !bg-white !px-[14px] !text-sm !text-[var(--ink)]"
                  />
                </Field>
                <Field label="City" error={fieldErrors.city}>
                  <input
                    style={cleanStyles.input}
                    placeholder="West Palm Beach"
                    value={form.city}
                    onChange={(e) => {
                      clearFieldFeedback('city');
                      setSelectedAddressSuggestionKey(null);
                      update({ city: e.target.value });
                    }}
                  />
                </Field>
                <Field label="County" error={fieldErrors.county}>
                  <input
                    style={cleanStyles.input}
                    placeholder="Palm Beach"
                    value={form.county}
                    onChange={(e) => {
                      clearFieldFeedback('county');
                      setSelectedAddressSuggestionKey(null);
                      update({ county: e.target.value });
                    }}
                  />
                </Field>
                <Field label="State" error={fieldErrors.state}>
                  <input
                    style={cleanStyles.input}
                    value={form.state}
                    onChange={(e) => {
                      clearFieldFeedback('state');
                      setSelectedAddressSuggestionKey(null);
                      update({ state: e.target.value.toUpperCase() });
                    }}
                    maxLength={2}
                  />
                </Field>
                <Field label="ZIP" error={fieldErrors.zipCode}>
                  <input
                    style={cleanStyles.input}
                    placeholder="33401"
                    value={form.zipCode}
                    onChange={(e) => {
                      clearFieldFeedback('zipCode');
                      setSelectedAddressSuggestionKey(null);
                      update({ zipCode: e.target.value });
                    }}
                  />
                </Field>

                <SectionHead num="03" title="Community type" desc="Drives statute-specific workflows" />
                <div style={cleanStyles.typeGrid}>
                  {COMMUNITY_TYPES.map((t) => {
                    const selected = form.communityTypeKey === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        style={cleanStyles.typeCard(selected)}
                        onClick={() => {
                          clearFieldFeedback('communityType');
                          clearFieldFeedback('planKey');
                          const nextCt: CommunityType = t.id === 'condo' ? 'condo_718' : t.id === 'hoa' ? 'hoa_720' : 'apartment';
                          const nextFirst = getSignupPlansForCommunityType(nextCt)[0];
                          setForm((f) => ({
                            ...f,
                            communityTypeKey: t.id,
                            planKey: (nextFirst?.id as SignupPlanId) ?? f.planKey,
                          }));
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: 8,
                          }}
                        >
                          <span
                            style={{
                              width: 16,
                              height: 16,
                              borderRadius: 999,
                              border: selected ? '5px solid var(--accent)' : '1.5px solid var(--line)',
                              background: 'white',
                            }}
                          />
                          <span style={cleanStyles.typeStatute}>{t.statute}</span>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{t.label}</div>
                        <p style={cleanStyles.typeDesc}>{t.desc}</p>
                      </button>
                    );
                  })}
                </div>
                {fieldErrors.communityType && (
                  <div style={{ ...cleanStyles.hint, gridColumn: '1 / -1', color: 'oklch(0.52 0.14 25)' }}>
                    {fieldErrors.communityType}
                  </div>
                )}

                <Field
                  label="Unit count"
                  hint={(() => {
                    if (form.communityTypeKey === 'condo') {
                      return form.unitCount >= 25
                        ? 'Subject to §718.111(12)(g) website rule'
                        : 'Exempt — voluntary compliance recommended';
                    }
                    if (form.communityTypeKey === 'hoa') {
                      return form.unitCount >= 100
                        ? 'Subject to §720.303(4) website rule'
                        : 'Exempt — voluntary compliance recommended';
                    }
                    return 'Operational-only · no statutory requirements';
                  })()}
                  error={fieldErrors.unitCount}
                >
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'stretch',
                      border: '1px solid var(--line)',
                      borderRadius: 10,
                      overflow: 'hidden',
                      background: 'white',
                      height: 42,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        clearFieldFeedback('unitCount');
                        update({ unitCount: Math.max(1, form.unitCount - 1) });
                      }}
                      style={{
                        width: 36,
                        border: 'none',
                        borderRight: '1px solid var(--line)',
                        background: 'white',
                        cursor: 'pointer',
                        fontSize: 14,
                        color: 'var(--ink-soft)',
                      }}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      value={form.unitCount}
                      onChange={(e) => {
                        clearFieldFeedback('unitCount');
                        const n = Math.max(1, Number(e.target.value) || 1);
                        update({ unitCount: n });
                      }}
                      style={{
                        width: 72,
                        border: 'none',
                        fontSize: 14,
                        fontWeight: 500,
                        textAlign: 'center',
                        outline: 'none',
                        fontFeatureSettings: '"tnum"',
                        background: 'transparent',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        clearFieldFeedback('unitCount');
                        update({ unitCount: form.unitCount + 1 });
                      }}
                      style={{
                        width: 36,
                        border: 'none',
                        borderLeft: '1px solid var(--line)',
                        background: 'white',
                        cursor: 'pointer',
                        fontSize: 14,
                        color: 'var(--ink-soft)',
                      }}
                    >
                      +
                    </button>
                  </div>
                </Field>
                <div />
              </div>
            )}

            {step.id === 'plan' && (
              <div style={cleanStyles.formSection(gap)}>
                <div
                  style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
                    Billing cycle <span style={{ color: 'var(--ink-faint)' }}>{savings}</span>
                  </div>
                  <div
                    style={{ display: 'inline-flex', padding: 3, border: '1px solid var(--line)', borderRadius: 999, background: 'white' }}
                  >
                    {(['monthly', 'annual'] as const).map((opt) => {
                      const sel = form.billing === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => {
                            clearFieldFeedback('planKey');
                            update({ billing: opt });
                          }}
                          style={{
                            padding: '6px 14px',
                            borderRadius: 999,
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: 12,
                            fontWeight: 500,
                            textTransform: 'capitalize',
                            background: sel ? 'var(--ink)' : 'transparent',
                            color: sel ? 'white' : 'var(--ink-soft)',
                            transition: 'background .15s',
                          }}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div
                  style={{
                    ...cleanStyles.planRow,
                    gridTemplateColumns: displayPlans.length === 1 ? '1fr' : '1fr 1fr',
                  }}
                >
                  {displayPlans.map((p) => {
                    const selected = form.planKey === p.id;
                    const monthly = form.billing === 'annual' ? Math.round(p.price * 0.85) : p.price;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        style={cleanStyles.planCard(selected)}
                        onClick={() => {
                          clearFieldFeedback('planKey');
                          update({ planKey: p.id });
                        }}
                      >
                        {p.recommended && (
                          <div
                            style={{
                              position: 'absolute',
                              top: 14,
                              right: 14,
                              fontSize: 10,
                              fontFamily: 'var(--font-jetbrains-mono), "JetBrains Mono", monospace',
                              letterSpacing: '0.05em',
                              textTransform: 'uppercase',
                              color: 'white',
                              background: 'var(--accent)',
                              padding: '3px 8px',
                              borderRadius: 999,
                              fontWeight: 600,
                            }}
                          >
                            Recommended
                          </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span
                            style={{
                              width: 16,
                              height: 16,
                              borderRadius: 999,
                              border: selected ? '5px solid var(--accent)' : '1.5px solid var(--line)',
                              background: 'white',
                              flexShrink: 0,
                            }}
                          />
                          <h4 style={cleanStyles.planName}>{p.name}</h4>
                        </div>
                        <div style={{ marginTop: 14, display: 'flex', alignItems: 'baseline', gap: 4 }}>
                          <span style={{ fontSize: 13, color: 'var(--ink-faint)' }}>$</span>
                          <span
                            style={{
                              fontSize: 34,
                              fontWeight: 500,
                              letterSpacing: '-0.03em',
                              fontFeatureSettings: '"tnum"',
                              lineHeight: 1,
                            }}
                          >
                            {monthly}
                          </span>
                          <span style={cleanStyles.planPriceUnit}>
                            &nbsp;/ month{form.billing === 'annual' ? ', billed annually' : ''}
                          </span>
                        </div>
                        <p style={cleanStyles.planBlurb}>{p.blurb}</p>
                        <div style={{ height: 1, background: 'var(--line-soft)', margin: '2px 0 14px' }} />
                        <ul style={cleanStyles.planBullets}>
                          {p.bullets.map((b) => (
                            <li key={b} style={cleanStyles.planBullet}>
                              <span
                                style={{
                                  position: 'absolute',
                                  left: 0,
                                  top: 5,
                                  width: 12,
                                  height: 12,
                                  borderRadius: 999,
                                  background: 'var(--accent-wash)',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: 'var(--accent-ink)',
                                  fontSize: 9,
                                  fontWeight: 700,
                                }}
                              >
                                ✓
                              </span>
                              {b}
                            </li>
                          ))}
                        </ul>
                      </button>
                    );
                  })}
                </div>
                {fieldErrors.planKey && (
                  <div style={{ ...cleanStyles.hint, gridColumn: '1 / -1', color: 'oklch(0.52 0.14 25)' }}>{fieldErrors.planKey}</div>
                )}

                <div
                  style={{
                    gridColumn: '1 / -1',
                    fontSize: 12,
                    color: 'var(--ink-faint)',
                    textAlign: 'center',
                    marginTop: 4,
                  }}
                >
                  Not sure which plan? <a href="#" style={{ color: 'var(--accent-ink)' }}>Compare all features →</a>
                </div>
              </div>
            )}

            {step.id === 'finish' && planObj && (
              <div style={cleanStyles.formSection(gap)}>
                <SectionHead num="01" title="Your portal address" desc="You can change this later" />
                <div style={cleanStyles.fieldFull}>
                  <div style={cleanStyles.label}>Subdomain</div>
                  <div style={cleanStyles.subdomainWrap}>
                    <input
                      id="clean-signup-candidate-slug"
                      name="candidateSlug"
                      style={cleanStyles.subInput}
                      value={form.candidateSlug}
                      onChange={(e) => {
                        clearFieldFeedback('candidateSlug');
                        const v = normalizeSignupSubdomain(e.target.value);
                        update({ candidateSlug: v, subdomainTouched: true });
                      }}
                      placeholder="your-community"
                      disabled={isSubmitting}
                      autoComplete="off"
                    />
                    <span style={cleanStyles.subSuffix}>.getpropertypro.com</span>
                  </div>
                  {fieldErrors.candidateSlug && (
                    <div style={{ ...cleanStyles.hint, color: 'oklch(0.52 0.14 25)' }}>{fieldErrors.candidateSlug}</div>
                  )}
                  <div style={cleanStyles.hint}>
                    Suggested from your community name. Lowercase letters, numbers, and dashes only.
                  </div>
                  {subdomainAvailability && (
                    <div style={{ ...cleanStyles.hint, color: subMessageColor }}>{subdomainAvailability.message}</div>
                  )}
                </div>

                <div
                  style={{ gridColumn: '1 / -1', border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden', background: 'white', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}
                >
                  <div
                    style={{
                      padding: '8px 12px',
                      background: 'oklch(0.97 0.005 95)',
                      borderBottom: '1px solid var(--line-soft)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: 'oklch(0.85 0.1 25)' }} />
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: 'oklch(0.88 0.12 90)' }} />
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: 'oklch(0.85 0.1 150)' }} />
                    <div
                      style={{
                        flex: 1,
                        margin: '0 12px',
                        padding: '4px 10px',
                        background: 'white',
                        border: '1px solid var(--line)',
                        borderRadius: 6,
                        fontSize: 12,
                        fontFamily: 'var(--font-jetbrains-mono), "JetBrains Mono", monospace',
                        color: 'var(--ink-soft)',
                      }}
                    >
                      <span style={{ color: 'oklch(0.58 0.13 160)' }}>https://</span>
                      {form.candidateSlug || 'your-community'}
                      <span style={{ color: 'var(--ink-faint)' }}>.getpropertypro.com</span>
                    </div>
                  </div>
                </div>

                <SectionHead num="02" title="Review your signup" />
                <div
                  style={{ gridColumn: '1 / -1', border: '1px solid var(--line)', borderRadius: 12, background: 'white', overflow: 'hidden' }}
                >
                  {(
                    [
                      ['Primary contact', primaryContactName || '—'],
                      ['Email', form.email || '—'],
                      ['Role', ADMIN_ROLE_COPY[form.adminType]?.label ?? '—'],
                      ['Community', form.communityName || '—'],
                      ['Type & units', `${communityLabel} · ${form.unitCount} units`],
                      [
                        'Plan',
                        `${planObj.name} · $${planMonthly}/mo${form.billing === 'annual' ? ' (annual)' : ''}`,
                      ],
                    ] as const
                  ).map(([k, v], i, arr) => (
                    <div
                      key={k}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '160px 1fr',
                        padding: '12px 16px',
                        borderBottom: i < arr.length - 1 ? '1px solid var(--line-soft)' : 'none',
                        fontSize: 13,
                      }}
                    >
                      <div style={{ color: 'var(--ink-faint)' }}>{k}</div>
                      <div style={{ color: 'var(--ink)' }}>{v}</div>
                    </div>
                  ))}
                </div>

                <label style={{ ...cleanStyles.terms, gridColumn: '1 / -1' }}>
                  <input
                    type="checkbox"
                    style={cleanStyles.checkbox}
                    checked={form.termsAccepted}
                    onChange={(e) => {
                      clearFieldFeedback('termsAccepted');
                      update({ termsAccepted: e.target.checked });
                    }}
                  />
                  <span>
                    I agree to the{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setTermsModalOpen(true);
                      }}
                      style={{ color: 'var(--accent-ink)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                    >
                      Terms of Service
                    </button>
                    {' '}
                    and{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setPrivacyModalOpen(true);
                      }}
                      style={{ color: 'var(--accent-ink)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                    >
                      Privacy Policy
                    </button>
                    . Billing begins after your 14-day trial.
                  </span>
                </label>
                {fieldErrors.termsAccepted && (
                  <div style={{ ...cleanStyles.hint, gridColumn: '1 / -1', color: 'oklch(0.52 0.14 25)' }}>
                    {fieldErrors.termsAccepted}
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={cleanStyles.footer}>
            <button
              type="button"
              style={{ ...cleanStyles.backBtn, visibility: idx === 0 ? 'hidden' : 'visible' }}
              onClick={() => {
                setIdx((i) => Math.max(0, i - 1));
              }}
            >
              ← Back
            </button>
            <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>No credit card required · 14-day free trial</div>
            <button
              type="submit"
              style={cleanStyles.nextBtn}
              disabled={isSubmitting}
            >
              {idx === total - 1
                ? isSubmitting
                  ? 'Submitting...'
                  : 'Create account →'
                : 'Continue →'}
            </button>
          </div>
        </div>

        {showPanel && (
          <aside style={cleanStyles.helperPanel}>
            <div>
              <div style={cleanStyles.helperEyebrow}>What to expect</div>
              <h3 style={cleanStyles.helperH}>15 minutes to compliant</h3>
              <p style={{ ...cleanStyles.helperPara, marginTop: 8 }}>
                Most communities finish setup in under 15 minutes. You can invite your board later.
              </p>
            </div>
            <hr style={cleanStyles.divider} />
            <div>
              <div style={cleanStyles.helperEyebrow}>Florida statute</div>
              <h3 style={cleanStyles.helperH}>§718.111(12)(g)</h3>
              <p style={{ ...cleanStyles.helperPara, marginTop: 8 }}>
                Condominium associations of 25+ units must maintain a compliant website. PropertyPro handles
                posting windows, categories, and retention automatically.
              </p>
            </div>
            <hr style={cleanStyles.divider} />
            <div>
              <div style={cleanStyles.helperEyebrow}>Need help?</div>
              <p style={cleanStyles.helperPara}>
                Email{' '}
                <span style={{ color: 'var(--ink)', fontFamily: 'var(--font-jetbrains-mono), "JetBrains Mono", monospace', fontSize: 12 }}>support@getpropertypro.com</span> or
                book a 20-minute onboarding call.
              </p>
            </div>
          </aside>
        )}
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
              </Link>
              .
            </p>
          </div>
          <DialogFooter>
            <button
              type="button"
              className="rounded-md border border-edge px-4 py-2 text-sm"
              onClick={() => {
                setTermsModalOpen(false);
              }}
            >
              Close
            </button>
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
              </Link>
              .
            </p>
          </div>
          <DialogFooter>
            <button
              type="button"
              className="rounded-md border border-edge px-4 py-2 text-sm"
              onClick={() => {
                setPrivacyModalOpen(false);
              }}
            >
              Close
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
