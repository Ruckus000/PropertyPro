'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Check } from 'lucide-react';
import { comparePlanTiers, type PlanId } from '@propertypro/shared';
import { useReauth } from '@/hooks/use-reauth';
import { useChangePlan } from '@/hooks/use-change-plan';
import { useSubscribe } from '@/hooks/use-subscribe';
import { ReauthModal } from '@/components/auth/reauth-modal';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type BillingInterval = 'month' | 'year';

interface PlanOption {
  id: PlanId;
  label: string;
  /** Price in USD/month at monthly cadence. Annual price is computed as 10× this. */
  monthlyPriceUsd: number;
  description: string;
}

/**
 * `change` — community already pays; POSTs /api/v1/subscribe/change-plan and
 *   stays in-app (Stripe updates the subscription server-side). Reauth-gated,
 *   because it charges a payment method already on file.
 * `new` — community has no active subscription; POSTs /api/v1/subscribe and
 *   hands off to Stripe Checkout. NOT reauth-gated: nothing is charged until
 *   the user enters card details on Stripe's own page, so a password prompt
 *   would guard nothing and just add friction to the purchase funnel.
 */
type ChangePlanFormMode = 'new' | 'change';

interface ChangePlanFormProps {
  mode?: ChangePlanFormMode;
  /**
   * `new` mode only. True when the community already has a Stripe customer
   * (a re-subscribe), which the API reauth-gates because completing it
   * repoints the community's billing identity.
   */
  requiresReauth?: boolean;
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
  mode = 'change',
  requiresReauth = false,
  communityId,
  currentPlan,
  currentInterval,
  plans,
  cancelHref,
}: ChangePlanFormProps) {
  const isNewSubscription = mode === 'new';
  const router = useRouter();
  const [interval, setInterval] = useState<BillingInterval>(currentInterval === 'year' ? 'year' : 'month');
  const [selectedPlan, setSelectedPlan] = useState<PlanId | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { triggerReauth, isOpen: reauthOpen, onCancel: reauthCancel, verify: reauthVerify } = useReauth();
  const changePlan = useChangePlan();
  const subscribe = useSubscribe();

  // A plan card is offered when the change is either a tier upgrade
  // (compareTiers < 0) OR the same tier with a different interval.
  // If `currentInterval` is null (Stripe lookup failed server-side), the
  // same-tier card is shown at BOTH toggle positions rather than hidden — the
  // API enforces the no-op rule, so a wrongly-shown card surfaces a clean 400
  // instead of silently hiding the upsell during a Stripe blip.
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

    if (isNewSubscription) {
      try {
        if (requiresReauth) {
          const confirmed = await triggerReauth();
          if (!confirmed) {
            setIsSubmitting(false);
            return;
          }
        }
        const { checkoutUrl } = await subscribe.mutateAsync({
          communityId,
          planId: selectedPlan,
          billingInterval: interval,
        });
        if (!checkoutUrl) {
          throw new Error('Stripe did not return a checkout URL. Please try again.');
        }
        // Full navigation, not router.push — we're leaving the app for Stripe.
        // Deliberately no setIsSubmitting(false): the button stays busy until
        // the browser unloads, so the user can't fire a second checkout.
        window.location.href = checkoutUrl;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
        setIsSubmitting(false);
        setShowConfirm(false);
      }
      return;
    }

    try {
      const confirmed = await triggerReauth();
      if (!confirmed) {
        setIsSubmitting(false);
        return;
      }
      await changePlan.mutateAsync({
        communityId,
        planId: selectedPlan,
        billingInterval: interval,
      });
      // Webhook will sync subscriptionPlan in a few seconds; bounce back and refresh.
      // Toast confirms the change given the webhook lag before the plan pill updates.
      toast.success('Plan change submitted — your subscription will update shortly.');
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
          <Button
            key={opt}
            type="button"
            variant={interval === opt ? "default" : "ghost"}
            className={interval === opt ? "" : "text-content-secondary"}
            onClick={() => {
              setInterval(opt);
              setSelectedPlan(null);
            }}
            aria-pressed={interval === opt}
          >
            {opt === 'month' ? 'Monthly' : 'Annual'}
            {opt === 'year' && (
              <span className="ml-2 rounded-full bg-status-success-subtle px-1.5 py-0.5 text-xs text-status-success">
                Save ~17%
              </span>
            )}
          </Button>
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
                    : 'border-edge bg-surface-card hover:border-[var(--border-strong)]')
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
          <Button variant="outline" asChild>
            <Link href={cancelHref}>Cancel</Link>
          </Button>
          <Button
            type="button"
            onClick={openConfirm}
            disabled={!selectedPlan || isSubmitting}
          >
            {isNewSubscription ? 'Continue to payment' : 'Review change'}
          </Button>
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
      <Dialog open={showConfirm && selected !== null} onOpenChange={(open) => !isSubmitting && setShowConfirm(open)}>
        <DialogContent size="md" resizable>
          <DialogHeader>
            <DialogTitle>
              {isNewSubscription ? 'Confirm your plan' : 'Confirm plan change'}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 pt-2">
                <p>
                  {isNewSubscription ? "You're subscribing to " : "You'll be moved to "}
                  <strong className="text-content-primary">{selected?.label}</strong> at{' '}
                  <strong className="text-content-primary">{selected ? formatPrice(selected.monthlyPriceUsd, interval) : ''}</strong>{' '}
                  ({interval === 'year' ? 'billed annually' : 'billed monthly'}).
                </p>
                {isNewSubscription ? (
                  <p>
                    We&apos;ll take you to Stripe to enter your payment details. Nothing is charged
                    until you complete checkout there.
                  </p>
                ) : (
                  <>
                    <p>
                      Stripe will charge a prorated amount today for the remainder of your current period and
                      bill the new rate going forward.
                    </p>
                    <p>
                      You&apos;ll be asked to re-enter your password to confirm.
                    </p>
                  </>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowConfirm(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={submit}
              loading={isSubmitting}
            >
              {isNewSubscription ? 'Continue to Stripe' : 'Confirm change'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReauthModal isOpen={reauthOpen} onCancel={reauthCancel} verify={reauthVerify} />
    </div>
  );
}
