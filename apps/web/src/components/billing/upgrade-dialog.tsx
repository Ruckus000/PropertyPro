'use client';

/**
 * UpgradeDialog — the in-context upgrade surface, opened from the sidebar
 * (and from LockedFeatureScreen).
 *
 * Replaces the old fixed-position UpgradePrompt card. Built on the shared
 * Dialog primitive so we get focus trap, Esc-to-close, and proper a11y
 * for free.
 *
 * Three role-aware footers:
 *   - upgrade  → "Upgrade now" → navigates to /settings/billing/change-plan
 *                (which owns the Stripe handoff via /api/v1/subscribe[/change-plan])
 *   - request  → "Notify your board" → POST /api/v1/billing/upgrade-requests
 *   - hidden   → never opens for tenants in normal flow; renders a no-CTA
 *                fallback if it ever does.
 */
import * as React from 'react';
import { Check, Loader2, Sparkles } from 'lucide-react';
import {
  PLAN_FEATURES,
  findCheapestPlanForFeature,
  getLockedFeatureBehavior,
  getPlanFeatureCopy,
  resolvePlanId,
  type AnyCommunityRole,
  type CommunityFeatures,
  type PlanId,
} from '@propertypro/shared';
import { PlanBadge } from '@propertypro/ui';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface UpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Feature that triggered the lock; drives the marketing copy. Nullable when the lock came from an any-of gate. */
  featureKey: keyof CommunityFeatures | null;
  /** Current plan id (resolved). Used to render the "Current plan" card. */
  currentPlanId: PlanId | null;
  /** Raw plan string from the community row, used as a fallback for resolution. */
  currentPlanRaw: string | null;
  role: AnyCommunityRole | null;
  /**
   * Tenant id, threaded through to the fetch URLs. Without it,
   * `resolveEffectiveCommunityId` on the API side can't pick a tenant when
   * the subdomain isn't community-specific (e.g. localhost dev).
   */
  communityId: number | null;
}

interface UpgradeRequestResponse {
  ok: true;
  notified: number;
}

