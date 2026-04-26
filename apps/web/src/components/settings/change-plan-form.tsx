'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, Loader2 } from 'lucide-react';
import { comparePlanTiers, type PlanId } from '@propertypro/shared';
import { useReauth } from '@/hooks/use-reauth';
import { ReauthModal } from '@/components/auth/reauth-modal';

type BillingInterval = 'month' | 'year';

interface PlanOption {
  id: PlanId;
  label: string;
  /** Price in USD/month at monthly cadence. Annual price is computed as 10× this. */
  monthlyPriceUsd: number;
  description: string;
}

interface ChangePlanFormProps {
  communityId: number;
  currentPlan: PlanId | null;
  currentInterval: BillingInterval | null;
  plans: PlanOption[];
  cancelHref: string;
}

const ANNUAL_DISCOUNT_FACTOR = 10; // 12 months at monthly price = 12×; annual = 10× → 2 months free

function formatPrice(monthlyUsd: number, interval: BillingInterval): string {
  if (interval === 'year') {
    return `$${(monthlyUsd * ANNUAL_DISCOUNT_FACTOR).toLocaleString()}/yr`;
  }
  return `$${monthlyUsd}/mo`;
}

export function ChangePlanForm({
  communityId,
  currentPlan,
  currentInterval,
  plans,
  cancelHref,
}: ChangePlanFormProps) {
  const router = useRouter();
  const [interval, setInterval] = useState<BillingInterval>(currentInterval === 'year' ? 'year' : 'month');
  const [selectedPlan, setSelectedPlan] = useState<PlanId | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { triggerReauth, isOpen: reauthOpen, onCancel: reauthCancel, verify: reauthVerify } = useReauth();

  // A plan card is offered when the change is either a tier upgrade
  // (compareTiers < 0) OR the same tier with a different interval.
  // If `currentInterval` is null (Stripe lookup failed server-side), we
  // optimistically show the annual same-tier card — the API enforces the
  // no-op rule, so a wrongly-shown card surfaces a clean 400 instead of
  // silently hiding the upsell during a Stripe blip.
  const offeredPlans = useMemo(() => {
    if (!currentPlan) return plans;
    return plans.filter((p) => {
      const cmp = comparePlanTiers(currentPlan, p.id);
      if (cmp === null) return false;
      if (cmp < 0) return true; // higher tier
      if (cmp === 0) {
        // Same tier — only valid as an interval change. Never show when the
        // toggle matches the known current interval (would be a no-op).
        return currentInterval !== interval;
      }
      return false; // lower tier
    });
  }, [plans, currentPlan, currentInterval, interval]);

  const selected = selectedPlan ? plans.find((p) => p.id === selectedPlan) ?? null : null;

  function openConfirm() {
    if (!selectedPlan) return;
    setError(null);
    setShowConfirm(true);
  }

  async function submit() {
    if (!selectedPlan) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const confirmed = await triggerReauth();
      if (!confirmed) {
        setIsSubmitting(false);
        return;
      }
      const res = await fetch(`/api/v1/subscribe/change-plan?communityId=${communityId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: selectedPlan, billingInterval: interval }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as {
          error?: string | { message?: string };
        };
        const message =
          typeof body.error === 'string'
            ? body.error
            : body.error?.message ?? `Could not change plan (${res.status})`;
        throw new Error(message);
      }
      // Webhook will sync subscriptionPlan in a few seconds; bounce back and refresh.
      router.push(cancelHref);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setIsSubmitting(false);
      setShowConfirm(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Interval toggle */}
      <div className="inline-flex rounded-[10px] border border-edge bg-surface-card p-1">
        {(['month', 'year'] as const).map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => {
              setInterval(opt);
              setSelectedPlan(null);
            }}
            className={
              'rounded-[8px] px-4 py-1.5 text-sm font-medium transition-colors ' +
              (interval === opt
                ? 'bg-[var(--interactive-primary)] text-white'
                : 'text-content-secondary hover:text-content-primary')
            }
            aria-pressed={interval === opt}
          >
            {opt === 'month' ? 'Monthly' : 'Annual'}
            {opt === 'year' && (
              <span className="ml-2 rounded-full bg-status-success-subtle px-1.5 py-0.5 text-xs text-status-success">
                Save ~17%
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Plan cards */}
      {offeredPlans.length === 0 ? (
        <div className="rounded-[10px] border border-edge bg-surface-card p-8 text-center">
          <p className="text-base font-medium text-content-primary">
            You&apos;re already on the highest plan available for your community.
          </p>
          <p className="mt-2 text-sm text-content-secondary">
            To downgrade or cancel, use the Stripe billing portal from{' '}
            <Link href={cancelHref} className="text-[var(--interactive-primary)] underline">
              Settings → Billing
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {offeredPlans.map((plan) => {
            const isSelected = selectedPlan === plan.id;
            const isCurrent = currentPlan === plan.id && currentInterval === interval;
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => !isCurrent && setSelectedPlan(plan.id)}
                disabled={isCurrent}
                className={
                  'relative rounded-[10px] border-2 p-5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-primary)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ' +
                  (isSelected
                    ? 'border-[var(--interactive-primary)] bg-surface-card'
                    : 'border-edge bg-surface-card hover:border-[var(--border-hover)]')
                }
                aria-pressed={isSelected}
              >
                {isCurrent && (
                  <span className="absolute right-3 top-3 rounded-full bg-surface-secondary px-2 py-0.5 text-xs font-medium text-content-secondary">
                    Current
                  </span>
                )}
                {isSelected && !isCurrent && (
                  <div className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--interactive-primary)]">
                    <Check size={12} className="text-white" aria-hidden="true" />
                  </div>
                )}
                <div className="text-lg font-semibold text-content-primary">{plan.label}</div>
                <div className="mt-1 text-2xl font-bold text-content-primary">
                  {formatPrice(plan.monthlyPriceUsd, interval)}
                </div>
                <p className="mt-2 text-sm text-content-secondary">{plan.description}</p>
              </button>
            );
          })}
        </div>
      )}

      {/* Action row */}
      {offeredPlans.length > 0 && (
        <div className="flex items-center justify-end gap-3">
          <Link
            href={cancelHref}
            className="rounded-[10px] border border-edge px-4 py-2 text-sm font-medium text-content-primary hover:bg-surface-secondary"
          >
            Cancel
          </Link>
          <button
            type="button"
            onClick={openConfirm}
            disabled={!selectedPlan || isSubmitting}
            className="rounded-[10px] bg-[var(--interactive-primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Review change
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-[10px] border border-status-danger-border bg-status-danger-subtle p-4 text-sm text-status-danger"
        >
          {error}
        </div>
      )}

      {/* Confirm dialog */}
      {showConfirm && selected && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-change-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => e.target === e.currentTarget && !isSubmitting && setShowConfirm(false)}
        >
          <div className="w-full max-w-md rounded-[16px] bg-surface-card p-6 shadow-lg">
            <h2 id="confirm-change-title" className="text-lg font-semibold text-content-primary">
              Confirm plan change
            </h2>
            <div className="mt-4 space-y-2 text-sm text-content-secondary">
              <p>
                You&apos;ll be moved to <strong className="text-content-primary">{selected.label}</strong> at{' '}
                <strong className="text-content-primary">{formatPrice(selected.monthlyPriceUsd, interval)}</strong>{' '}
                ({interval === 'year' ? 'billed annually' : 'billed monthly'}).
              </p>
              <p>
                Stripe will charge a prorated amount today for the remainder of your current period and
                bill the new rate going forward.
              </p>
              <p>
                You&apos;ll be asked to re-enter your password to confirm.
              </p>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                disabled={isSubmitting}
                className="rounded-[10px] border border-edge px-4 py-2 text-sm font-medium text-content-primary hover:bg-surface-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 rounded-[10px] bg-[var(--interactive-primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {isSubmitting && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
                Confirm change
              </button>
            </div>
          </div>
        </div>
      )}

      <ReauthModal isOpen={reauthOpen} onCancel={reauthCancel} verify={reauthVerify} />
    </div>
  );
}
