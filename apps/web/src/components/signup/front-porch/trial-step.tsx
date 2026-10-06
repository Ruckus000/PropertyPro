'use client';

/**
 * Free-trial step: pick a plan, then Stripe Embedded Checkout mounts inline.
 *
 * Decision (2026-10-06): Embedded Checkout inside the step rather than custom
 * card fields. Stripe renders its own iframe — so the card area looks like
 * Stripe's, not the drawn card row — and we keep Stripe owning SCA/3DS, the
 * trial subscription, and the return redirect to `/signup/checkout/return`.
 *
 * "Start free trial" is where the answers become a `pending_signups` row
 * (`POST /api/v1/auth/signup/details`) and where Terms acceptance is recorded,
 * which is why the agreement line sits next to that button. Changing the plan
 * afterwards re-submits: the server closes the open Checkout session first
 * (`closeCheckoutSession`), so the old price can no longer be paid.
 */
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js';
import { ArrowLeft, ArrowRight, Check, Loader2, Lock } from 'lucide-react';
import { PlanBadge } from '@propertypro/ui';
import { SIGNUP_TRIAL_DAYS, type CommunityType } from '@propertypro/shared';
import { submitSignupDetails, type SignupDetailsBody } from '@/hooks/use-email-first-signup';
import { createCheckoutSession } from '@/lib/actions/checkout';
import { ApiRequestError } from '@/lib/api/request-json';
import type { SignupPlanId, SignupPlanOption } from '@/lib/auth/signup-schema';
import { getStripePromise } from '@/lib/stripe/browser';
import { cn } from '@/lib/utils';
import { StepHeading } from './front-porch-shell';
import { flyTo } from './motion';

export type SignupDetailsPayload = Omit<SignupDetailsBody, 'planKey' | 'termsAccepted'>;

interface TrialStepProps {
  communityType: CommunityType;
  plans: readonly SignupPlanOption[];
  selectedPlan: SignupPlanId;
  onSelectPlan: (id: SignupPlanId) => void;
  trialEnd: { long: string; short: string };
  details: SignupDetailsPayload;
  onBack: () => void;
  /** The row the answers became; the "you" step excludes it from availability checks. */
  onSaved: (signupRequestId: string) => void;
  /** A field the server refused. Returns true when the user was sent to fix it. */
  onRejected: (field: string, message: string) => boolean;
}

type CheckoutState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; clientSecret: string }
  | { kind: 'error'; message: string; signedOut?: boolean };

