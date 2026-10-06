'use client';

/**
 * Email-first signup ("Front porch", design variant A), founder path:
 *
 *   email → check your email → name & type → place & size → you & web address
 *   → requirements → free trial (Embedded Checkout) → Stripe return page
 *
 * The emailed link signs the user in (`/auth/verify-signup`), and the page
 * server-renders straight into `type` once a confirmed session exists. Nothing
 * is written to `pending_signups` until the trial step, where
 * `POST /api/v1/auth/signup/details` turns the answers into a checkout-ready
 * row; see `lib/auth/signup-email-first.ts`.
 *
 * Answers live in localStorage, scoped to the signed-in address, until the
 * community is live ("Progress saves automatically"), so a refresh or a fresh
 * sign-in link — which opens a new tab — does not lose them.
 */
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  CircleDashed,
  FileText,
  Info,
  MailCheck,
  Minus,
  PencilLine,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import {
  SIGNUP_TRIAL_DAYS,
  getComplianceTemplate,
  type CommunityType,
} from '@propertypro/shared';
import { AlertBanner } from '@/components/shared/alert-banner';
import { SignupAddressAutocomplete } from '@/components/signup/address-autocomplete';
import { startEmailFirstSignup } from '@/hooks/use-email-first-signup';
import { useSubdomainAvailability } from '@/hooks/use-subdomain-availability';
import { ApiRequestError } from '@/lib/api/request-json';
import {
  SIGNUP_PLAN_OPTIONS,
  normalizeSignupSubdomain,
  type SignupPlanId,
} from '@/lib/auth/signup-schema';
import { cn } from '@/lib/utils';
import {
  APARTMENT_TOOLS,
  COMMUNITY_TYPES,
  REQUIREMENT_GROUP_LABELS,
  TYPE_ICONS,
  formatAddressRow,
  formatTrialEnd,
  formatUnitsRow,
  getTypeMeta,
  isFloridaZip,
  isWebsiteRequired,
  maskEmail,
  portalHost,
} from './front-porch-data';
import {
  FieldError,
  FrontPorchShell,
  StepHeading,
  type CardRow,
  type CommunityCardModel,
  type ShellFooter,
} from './front-porch-shell';
import {
  clearSignupDraft,
  readSignupDraft,
  writeSignupDraft,
  type SignupDraft,
  type SignupStep,
} from './draft-storage';
import { flyTo } from './motion';
import { TrialStep } from './trial-step';

const QUESTION_STEPS: readonly SignupStep[] = ['type', 'place', 'you'];

/**
 * Where a server-side rejection of a field sends the user back to. A restored
 * draft can reach the trial step without re-running each step's checks, so the
 * server's answer has to land on the step that can fix it.
 */
const REJECTED_FIELD_STEPS: Record<string, { step: SignupStep; error: keyof Errors }> = {
  communityName: { step: 'type', error: 'communityName' },
  communityType: { step: 'type', error: 'communityType' },
  address: { step: 'place', error: 'address' },
  addressLine1: { step: 'place', error: 'address' },
  city: { step: 'place', error: 'address' },
  state: { step: 'place', error: 'address' },
  zipCode: { step: 'place', error: 'address' },
  county: { step: 'place', error: 'address' },
  unitCount: { step: 'place', error: 'unitCount' },
  primaryContactName: { step: 'you', error: 'primaryContactName' },
  candidateSlug: { step: 'you', error: 'slug' },
  // lib/auth/community-address-conflict.ts — the address already has a community.
  communityExists: { step: 'place', error: 'communityExists' },
};
const ORDER: readonly SignupStep[] = ['type', 'place', 'you', 'reveal', 'trial'];
const RESEND_COOLDOWN_S = 60;

type Errors = Partial<Record<
  | 'email'
  | 'communityName'
  | 'communityType'
  | 'address'
  | 'communityExists'
  | 'unitCount'
  | 'primaryContactName'
  | 'slug',
  string
>>;


function emptyDraft(initialType: CommunityType | null, initialPlan: SignupPlanId | null): SignupDraft {
  return {
    communityName: '',
    communityType: initialType,
    addressLine1: '',
    city: '',
    zipCode: '',
    county: '',
    addressKey: null,
    manualAddress: false,
    unitCount: '',
    primaryContactName: '',
    slug: '',
    slugDirty: false,
    planKey: initialPlan,
    step: 'type',
  };
}

export interface SignupFlowProps {
  /** `type` when the emailed link has already signed the user in. */
  initialStep: 'email' | 'type';
  sessionEmail: string | null;
  /**
   * Why the emailed link did not sign the user in, shown on the email step:
   * spent/expired, or opened in a browser other than the one that asked.
   */
  linkNotice: 'expired' | 'other-device' | null;
  initialType: CommunityType | null;
  initialPlan: SignupPlanId | null;
}

