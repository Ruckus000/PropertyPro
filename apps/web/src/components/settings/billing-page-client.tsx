'use client';

import React, { useState } from 'react';
import {
  CreditCard,
  ExternalLink,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  Info,
  ArrowUpRight,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { useReauth } from '@/hooks/use-reauth';
import { useMyRootless } from '@/hooks/use-claim-root';
import { ReauthModal } from '@/components/auth/reauth-modal';

import { PLAN_FEATURES, LEGACY_PLAN_ALIASES } from '@propertypro/shared';

// ── Plan display mapping (derived from PLAN_FEATURES + legacy aliases) ──

const PLAN_DISPLAY: Record<string, { name: string; price: string }> = {
  // Current plan IDs
  ...Object.fromEntries(
    Object.entries(PLAN_FEATURES).map(([id, config]) => [
      id,
      { name: config.displayName, price: `$${config.monthlyPriceUsd}/mo` },
    ]),
  ),
  // Legacy plan IDs → resolve to their new plan's display info
  ...Object.fromEntries(
    Object.entries(LEGACY_PLAN_ALIASES).map(([legacyId, newId]) => [
      legacyId,
      {
        name: PLAN_FEATURES[newId].displayName,
        price: `$${PLAN_FEATURES[newId].monthlyPriceUsd}/mo`,
      },
    ]),
  ),
};

// ── Subscription status display config ──

interface StatusDisplay {
  label: string;
  variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  icon: React.ElementType;
}

const STATUS_DISPLAY: Record<string, StatusDisplay> = {
  active: { label: 'Active', variant: 'success', icon: CheckCircle2 },
  trialing: { label: 'Trialing', variant: 'info', icon: Clock },
  past_due: { label: 'Past Due', variant: 'warning', icon: AlertTriangle },
  canceled: { label: 'Canceled', variant: 'danger', icon: XCircle },
  unpaid: { label: 'Unpaid', variant: 'danger', icon: AlertTriangle },
  incomplete: { label: 'Incomplete', variant: 'warning', icon: Clock },
  incomplete_expired: { label: 'Expired', variant: 'danger', icon: XCircle },
  paused: { label: 'Paused', variant: 'neutral', icon: Info },
};

function getStatusDisplay(status: string | null): StatusDisplay {
  if (!status) return { label: 'Unknown', variant: 'neutral', icon: Info };
  return STATUS_DISPLAY[status] ?? { label: status, variant: 'neutral', icon: Info };
}

// ── Variant class mapping using semantic tokens ──

const NEUTRAL_CLASSES = { text: 'text-content-secondary', bg: 'bg-surface-muted', border: 'border-edge' } as const;

const VARIANT_CLASSES: Record<string, { text: string; bg: string; border: string }> = {
  success: { text: 'text-status-success', bg: 'bg-status-success-subtle', border: 'border-status-success-border' },
  warning: { text: 'text-status-warning', bg: 'bg-status-warning-subtle', border: 'border-status-warning-border' },
  danger: { text: 'text-status-danger', bg: 'bg-status-danger-subtle', border: 'border-status-danger-border' },
  info: { text: 'text-status-info', bg: 'bg-status-info-subtle', border: 'border-status-info-border' },
  neutral: { text: 'text-content-secondary', bg: 'bg-surface-muted', border: 'border-edge' },
};

// ── Read-only notice (R3-03) ──

/**
 * Explains to a member who cannot manage billing why, and — critically — what
 * to do about it.
 *
 * The property-manager case is the one that matters. After R3-03 a PM in a
 * community whose root seat is VACANT can no longer purchase, and nobody else
 * can either: the community is stuck until someone claims root. That is a
 * recoverable state, and this notice is what makes it recoverable in the place
 * the user actually hit the wall.
 *
 * Deliberately NOT `ClaimRootBanner`: that component is dismissible and writes
 * a SHARED `claim-root-dismissed` sessionStorage key, so dismissing it once on
 * the dashboard would silently suppress it here too — on a surface where being
 * suppressed means staying locked out.
 */
function BillingReadOnlyNotice({
  communityId,
  canView,
  bounced,
}: {
  communityId: number;
  canView: boolean;
  bounced: boolean;
}) {
  // `canView` gates the QUERY, not the copy: only the management tier can hold a
  // rootless property_manager membership, so a resident's list is always empty
  // and the request is skipped entirely. With the query disabled
  // `isRootlessHere` is false, so residents fall through to the
  // contact-your-root-manager branch without needing a separate arm.
  const { data: rootless } = useMyRootless(canView);
  const isRootlessHere = (rootless ?? []).some((c) => c.id === communityId);

  return (
    <div
      className={cn(
        'rounded-[10px] border p-4',
        bounced
          ? 'border-status-info-border bg-status-info-subtle'
          : 'border-edge bg-surface-muted',
      )}
      // Announce only when this explains a bounce the user just experienced;
      // as ambient page content it is not an alert.
      {...(bounced ? { role: 'status' as const } : {})}
    >
      {bounced && (
        <p className="mb-1 text-sm font-medium text-content">
          Only the root manager can change billing for this community.
        </p>
      )}

      {isRootlessHere ? (
        <>
          <p className="text-sm text-content-secondary">
            This community doesn&apos;t have a root manager yet, so nobody can
            change billing. As a property manager, you can claim it.
          </p>
          <Link
            href="/dashboard/claim-root"
            className="mt-3 inline-flex items-center gap-1.5 rounded-[10px] bg-interactive px-4 py-2 text-sm font-medium text-content-inverse transition-opacity hover:opacity-90"
          >
            Claim root manager
            <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </>
      ) : (
        <p className="text-sm text-content-secondary">
          Contact your community&apos;s root manager to make changes to the
          billing plan.
        </p>
      )}
    </div>
  );
}

// ── Props ──

interface BillingPageClientProps {
  communityId: number;
  communityName: string;
  subscriptionPlan: string | null;
  subscriptionStatus: string | null;
  /** Live billing interval read from the active Stripe subscription. */
  subscriptionInterval: 'month' | 'year' | null;
  stripeCustomerId: string | null;
  paymentFailedAt: string | null;
  /**
   * Management tier — sees plan, status and interval. R3-03: a property
   * manager keeps this after losing the actions, because hiding billing from
   * them would make the capability loss invisible.
   */
  canView: boolean;
  /** Root-only — gates every action. Mirrors `requireRootManager` on the routes. */
  canManage: boolean;
  /** True when /billing/portal or change-plan bounced a non-root back here. */
  bouncedFromRootGate?: boolean;
}

// ── Component ──

export function BillingPageClient({
  communityId,
  communityName,
  subscriptionPlan,
  subscriptionStatus,
  subscriptionInterval,
  stripeCustomerId,
  paymentFailedAt,
  canView,
  canManage,
  bouncedFromRootGate = false,
}: BillingPageClientProps) {
  const plan = subscriptionPlan ? PLAN_DISPLAY[subscriptionPlan] : null;
  const status = getStatusDisplay(subscriptionStatus);
  const StatusIcon = status.icon;
  const variantClasses = VARIANT_CLASSES[status.variant] ?? NEUTRAL_CLASSES;

  const portalUrl = `/billing/portal?communityId=${communityId}`;
  const changePlanUrl = `/settings/billing/change-plan?communityId=${communityId}`;
  const hasStripe = !!stripeCustomerId;
  const intervalLabel =
    subscriptionInterval === 'year'
      ? 'billed annually'
      : subscriptionInterval === 'month'
        ? 'billed monthly'
        : null;

  const [portalPending, setPortalPending] = useState(false);
  const router = useRouter();
  const { triggerReauth, isOpen: reauthOpen, onCancel: reauthCancel, verify: reauthVerify } = useReauth();

  async function openPortal() {
    if (portalPending) return;
    setPortalPending(true);
    const confirmed = await triggerReauth();
    if (confirmed) {
      router.push(portalUrl);
    } else {
      setPortalPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-1 text-xl font-semibold">Billing</h1>
        <p className="text-sm text-content-secondary">
          Manage your subscription and payment details for {communityName}.
        </p>
      </div>

      {/* Payment Failed Warning */}
      {paymentFailedAt && (
        <div
          className="flex items-start gap-3 rounded-[10px] border border-status-danger-border bg-status-danger-subtle p-5"
          role="alert"
        >
          <AlertTriangle
            className="mt-0.5 shrink-0 text-status-danger"
            size={20}
            aria-hidden="true"
          />
          <div className="flex-1">
            <p className="text-sm font-medium text-status-danger">
              Payment failed on{' '}
              {new Date(paymentFailedAt).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
            <p className="mt-1 text-sm text-content-secondary">
              Please update your payment method to avoid service interruption.
            </p>
            {hasStripe && canManage && (
              <button
                type="button"
                onClick={openPortal}
                disabled={portalPending}
                className="mt-3 inline-flex items-center gap-1.5 rounded-[10px] bg-status-danger px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Update Payment Method
                <ExternalLink size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Current Plan Card */}
      <div className="rounded-[10px] border border-edge bg-surface-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <CreditCard size={18} className="text-content-secondary" aria-hidden="true" />
          <h2 className="text-base font-semibold">Current Plan</h2>
        </div>

        {plan ? (
          <div className="space-y-4">
            <div className="flex items-baseline justify-between">
              <div>
                <p className="text-lg font-semibold">{plan.name}</p>
                <p className="text-sm text-content-secondary">
                  {plan.price}
                  {intervalLabel ? ` · ${intervalLabel}` : ''}
                </p>
              </div>
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
                  variantClasses.text,
                  variantClasses.bg,
                  `border ${variantClasses.border}`,
                )}
              >
                <StatusIcon size={14} className="shrink-0" aria-hidden="true" />
                {status.label}
              </span>
            </div>

            {canManage && (
              <div className="flex flex-wrap gap-2">
                <Link
                  href={changePlanUrl}
                  className="inline-flex items-center gap-1.5 rounded-[10px] bg-interactive px-4 py-2 text-sm font-medium text-content-inverse transition-opacity hover:opacity-90"
                >
                  Change plan
                  <ArrowUpRight size={14} aria-hidden="true" />
                </Link>
                {hasStripe && (
                  <button
                    type="button"
                    onClick={openPortal}
                    disabled={portalPending}
                    className="inline-flex items-center gap-1.5 rounded-[10px] border border-edge bg-surface-card px-4 py-2 text-sm font-medium text-content transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Manage Subscription
                    <ExternalLink size={14} aria-hidden="true" />
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          /* No plan: either never provisioned, or canceled (which nulls
             subscriptionPlan). Admins get a real purchase CTA — this branch
             used to say "Contact support to set up billing", which made the
             Upgrade now button a dead end and left canceled customers with no
             way to come back. */
          <div className="py-4 text-center">
            <p className="text-sm text-content-secondary">
              {canManage
                ? "This community doesn't have an active subscription yet."
                : 'No subscription plan found for this community.'}
            </p>
            {canManage && (
              <>
                <p className="mt-1 text-sm text-content-secondary">
                  Pick a plan to unlock the full platform for {communityName}.
                </p>
                <Link
                  href={changePlanUrl}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-[10px] bg-interactive px-4 py-2 text-sm font-medium text-content-inverse transition-opacity hover:opacity-90"
                >
                  Choose a plan
                  <ArrowUpRight size={14} aria-hidden="true" />
                </Link>
              </>
            )}
          </div>
        )}
      </div>

      {/* Quick Links — only for the root manager, with Stripe connected */}
      {hasStripe && canManage && (
        <div className="rounded-[10px] border border-edge bg-surface-card p-5">
          <h2 className="mb-4 text-base font-semibold">Billing Actions</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <QuickLink
              onClick={openPortal}
              disabled={portalPending}
              icon={FileText}
              label="View Invoices"
              description="See past invoices and receipts"
            />
            <QuickLink
              onClick={openPortal}
              disabled={portalPending}
              icon={CreditCard}
              label="Update Payment Method"
              description="Change your card or bank account"
            />
            <QuickLink
              onClick={openPortal}
              disabled={portalPending}
              icon={XCircle}
              label="Cancel Subscription"
              description="Cancel with a 30-day grace period"
            />
          </div>
        </div>
      )}

      {/* Read-only notice — everyone who can see billing but not act on it.
          Deliberately NOT gated on `hasStripe`: a community with no Stripe
          customer is exactly the case where someone needs to be told who can
          set billing up. Gating on it left a page with no actions and no
          explanation — the worst of both. */}
      {!canManage && (
        <BillingReadOnlyNotice
          communityId={communityId}
          canView={canView}
          bounced={bouncedFromRootGate}
        />
      )}
      <ReauthModal isOpen={reauthOpen} onCancel={reauthCancel} verify={reauthVerify} />
    </div>
  );
}

// ── Quick Link sub-component ──

function QuickLink({
  onClick,
  disabled,
  icon: Icon,
  label,
  description,
}: {
  onClick: () => void;
  disabled?: boolean;
  icon: React.ElementType;
  label: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-start gap-3 rounded-[10px] border border-edge p-4 text-left transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Icon size={18} className="mt-0.5 shrink-0 text-content-secondary" aria-hidden="true" />
      <div>
        <p className="text-sm font-medium text-content">{label}</p>
        <p className="mt-0.5 text-xs text-content-secondary">{description}</p>
      </div>
    </button>
  );
}