export function TrialStep({
  plans,
  selectedPlan,
  onSelectPlan,
  trialEnd,
  details,
  onBack,
  onSaved,
  onRejected,
}: TrialStepProps) {
  const [checkout, setCheckout] = useState<CheckoutState>({ kind: 'idle' });
  const started = useRef(false);
  const plan = plans.find((p) => p.id === selectedPlan) ?? plans[0]!;

  async function start(planKey: SignupPlanId) {
    setCheckout({ kind: 'loading' });
    let signupRequestId: string;
    try {
      ({ signupRequestId } = await submitSignupDetails({ ...details, planKey, termsAccepted: true }));
    } catch (err) {
      if (!(err instanceof ApiRequestError)) {
        setCheckout({ kind: 'error', message: "We couldn't reach PropertyPro. Check your connection and try again." });
        return;
      }
      if (err.status === 401 || err.status === 403) {
        setCheckout({
          kind: 'error',
          message: 'Your sign-in expired. Your answers are saved on this device — sign in again to finish.',
          signedOut: true,
        });
        return;
      }
      const fieldErrors = err.details?.['fieldErrors'] as Record<string, string[] | undefined> | undefined;
      const field =
        (typeof err.details?.['field'] === 'string' ? (err.details['field'] as string) : undefined)
        ?? Object.keys(fieldErrors ?? {})[0];
      const message = (field && fieldErrors?.[field]?.[0]) || err.message;
      if (field && onRejected(field, message)) return;
      setCheckout({ kind: 'error', message: err.message });
      return;
    }

    onSaved(signupRequestId);
    const session = await createCheckoutSession(signupRequestId).catch(() => null);
    if (session && !session.ok && session.field && onRejected(session.field, session.error)) return;
    if (!session || !session.ok) {
      setCheckout({ kind: 'error', message: session && !session.ok ? session.error : 'Unable to start checkout. Please try again.' });
      return;
    }
    setCheckout({ kind: 'ready', clientSecret: session.clientSecret });
  }

  // After the first start, a plan change re-prices the open checkout.
  useEffect(() => {
    if (started.current) void start(selectedPlan);
    // `start` closes over the latest details; only the plan should trigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlan]);

  const stripe = getStripePromise();

  return (
    <div className="flex flex-col gap-7">
      <StepHeading
        eyebrow={`Free for ${SIGNUP_TRIAL_DAYS} days`}
        title="Start your free trial"
        lede={
          <>
            Choose a plan. You won&apos;t be charged until{' '}
            <strong className="font-semibold text-content">{trialEnd.long}</strong>, and you can cancel anytime before then.
          </>
        }
      />
      <div className="fp-enter grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3" style={{ animationDelay: '60ms' }}>
        {plans.map((p) => {
          const selected = p.id === plan.id;
          return (
            <button
              key={p.id}
              id={`fp-plan-${p.id}`}
              type="button"
              aria-pressed={selected}
              disabled={checkout.kind === 'loading'}
              onClick={(ev) => {
                if (p.id === plan.id) return;
                flyTo(ev.currentTarget, 'plan', p.label);
                onSelectPlan(p.id);
              }}
              className={cn(
                'relative flex flex-col items-start gap-2 rounded-md border p-5 text-left text-content transition-colors hover:shadow-e1',
                selected ? 'border-interactive bg-interactive-subtle' : 'border-edge bg-surface-card',
              )}
            >
              <span className="flex items-center gap-2">
                <span className="text-lg font-semibold">{p.label}</span>
                {p.id === 'professional' ? <PlanBadge variant="pro" /> : null}
              </span>
              <span>
                <span className="text-2xl font-semibold">${p.monthlyPriceUsd}</span>
                <span className="text-sm text-content-secondary"> /month after trial</span>
              </span>
              <span className="text-sm text-content-secondary">{p.description}</span>
              {selected ? (
                <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-interactive text-content-inverse">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="fp-enter flex flex-col gap-2 rounded-md border border-edge bg-surface-subtle p-4" style={{ animationDelay: '120ms' }}>
        <div className="flex justify-between text-base">
          <span>Due today</span>
          <strong className="font-semibold">$0.00</strong>
        </div>
        <div className="flex justify-between text-sm tabular-nums text-content-secondary">
          <span>Starting {trialEnd.long}</span>
          <span>${plan.monthlyPriceUsd}.00/month</span>
        </div>
      </div>

      {checkout.kind === 'error' ? (
        <div role="alert" className="rounded-md border border-status-danger-border bg-status-danger-bg px-4 py-3 text-sm text-content">
          {checkout.message}
          {checkout.signedOut ? (
            <>
              {' '}
              <Link href="/signup" className="font-medium text-content-link hover:underline">
                Get a new sign-in link
              </Link>
            </>
          ) : null}
        </div>
      ) : null}

      {checkout.kind === 'ready' && stripe ? (
        <div className="fp-enter" data-testid="embedded-checkout">
          {/* key: a new client secret is a new session; the provider cannot swap it. */}
          <EmbeddedCheckoutProvider key={checkout.clientSecret} stripe={stripe} options={{ clientSecret: checkout.clientSecret }}>
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
          <div className="mt-2 flex items-center gap-2 text-xs text-content-tertiary">
            <Lock className="h-3 w-3" aria-hidden="true" />
            Processed securely by Stripe. PropertyPro never sees your full card number.
          </div>
        </div>
      ) : null}

      {checkout.kind === 'ready' && !stripe ? (
        <div role="alert" className="rounded-md border border-status-danger-border bg-status-danger-bg px-4 py-3 text-sm text-content">
          Payment system is temporarily unavailable. Please try again shortly.
        </div>
      ) : null}

      {checkout.kind !== 'ready' ? (
        <div className="flex flex-col gap-3">
          <p className="m-0 text-sm text-content-tertiary">
            By starting your trial, you agree to the{' '}
            <Link href="/legal/terms" target="_blank" rel="noreferrer" className="text-content-link hover:underline">Terms of Service</Link>{' '}
            and{' '}
            <Link href="/legal/privacy" target="_blank" rel="noreferrer" className="text-content-link hover:underline">Privacy Policy</Link>.
          </p>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex h-12 items-center gap-2 rounded-md px-4 text-base font-medium text-content-secondary hover:bg-surface-hover"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back
            </button>
            <button
              type="button"
              disabled={checkout.kind === 'loading'}
              onClick={() => {
                started.current = true;
                void start(plan.id);
              }}
              className="inline-flex h-12 items-center gap-2 whitespace-nowrap rounded-md bg-interactive px-6 text-base font-semibold text-content-inverse shadow-e1 transition-colors hover:bg-interactive-hover active:bg-interactive-active disabled:bg-interactive-disabled"
            >
              {checkout.kind === 'loading' ? (
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : null}
              Start free trial
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <p className="m-0 text-sm text-content-tertiary">Cancel anytime before {trialEnd.short}.</p>
        </div>
      ) : (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-12 items-center gap-2 self-start rounded-md px-4 text-base font-medium text-content-secondary hover:bg-surface-hover"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back
        </button>
      )}
    </div>
  );
}