export function UpgradeDialog({
  open,
  onOpenChange,
  featureKey,
  currentPlanId,
  currentPlanRaw,
  role,
  communityId,
}: UpgradeDialogProps) {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [requestSent, setRequestSent] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setPending(false);
      setError(null);
      setRequestSent(false);
    }
  }, [open]);

  const behavior = getLockedFeatureBehavior(role);
  const copy = featureKey ? getPlanFeatureCopy(featureKey) : null;

  const resolvedCurrentPlan: PlanId | null =
    currentPlanId ?? (currentPlanRaw ? resolvePlanId(currentPlanRaw) : null);
  const currentPlanConfig = resolvedCurrentPlan
    ? PLAN_FEATURES[resolvedCurrentPlan]
    : null;

  // Pick the cheapest plan that includes the feature we're trying to unlock.
  const upgradePlan = featureKey ? findCheapestPlanForFeature(featureKey) : null;
  const upgradePlanId: PlanId | null = upgradePlan
    ? (Object.entries(PLAN_FEATURES).find(([, cfg]) => cfg === upgradePlan)?.[0] as PlanId | undefined) ?? null
    : null;

  const tenantQuery = communityId ? `?communityId=${communityId}` : '';

  function handleUpgrade() {
    if (pending) return;
    // Hand off to the dedicated Change plan page. That flow already handles
    // the active-subscription branch (Stripe portal change-plan endpoint) and
    // the no-subscription branch (bounce back to /settings/billing). Owning
    // the checkout logic in a single place keeps this dialog purely a
    // marketing surface — it doesn't duplicate the subscription-state checks
    // the change-plan page already does.
    setPending(true);
    window.location.href = `/settings/billing/change-plan${tenantQuery}`;
  }

  async function handleNotify() {
    if (pending || requestSent) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/billing/upgrade-requests${tenantQuery}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          featureKey,
          requestedPlan: upgradePlanId,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(
          (json as { message?: string })?.message ??
            'We couldn’t send your request. Please try again.',
        );
      }
      (await res.json()) as UpgradeRequestResponse;
      setRequestSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setPending(false);
    }
  }

  const headingText = copy?.displayName ?? 'Upgrade required';
  const tagline =
    copy?.tagline ??
    `This feature is available on the ${upgradePlan?.displayName ?? 'higher'} plan.`;
  const benefits = copy?.benefits;

  const recommendedTone =
    upgradePlan?.displayName === 'Operations Plus' ? 'enterprise'
      : upgradePlan?.displayName === 'Professional' ? 'pro'
      : 'plus';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 p-0 overflow-hidden">
        {/* Hero — placeholder gradient + feature icon */}
        <div className="relative flex h-32 items-center justify-center overflow-hidden bg-gradient-to-br from-[#3B82F6] via-[#6366F1] to-[#8B5CF6]">
          <div className="absolute inset-0 opacity-20" aria-hidden="true">
            <div className="absolute -left-6 -top-6 size-32 rounded-full bg-white blur-3xl" />
            <div className="absolute -right-12 bottom-0 size-40 rounded-full bg-white blur-3xl" />
          </div>
          <Sparkles
            size={56}
            strokeWidth={1.5}
            className="relative text-white drop-shadow-md"
            aria-hidden="true"
          />
        </div>

        <div className="space-y-5 p-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <DialogTitle className="text-xl font-semibold">{headingText}</DialogTitle>
              <PlanBadge variant={recommendedTone} tone="light" />
            </div>
            <DialogDescription className="text-sm text-content-secondary">
              {tagline}
            </DialogDescription>
          </div>

          {benefits && (
            <ul className="space-y-2">
              {benefits.map((benefit) => (
                <li key={benefit} className="flex items-start gap-2.5 text-sm">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--interactive-primary)]/12 text-[var(--interactive-primary)]">
                    <Check size={12} strokeWidth={2.5} aria-hidden="true" />
                  </span>
                  <span className="text-content-primary">{benefit}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Plan comparison */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <PlanCard
              kind="current"
              displayName={currentPlanConfig?.displayName ?? 'No plan'}
              priceUsd={currentPlanConfig?.monthlyPriceUsd ?? null}
            />
            <PlanCard
              kind="recommended"
              displayName={upgradePlan?.displayName ?? 'Higher plan'}
              priceUsd={upgradePlan?.monthlyPriceUsd ?? null}
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-status-danger">
              {error}
            </p>
          )}

          <DialogFooterActions
            behavior={behavior}
            pending={pending}
            requestSent={requestSent}
            onUpgrade={handleUpgrade}
            onNotify={handleNotify}
            onClose={() => onOpenChange(false)}
            canUpgrade={Boolean(upgradePlanId)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PlanCard({
  kind,
  displayName,
  priceUsd,
}: {
  kind: 'current' | 'recommended';
  displayName: string;
  priceUsd: number | null;
}) {
  const isRecommended = kind === 'recommended';
  return (
    <div
      className={cn(
        'rounded-md border p-4 transition-colors',
        isRecommended
          ? 'border-[var(--interactive-primary)] bg-[var(--interactive-primary)]/5 ring-1 ring-[var(--interactive-primary)]/40'
          : 'border-edge bg-surface-card',
      )}
    >
      <div className="flex items-center justify-between">
        <p
          className={cn(
            'text-xs font-semibold uppercase tracking-wider',
            isRecommended ? 'text-[var(--interactive-primary)]' : 'text-content-tertiary',
          )}
        >
          {isRecommended ? 'Recommended' : 'Current plan'}
        </p>
        {isRecommended && <PlanBadge variant="pro" tone="light" />}
      </div>
      <p className="mt-2 text-base font-semibold text-content-primary">{displayName}</p>
      {priceUsd != null ? (
        <p className="text-sm text-content-secondary">
          <span className="font-medium text-content-primary">${priceUsd}</span> / month
        </p>
      ) : (
        <p className="text-sm text-content-tertiary">—</p>
      )}
    </div>
  );
}

function DialogFooterActions({
  behavior,
  pending,
  requestSent,
  onUpgrade,
  onNotify,
  onClose,
  canUpgrade,
}: {
  behavior: 'upgrade' | 'request' | 'hidden';
  pending: boolean;
  requestSent: boolean;
  onUpgrade: () => void;
  onNotify: () => void;
  onClose: () => void;
  canUpgrade: boolean;
}) {
  if (behavior === 'hidden') {
    return (
      <div className="flex justify-end">
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    );
  }

  if (behavior === 'request') {
    if (requestSent) {
      return (
        <div className="space-y-2">
          <div
            role="status"
            className="flex items-start gap-2 rounded-md border border-status-success-border bg-status-success-subtle p-3 text-sm text-status-success"
          >
            <Check size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              Request sent. Your board president and CAM have been notified.
            </span>
          </div>
          <div className="flex justify-end">
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-2">
        <p className="text-xs text-content-tertiary">
          We&rsquo;ll send a notification to your board president and CAM.
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Maybe later
          </Button>
          <Button onClick={onNotify} disabled={pending}>
            {pending && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            Notify your board
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button variant="ghost" onClick={onClose} disabled={pending}>
        Maybe later
      </Button>
      <Button onClick={onUpgrade} disabled={pending || !canUpgrade}>
        {pending && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
        Upgrade now
      </Button>
    </div>
  );
}

export default UpgradeDialog;
