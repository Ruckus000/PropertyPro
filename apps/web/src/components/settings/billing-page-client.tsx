'use client';

import React from 'react';
import {
  CreditCard,
  ExternalLink,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Plan display mapping (matches signup-schema.ts definitions) ──

const PLAN_DISPLAY: Record<string, { name: string; price: string }> = {
  compliance_basic: { name: 'Compliance Basic', price: '$99/mo' },
  compliance_plus_mobile: { name: 'Compliance + Mobile', price: '$199/mo' },
  full_platform: { name: 'Full Platform', price: '$349/mo' },
  apartment_operations: { name: 'Apartment Operations', price: '$499/mo' },
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

const NEUTRAL_CLASSES = { text: 'text-content-secondary', bg: 'bg-surface-secondary', border: 'border-edge' } as const;

const VARIANT_CLASSES: Record<string, { text: string; bg: string; border: string }> = {
  success: { text: 'text-status-success', bg: 'bg-status-success-subtle', border: 'border-status-success-border' },
  warning: { text: 'text-status-warning', bg: 'bg-status-warning-subtle', border: 'border-status-warning-border' },
  danger: { text: 'text-status-danger', bg: 'bg-status-danger-subtle', border: 'border-status-danger-border' },
  info: { text: 'text-status-info', bg: 'bg-status-info-subtle', border: 'border-status-info-border' },
  neutral: { text: 'text-content-secondary', bg: 'bg-surface-secondary', border: 'border-edge' },
};

// ── Props ──

interface BillingPageClientProps {
  communityId: number;
  communityName: string;
  subscriptionPlan: string | null;
  subscriptionStatus: string | null;
  stripeCustomerId: string | null;
  paymentFailedAt: string | null;
  isAdmin: boolean;
}

// ── Component ──

export function BillingPageClient({
  communityId,
  communityName,
  subscriptionPlan,
  subscriptionStatus,
  stripeCustomerId,
  paymentFailedAt,
  isAdmin,
}: BillingPageClientProps) {
  const plan = subscriptionPlan ? PLAN_DISPLAY[subscriptionPlan] : null;
  const status = getStatusDisplay(subscriptionStatus);
  const StatusIcon = status.icon;
  const variantClasses = VARIANT_CLASSES[status.variant] ?? NEUTRAL_CLASSES;

  const portalUrl = `/billing/portal?communityId=${communityId}`;
  const hasStripe = !!stripeCustomerId;

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
            {hasStripe && isAdmin && (
              <a
                href={portalUrl}
                className="mt-3 inline-flex items-center gap-1.5 rounded-[10px] bg-status-danger px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
              >
                Update Payment Method
                <ExternalLink size={14} aria-hidden="true" />
              </a>
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
                <p className="text-sm text-content-secondary">{plan.price}</p>
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

            {hasStripe && isAdmin && (
              <a
                href={portalUrl}
                className="inline-flex items-center gap-1.5 rounded-[10px] border border-edge bg-surface-card px-4 py-2 text-sm font-medium text-content-primary transition-colors hover:bg-surface-secondary"
              >
                Manage Subscription
                <ExternalLink size={14} aria-hidden="true" />
              </a>
            )}
          </div>
        ) : (
          <div className="py-4 text-center">
            <p className="text-sm text-content-secondary">
              No subscription plan found for this community.
            </p>
            {isAdmin && (
              <p className="mt-1 text-sm text-content-secondary">
                Contact support to set up billing.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Quick Links — only for admins with Stripe connected */}
      {hasStripe && isAdmin && (
        <div className="rounded-[10px] border border-edge bg-surface-card p-5">
          <h2 className="mb-4 text-base font-semibold">Billing Actions</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <QuickLink
              href={portalUrl}
              icon={FileText}
              label="View Invoices"
              description="See past invoices and receipts"
            />
            <QuickLink
              href={portalUrl}
              icon={CreditCard}
              label="Update Payment Method"
              description="Change your card or bank account"
            />
            <QuickLink
              href={portalUrl}
              icon={XCircle}
              label="Cancel Subscription"
              description="Cancel with a 30-day grace period"
            />
          </div>
        </div>
      )}

      {/* Non-admin notice */}
      {!isAdmin && hasStripe && (
        <div className="rounded-[10px] border border-edge bg-surface-secondary p-4">
          <p className="text-sm text-content-secondary">
            Contact your community administrator to make changes to the billing plan.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Quick Link sub-component ──

function QuickLink({
  href,
  icon: Icon,
  label,
  description,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  description: string;
}) {
  return (
    <a
      href={href}
      className="flex items-start gap-3 rounded-[10px] border border-edge p-4 transition-colors hover:bg-surface-secondary"
    >
      <Icon size={18} className="mt-0.5 shrink-0 text-content-secondary" aria-hidden="true" />
      <div>
        <p className="text-sm font-medium text-content-primary">{label}</p>
        <p className="mt-0.5 text-xs text-content-secondary">{description}</p>
      </div>
    </a>
  );
}