const LINK_NOTICES = {
  expired: 'That sign-in link has expired or was already used. Enter your email and we will send a new one.',
  'other-device':
    'This link was requested on a different device or browser. Open it there, or enter your email to get a new link on this one.',
} as const;

export function SignupFlow({ initialStep, sessionEmail, linkNotice, initialType, initialPlan }: SignupFlowProps) {
  const [step, setStep] = useState<SignupStep>(initialStep);
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [draft, setDraft] = useState<SignupDraft>(() => emptyDraft(initialType, initialPlan));
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(linkNotice ? LINK_NOTICES[linkNotice] : null);
  const [resendIn, setResendIn] = useState(0);
  const restored = useRef(false);

  // Restore answers saved before the inbox detour (signed-in steps only).
  useEffect(() => {
    if (restored.current || initialStep !== 'type') return;
    restored.current = true;
    const saved = sessionEmail ? readSignupDraft(sessionEmail) : null;
    if (saved) {
      setDraft((d) => ({ ...d, ...saved, step: 'type' }));
      if (saved.step && ORDER.includes(saved.step)) setStep(saved.step);
    }
  }, [initialStep, sessionEmail]);


  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  // "This address already has a community", and the founder's answer to it,
  // describe the address that was refused; an edited address needs neither.
  // Called from the edit handlers rather than an effect on the address, which
  // would also fire when a saved draft is restored and wipe the answer.
  const forgetAddressVerdict = useCallback(() => {
    setErrors((e) => (e.communityExists ? { ...e, communityExists: undefined } : e));
    setDraft((d) => (d.sharedAddressAcknowledged ? { ...d, sharedAddressAcknowledged: undefined } : d));
  }, []);

  const update = useCallback(<K extends keyof SignupDraft>(key: K, value: SignupDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    if (key === 'addressLine1' || key === 'zipCode') forgetAddressVerdict();
  }, [forgetAddressVerdict]);

  const type = draft.communityType;
  const meta = type ? getTypeMeta(type) : null;
  const units = Number.parseInt(draft.unitCount, 10);
  const unitsValid = Number.isFinite(units) && units > 0;
  const isApartment = type === 'apartment';
  const requirements = useMemo(() => (type ? getComplianceTemplate(type) : []), [type]);
  const slugCandidate = normalizeSignupSubdomain(draft.slugDirty ? draft.slug : draft.communityName);

  useEffect(() => {
    if (ORDER.includes(step) && sessionEmail) {
      writeSignupDraft({ ...draft, step, submittedSlug: slugCandidate, owner: sessionEmail.toLowerCase() });
    }
  }, [draft, step, slugCandidate, sessionEmail]);
  const plans = type ? SIGNUP_PLAN_OPTIONS[type] : [];
  const plan = plans.find((p) => p.id === draft.planKey) ?? plans[0] ?? null;
  const trialEnd = formatTrialEnd(SIGNUP_TRIAL_DAYS);
  const stepIndex = ORDER.indexOf(step);
  const past = (s: SignupStep) => stepIndex > ORDER.indexOf(s);

  // ---- web address availability: the shared debounced lookup ----
  // The signup's own saved row holds its slug; exclude it, or a user who went
  // back from the trial step would find their own address "taken".
  const availability = useSubdomainAvailability(step === 'you' ? slugCandidate : '', draft.signupRequestId);
  const host = portalHost(slugCandidate || 'your-community');
  const slugReady = availability?.normalizedSubdomain === slugCandidate && availability.available;
  const slugTaken = availability?.reason === 'taken' || availability?.reason === 'reserved';
  const slugMessage = !availability
    ? ''
    : availability.available
      ? `${host} is available`
      : slugTaken
        ? `${host} is taken.`
        : availability.message;

  // Trim the base, not the result, so a 63-character slug cannot come back as itself.
  const suggestionSuffix = `-${normalizeSignupSubdomain(draft.city).slice(0, 20) || 'fl'}`;
  const slugSuggestion = normalizeSignupSubdomain(
    `${slugCandidate.slice(0, 63 - suggestionSuffix.length)}${suggestionSuffix}`,
  );

  // ---- the assembling community card ----
  const card: CommunityCardModel = useMemo(() => {
    const rows: CardRow[] = [
      {
        key: 'addr',
        text: past('place') || (step === 'place' && draft.addressKey) ? formatAddressRow(draft) : null,
      },
      {
        key: 'units',
        text: past('place') ? formatUnitsRow(type, units) : null,
      },
      { key: 'url', text: past('you') ? host : null, mono: true },
      {
        key: 'plan',
        text: step === 'trial' && plan ? `${plan.label} · free until ${trialEnd.short}` : null,
      },
    ];
    return {
      name: past('type') && draft.communityName.trim() ? draft.communityName.trim() : null,
      type,
      typeBadge: past('type') && meta ? meta.badge : null,
      rows,
      footer:
        step === 'reveal' || step === 'trial'
          ? isApartment
            ? { kind: 'apartment' }
            : { kind: 'requirements', count: requirements.length }
          : null,
    };
    // `past` reads stepIndex, which is derived from `step`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, step, meta, type, units, isApartment, host, plan, trialEnd.short, requirements.length]);

  // ---- step validation ----
  function validate(current: SignupStep): Errors {
    const e: Errors = {};
    if (current === 'email') {
      const v = email.trim();
      if (!v) e.email = 'Enter your email address.';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) e.email = 'Enter a valid email address, like name@example.com.';
    }
    if (current === 'type') {
      if (draft.communityName.trim().length < 2) e.communityName = 'Enter your community name.';
      if (!draft.communityType) e.communityType = 'Choose the type of community.';
    }
    if (current === 'place') {
      if (!draft.addressLine1.trim()) {
        e.address = 'Enter your street address.';
      } else if (!draft.manualAddress && !draft.addressKey) {
        e.address = 'Choose an address from the list, or enter it manually.';
      } else if (draft.addressLine1.trim().length < 5) {
        e.address = 'Enter the street address.';
      } else if (!draft.city.trim()) {
        e.address = 'Enter the city.';
      } else if (!/^\d{5}$/.test(draft.zipCode.trim())) {
        e.address = 'Enter a 5-digit ZIP code.';
      } else if (!isFloridaZip(draft.zipCode.trim())) {
        e.address = 'Enter a Florida ZIP code. PropertyPro Florida serves Florida associations only.';
      } else if (draft.county.trim().length < 2) {
        e.address = 'Enter the county.';
      }
      if (!unitsValid) e.unitCount = `Enter the number of ${meta?.noun ?? 'units'}.`;
      else if (units > 20000) e.unitCount = 'Unit count is too large.';
    }
    if (current === 'you') {
      if (draft.primaryContactName.trim().length < 2) e.primaryContactName = 'Enter your name.';
      if (!slugReady) {
        e.slug = availability?.reason === 'checking' ? 'Still checking this web address…' : slugMessage || 'Choose a web address.';
      }
    }
    return e;
  }

  const fieldRef = (id: string) => (typeof document === 'undefined' ? null : document.getElementById(id));

  async function sendLink(address: string): Promise<boolean> {
    setBusy(true);
    setFormError(null);
    try {
      await startEmailFirstSignup(address);
      setSentTo(address.trim().toLowerCase());
      setResendIn(RESEND_COOLDOWN_S);
      return true;
    } catch (err) {
      setFormError(
        err instanceof ApiRequestError
          ? err.message
          : "We couldn't reach PropertyPro. Check your connection and try again.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function next() {
    const e = validate(step);
    setErrors(e);
    const first = Object.keys(e)[0];
    if (first) {
      fieldRef(`fp-${first}`)?.focus();
      return;
    }
    if (step === 'email') {
      if (await sendLink(email)) setStep('verify');
      return;
    }
    if (step === 'type') {
      flyTo(fieldRef('fp-communityName'), 'name', draft.communityName.trim());
      if (meta) flyTo(fieldRef(`fp-type-${meta.id}`), 'type', meta.badge);
    }
    if (step === 'place') {
      flyTo(fieldRef('fp-address'), 'addr', draft.addressLine1.trim());
      flyTo(fieldRef('fp-unitCount'), 'units', `${units} ${meta?.noun ?? 'units'}`);
    }
    if (step === 'you') {
      flyTo(fieldRef('fp-slug'), 'url', host);
    }
    const i = ORDER.indexOf(step);
    const following = ORDER[i + 1];
    if (following) setStep(following);
  }

  function back() {
    setErrors({});
    const i = ORDER.indexOf(step);
    const previous = ORDER[i - 1];
    if (previous) setStep(previous);
  }

  const onEnter = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void next();
    }
  };

  const questionIndex = QUESTION_STEPS.indexOf(step);
  const progress = questionIndex >= 0 ? { index: questionIndex, total: QUESTION_STEPS.length } : null;

  let footer: ShellFooter | null = null;
  if (step === 'type' || step === 'place' || step === 'you' || step === 'reveal') {
    footer = {
      note: step === 'reveal' ? 'Nothing is due today — this is your starting point.' : 'Progress saves automatically',
      cta: {
        type: 'Continue',
        place: 'Continue',
        you: 'See what Florida requires',
        reveal: `Start ${SIGNUP_TRIAL_DAYS}-day free trial`,
      }[step],
      onNext: () => void next(),
      onBack: step === 'type' ? undefined : back,
      busy,
    };
  }

  return (
    <FrontPorchShell card={card} progress={progress} footer={step === 'trial' ? null : footer}>
      {step === 'email' ? (
        <div className="flex flex-col gap-8 pt-6">
          <StepHeading
            eyebrow={`${SIGNUP_TRIAL_DAYS} days free`}
            title="Florida requires your association's website. Let's build yours together."
            lede="Start with your email. You'll choose a plan only after you've seen exactly what your community needs."
          />
          {formError ? (
            <div role="alert" className="flex items-start gap-3 rounded-md border border-status-warning-border bg-status-warning-bg px-4 py-3 text-sm text-content">
              <Info className="mt-0.5 h-4 w-4 flex-none text-status-warning" aria-hidden="true" />
              {formError}
            </div>
          ) : null}
          <div className="fp-enter flex flex-col gap-4" style={{ animationDelay: '80ms' }}>
            <div>
              <label htmlFor="fp-email" className="mb-1.5 block text-sm font-medium text-content-secondary">
                Email
              </label>
              <input
                id="fp-email"
                type="email"
                autoComplete="email"
                placeholder="you@yourassociation.org"
                value={email}
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? 'fp-email-error' : undefined}
                onChange={(ev) => setEmail(ev.target.value)}
                onKeyDown={onEnter}
                className={cn(
                  'h-12 w-full rounded-sm border bg-surface-card px-4 text-base text-content placeholder:text-content-placeholder',
                  errors.email ? 'border-status-danger' : 'border-edge-strong',
                )}
              />
              <FieldError id="fp-email-error" message={errors.email} />
            </div>
            <button
              type="button"
              onClick={() => void next()}
              disabled={busy}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-interactive px-6 text-base font-semibold text-content-inverse shadow-e1 transition-colors hover:bg-interactive-hover active:bg-interactive-active disabled:bg-interactive-disabled"
            >
              Continue with email
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <p className="m-0 text-sm text-content-tertiary">
              We&apos;ll email you a secure sign-in link — no password to create.
            </p>
          </div>
          <p className="fp-enter m-0 border-t border-edge-subtle pt-6 text-sm text-content-secondary" style={{ animationDelay: '160ms' }}>
            Already have an account?{' '}
            <Link href="/auth/login" className="text-content-link hover:text-content-link-hover hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      ) : null}

      {step === 'verify' ? (
        <div className="flex flex-col items-start gap-6 pt-6">
          <span className="fp-enter flex h-16 w-16 items-center justify-center rounded-full bg-interactive-subtle text-interactive">
            <MailCheck className="h-7 w-7" aria-hidden="true" />
          </span>
          <StepHeading
            title="Check your email"
            lede={
              <>
                We sent a sign-in link to <strong className="font-semibold text-content">{maskEmail(sentTo)}</strong>.
                Open it on this device and you&apos;ll land right back here.
              </>
            }
          />
          {formError ? (
            <p role="alert" className="m-0 text-sm text-status-danger">{formError}</p>
          ) : null}
          <div className="fp-enter flex flex-wrap gap-3" style={{ animationDelay: '120ms' }}>
            <button
              type="button"
              disabled={resendIn > 0 || busy}
              onClick={() => void sendLink(sentTo)}
              className="inline-flex h-12 items-center gap-2 rounded-md border border-edge bg-surface-card px-5 text-base font-medium tabular-nums text-content hover:bg-surface-hover disabled:text-content-disabled"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              {resendIn > 0 ? `Resend in 0:${String(resendIn).padStart(2, '0')}` : 'Resend link'}
            </button>
          </div>
          <p className="fp-enter m-0 text-sm text-content-tertiary" style={{ animationDelay: '180ms' }}>
            Don&apos;t see it? Check your spam or promotions folder.{' '}
            <button
              type="button"
              onClick={() => {
                setFormError(null);
                setStep('email');
              }}
              className="text-content-link hover:text-content-link-hover hover:underline"
            >
              Wrong email? Go back
            </button>
          </p>
        </div>
      ) : null}

      {step === 'type' ? (
        <div className="flex flex-col gap-8">
          <StepHeading
            title="What's your community called?"
            lede="Use the name owners know. The legal name can come later."
          />
          {sessionEmail ? <SignedInAs email={sessionEmail} /> : null}
          <div className="fp-enter" style={{ animationDelay: '60ms' }}>
            <label htmlFor="fp-communityName" className="mb-1.5 block text-sm font-medium text-content-secondary">
              Community name
            </label>
            <input
              id="fp-communityName"
              value={draft.communityName}
              maxLength={160}
              placeholder="e.g., Sunset Condominium Association"
              aria-invalid={Boolean(errors.communityName)}
              aria-describedby={errors.communityName ? 'fp-communityName-error' : undefined}
              onChange={(ev) => update('communityName', ev.target.value)}
              onKeyDown={onEnter}
              className={cn(
                'h-12 w-full rounded-sm border bg-surface-card px-4 text-base text-content placeholder:text-content-placeholder',
                errors.communityName ? 'border-status-danger' : 'border-edge-strong',
              )}
            />
            <FieldError id="fp-communityName-error" message={errors.communityName} />
          </div>
          <fieldset className="fp-enter m-0 border-0 p-0" style={{ animationDelay: '120ms' }}>
            <legend className="mb-2 text-sm font-medium text-content-secondary">Type of community</legend>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
              {COMMUNITY_TYPES.map((t) => {
                const selected = draft.communityType === t.id;
                const Icon = TYPE_ICONS[t.id];
                return (
                  <button
                    key={t.id}
                    id={`fp-type-${t.id}`}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      update('communityType', t.id);
                      setErrors((e) => ({ ...e, communityType: undefined }));
                    }}
                    className={cn(
                      'relative flex flex-col items-start gap-3 rounded-md border p-5 text-left text-content transition-colors hover:shadow-e1',
                      selected ? 'border-interactive bg-interactive-subtle' : 'border-edge bg-surface-card',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-md transition-colors',
                        selected ? 'bg-interactive text-content-inverse' : 'bg-surface-muted text-content-secondary',
                      )}
                    >
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="flex flex-col gap-0.5">
                      <span className="text-lg font-semibold">{t.label}</span>
                      <span className="text-xs font-semibold text-content-brand">{t.statute}</span>
                    </span>
                    <span className="text-sm text-content-secondary">{t.desc}</span>
                    {selected ? (
                      <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-interactive text-content-inverse">
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <FieldError id="fp-communityType-error" message={errors.communityType} />
          </fieldset>
        </div>
      ) : null}

      {step === 'place' && meta ? (
        <div className="flex flex-col gap-7">
          <StepHeading
            title={`Where is ${draft.communityName.trim()}, and how big is it?`}
            lede={meta.intro}
          />
          <div className="fp-enter flex flex-col gap-3" style={{ animationDelay: '60ms' }}>
            <label htmlFor="fp-address" className="block text-sm font-medium text-content-secondary">
              Street address
            </label>
            {draft.manualAddress ? (
              <input
                id="fp-address"
                autoComplete="address-line1"
                value={draft.addressLine1}
                maxLength={240}
                aria-invalid={Boolean(errors.address)}
                onChange={(ev) => update('addressLine1', ev.target.value)}
                onKeyDown={onEnter}
                className={cn(
                  'h-12 w-full rounded-sm border bg-surface-card px-4 text-base text-content',
                  errors.address ? 'border-status-danger' : 'border-edge-strong',
                )}
              />
            ) : (
              <SignupAddressAutocomplete
                inputId="fp-address"
                value={draft.addressLine1}
                selectedSuggestionKey={draft.addressKey}
                invalid={Boolean(errors.address)}
                onValueChange={(value) => update('addressLine1', value)}
                onSelectedSuggestionChange={(key) => update('addressKey', key)}
                onSuggestionSelect={(s) => {
                  setDraft((d) => ({
                    ...d,
                    addressLine1: s.addressLine1,
                    city: s.city,
                    zipCode: s.zipCode,
                    county: s.county,
                    addressKey: s.key,
                  }));
                  setErrors((e) => ({ ...e, address: undefined }));
                  forgetAddressVerdict();
                }}
              />
            )}
            {!draft.manualAddress && draft.addressKey ? (
              <div className="fp-enter flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-status-success-bg px-3 py-1 text-xs font-semibold text-status-success">
                  <Check className="h-3 w-3" aria-hidden="true" />
                  {draft.county} County
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-status-success-bg px-3 py-1 text-xs font-semibold text-status-success">
                  <Check className="h-3 w-3" aria-hidden="true" />
                  FL {draft.zipCode}
                </span>
                <span className="text-xs text-content-tertiary">Filled in from the address</span>
              </div>
            ) : null}
            {draft.manualAddress ? (
              <div className="fp-enter grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
                <div>
                  <label htmlFor="fp-city" className="mb-1.5 block text-sm font-medium text-content-secondary">City</label>
                  <input
                    id="fp-city"
                    autoComplete="address-level2"
                    value={draft.city}
                    maxLength={100}
                    onChange={(ev) => update('city', ev.target.value)}
                    onKeyDown={onEnter}
                    className="h-12 w-full rounded-sm border border-edge-strong bg-surface-card px-4 text-base text-content"
                  />
                </div>
                <div>
                  <label htmlFor="fp-zip" className="mb-1.5 block text-sm font-medium text-content-secondary">ZIP code</label>
                  <input
                    id="fp-zip"
                    inputMode="numeric"
                    autoComplete="postal-code"
                    placeholder="33131"
                    value={draft.zipCode}
                    maxLength={5}
                    onChange={(ev) => update('zipCode', ev.target.value.replace(/\D/g, ''))}
                    onKeyDown={onEnter}
                    className="h-12 w-full rounded-sm border border-edge-strong bg-surface-card px-4 text-base text-content"
                  />
                </div>
                <div>
                  <label htmlFor="fp-county" className="mb-1.5 block text-sm font-medium text-content-secondary">County</label>
                  <input
                    id="fp-county"
                    placeholder="Miami-Dade"
                    value={draft.county}
                    maxLength={120}
                    onChange={(ev) => update('county', ev.target.value)}
                    onKeyDown={onEnter}
                    className="h-12 w-full rounded-sm border border-edge-strong bg-surface-card px-4 text-base text-content"
                  />
                </div>
              </div>
            ) : null}
            <FieldError id="fp-address-error" message={errors.address} />
            {errors.communityExists ? (
              <AlertBanner
                status="warning"
                variant="subtle"
                title={errors.communityExists}
                description="If you manage or live there, request access to the existing community. Some addresses hold more than one association — a later condo phase, or a master and sub-association. If yours is one of those, you can continue."
                action={(
                  <div className="flex flex-wrap items-center gap-4">
                    <Link
                      href="/account/join-community"
                      className="inline-flex min-h-9 items-center gap-1 text-sm font-medium text-content-link hover:text-content-link-hover"
                    >
                      Request to join
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        // Stays on this step: Continue still runs its checks.
                        update('sharedAddressAcknowledged', true);
                        setErrors((e) => ({ ...e, communityExists: undefined }));
                      }}
                      className="inline-flex min-h-9 items-center text-sm font-medium text-content-secondary underline underline-offset-4 hover:text-content"
                    >
                      It&apos;s a separate association at this address
                    </button>
                  </div>
                )}
              />
            ) : null}
            {draft.sharedAddressAcknowledged && !errors.communityExists ? (
              <p className="flex items-center gap-2 text-sm text-content-secondary">
                <Info className="size-4 shrink-0" aria-hidden="true" />
                Continuing as a separate association at this address.
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setErrors((e) => ({ ...e, address: undefined }));
                setDraft((d) => ({ ...d, manualAddress: !d.manualAddress, addressKey: null }));
              }}
              className="inline-flex min-h-9 items-center gap-2 self-start text-sm font-medium text-content-link hover:text-content-link-hover"
            >
              {draft.manualAddress ? (
                <>
                  <Search className="h-4 w-4" aria-hidden="true" />
                  Search Florida addresses instead
                </>
              ) : (
                <>
                  <PencilLine className="h-4 w-4" aria-hidden="true" />
                  Can&apos;t find it? Enter it manually
                </>
              )}
            </button>
          </div>
          <div className="fp-enter" style={{ animationDelay: '120ms' }}>
            <label htmlFor="fp-unitCount" className="mb-1.5 block text-sm font-medium text-content-secondary">
              Number of {meta.noun}
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Fewer"
                onClick={() => update('unitCount', String(Math.max(1, (unitsValid ? units : 1) - 1)))}
                className="flex h-12 w-12 items-center justify-center rounded-sm border border-edge-strong bg-surface-card text-content-secondary hover:bg-surface-hover"
              >
                <Minus className="h-4 w-4" aria-hidden="true" />
              </button>
              <input
                id="fp-unitCount"
                inputMode="numeric"
                placeholder="184"
                value={draft.unitCount}
                aria-invalid={Boolean(errors.unitCount)}
                aria-describedby={errors.unitCount ? 'fp-unitCount-error' : undefined}
                onChange={(ev) => update('unitCount', ev.target.value.replace(/\D/g, '').slice(0, 5))}
                onKeyDown={onEnter}
                className={cn(
                  'h-12 w-28 rounded-sm border bg-surface-card px-3 text-center text-lg font-semibold text-content',
                  errors.unitCount ? 'border-status-danger' : 'border-edge-strong',
                )}
              />
              <button
                type="button"
                aria-label="More"
                onClick={() => update('unitCount', String((unitsValid ? units : 0) + 1))}
                className="flex h-12 w-12 items-center justify-center rounded-sm border border-edge-strong bg-surface-card text-content-secondary hover:bg-surface-hover"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <FieldError id="fp-unitCount-error" message={errors.unitCount} />
          </div>
          {unitsValid && type && !isApartment ? (
            isWebsiteRequired(type, units) ? (
              <div className="fp-enter flex gap-3 rounded-md border border-status-info-border bg-status-info-bg p-4 text-status-info">
                <ShieldCheck className="mt-0.5 h-5 w-5 flex-none" aria-hidden="true" />
                <div>
                  <div className="text-base font-semibold">Website required</div>
                  <div className="mt-0.5 text-sm text-content">
                    With {units} {meta.noun}, {meta.rule} applies. We will track all {requirements.length} posting
                    categories for you.
                  </div>
                </div>
              </div>
            ) : (
              <div className="fp-enter flex gap-3 rounded-md border border-edge bg-surface-subtle p-4 text-content-secondary">
                <Info className="mt-0.5 h-5 w-5 flex-none" aria-hidden="true" />
                <div>
                  <div className="text-base font-semibold text-content">Website optional at {units} {meta.noun}</div>
                  <div className="mt-0.5 text-sm">
                    Posting records online still answers owner questions before they are asked — and you are ready if
                    you grow past {meta.threshold}.
                  </div>
                </div>
              </div>
            )
          ) : null}
        </div>
      ) : null}

      {step === 'you' ? (
        <div className="flex flex-col gap-7">
          <StepHeading
            title="Last step: who's setting this up?"
            lede="Your name goes on the account, and the web address is where owners find your portal."
          />
          <div className="fp-enter" style={{ animationDelay: '60ms' }}>
            <label htmlFor="fp-primaryContactName" className="mb-1.5 block text-sm font-medium text-content-secondary">
              Your name
            </label>
            <input
              id="fp-primaryContactName"
              autoComplete="name"
              placeholder="Dana Reyes"
              value={draft.primaryContactName}
              maxLength={120}
              aria-invalid={Boolean(errors.primaryContactName)}
              aria-describedby={errors.primaryContactName ? 'fp-primaryContactName-error' : undefined}
              onChange={(ev) => update('primaryContactName', ev.target.value)}
              onKeyDown={onEnter}
              className={cn(
                'h-12 w-full rounded-sm border bg-surface-card px-4 text-base text-content placeholder:text-content-placeholder',
                errors.primaryContactName ? 'border-status-danger' : 'border-edge-strong',
              )}
            />
            <FieldError id="fp-primaryContactName-error" message={errors.primaryContactName} />
          </div>
          <div className="fp-enter" style={{ animationDelay: '120ms' }}>
            <label htmlFor="fp-slug" className="mb-1.5 block text-sm font-medium text-content-secondary">
              Web address
            </label>
            <div className="flex">
              <input
                id="fp-slug"
                value={draft.slugDirty ? draft.slug : slugCandidate}
                maxLength={63}
                aria-invalid={Boolean(errors.slug)}
                aria-describedby="fp-slug-status"
                onChange={(ev) => {
                  setDraft((d) => ({ ...d, slug: ev.target.value, slugDirty: true }));
                  setErrors((e) => ({ ...e, slug: undefined }));
                }}
                onKeyDown={onEnter}
                className={cn(
                  'h-12 min-w-0 flex-1 rounded-l-sm border border-r-0 bg-surface-card px-4 font-mono text-sm text-content',
                  errors.slug ? 'border-status-danger' : 'border-edge-strong',
                )}
              />
              <span className="flex items-center rounded-r-sm border border-edge-strong bg-surface-page px-4 font-mono text-sm text-content-secondary">
                {portalHost('x').slice(1)}
              </span>
            </div>
            <div
              id="fp-slug-status"
              aria-live="polite"
              className={cn(
                'mt-2 flex items-center gap-2 text-sm',
                slugReady ? 'text-status-success' : availability?.reason === 'checking' ? 'text-content-tertiary' : 'text-status-danger',
              )}
            >
              {slugReady ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : null}
              {errors.slug && !slugReady ? errors.slug : slugMessage}
            </div>
            {slugTaken ? (
              <button
                type="button"
                onClick={() => setDraft((d) => ({ ...d, slug: slugSuggestion, slugDirty: true }))}
                className="mt-1 inline-flex min-h-9 items-center font-mono text-sm font-medium text-content-link hover:text-content-link-hover"
              >
                Use {portalHost(slugSuggestion)}
              </button>
            ) : null}
            <p className="mt-1 text-sm text-content-tertiary">
              Owners will find your portal here. You can change it later in Settings.
            </p>
          </div>
        </div>
      ) : null}

      {step === 'reveal' && meta ? (
        <div className="flex flex-col gap-7">
          <StepHeading
            eyebrow="Your requirements"
            title={
              isApartment
                ? `Here's what your portal sets up for ${draft.communityName.trim()}`
                : `Here's what Florida requires of ${draft.communityName.trim()}`
            }
            lede={
              isApartment
                ? 'Apartments are not covered by §718 or §720, so nothing must be posted by statute. Your portal focuses on operations instead.'
                : `We mapped ${requirements.length} document categories from ${meta.statute}. Your dashboard tracks every one and tells you what to post next.`
            }
          />
          {isApartment ? (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
              {APARTMENT_TOOLS.map(([title, desc], i) => (
                <div
                  key={title}
                  className="fp-enter flex flex-col gap-1 rounded-md border border-edge bg-surface-card p-4"
                  style={{ animationDelay: `${i * 70}ms` }}
                >
                  <CheckCircle2 className="mb-1.5 h-4 w-4 text-status-success" aria-hidden="true" />
                  <span className="text-base font-semibold">{title}</span>
                  <span className="text-sm text-content-secondary">{desc}</span>
                </div>
              ))}
            </div>
          ) : (
            <RequirementGroups items={requirements} />
          )}
        </div>
      ) : null}

      {step === 'trial' && type && plan ? (
        <TrialStep
          communityType={type}
          plans={plans}
          selectedPlan={plan.id}
          onSelectPlan={(id) => update('planKey', id)}
          trialEnd={trialEnd}
          details={{
            primaryContactName: draft.primaryContactName.trim(),
            communityName: draft.communityName.trim(),
            addressLine1: draft.addressLine1.trim(),
            city: draft.city.trim(),
            state: 'FL',
            zipCode: draft.zipCode.trim(),
            county: draft.county.trim(),
            unitCount: units,
            communityType: type,
            candidateSlug: slugCandidate,
            ...(draft.sharedAddressAcknowledged ? { sharedAddressAcknowledged: true } : {}),
          }}
          onBack={back}
          onSaved={(id) => update('signupRequestId', id)}
          onRejected={(field, message) => {
            const target = REJECTED_FIELD_STEPS[field];
            if (!target) return false;
            setErrors({ [target.error]: message });
            setStep(target.step);
            return true;
          }}
        />
      ) : null}
    </FrontPorchShell>
  );
}

function RequirementGroups({ items }: { items: ReturnType<typeof getComplianceTemplate> }) {
  const groups = new Map<string, typeof items[number][]>();
  for (const item of items) {
    const list = groups.get(item.category) ?? [];
    list.push(item);
    groups.set(item.category, list);
  }
  let n = 0;
  return (
    <div className="flex flex-col gap-6">
      {[...groups.entries()].map(([category, list]) => {
        const headingDelay = n++ * 45;
        return (
          <section key={category} className="flex flex-col gap-2" aria-labelledby={`fp-req-${category}`}>
            <div className="fp-enter flex items-center gap-2" style={{ animationDelay: `${headingDelay}ms` }}>
              <h2 id={`fp-req-${category}`} className="m-0 text-xs font-semibold uppercase tracking-wider text-content-tertiary">
                {REQUIREMENT_GROUP_LABELS[category as keyof typeof REQUIREMENT_GROUP_LABELS] ?? category}
              </h2>
              <span className="rounded-full bg-surface-muted px-2 text-xs font-semibold text-content-secondary">{list.length}</span>
            </div>
            {list.map((item) => (
              <div
                key={item.templateKey}
                className="fp-enter flex items-center gap-3 rounded-md border border-edge bg-surface-card px-4 py-3"
                style={{ animationDelay: `${n++ * 45}ms` }}
              >
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-md bg-status-warning-subtle text-status-warning">
                  <FileText className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-content">{item.title}</div>
                  <div className="text-xs text-content-secondary">{item.statuteReference}</div>
                </div>
                <span className="inline-flex flex-none items-center gap-1 rounded-full bg-status-warning-subtle px-2.5 py-0.5 text-xs font-semibold text-status-warning">
                  <CircleDashed className="h-3 w-3" aria-hidden="true" />
                  Needed
                </span>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

/**
 * Shown on the first question: the answers that follow are saved against this
 * account, so someone who arrived already signed in (a manager clicking a
 * marketing link, a shared computer) must be able to see it and switch.
 */
function SignedInAs({ email }: { email: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="fp-enter flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-content-secondary">
      <span>
        Signed in as <strong className="font-semibold text-content">{email}</strong>
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            clearSignupDraft();
            const { createBrowserClient } = await import('@/lib/supabase/client');
            await createBrowserClient().auth.signOut();
          } finally {
            window.location.assign('/signup');
          }
        }}
        className="text-content-link hover:text-content-link-hover hover:underline"
      >
        Use a different email
      </button>
    </div>
  );
}
