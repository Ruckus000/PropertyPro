'use client';

/**
 * UpgradeForm — Client component for plan selection and checkout initiation.
 *
 * Shows plan cards and a checkout form. On submit, POSTs to the
 * self-service upgrade endpoint which returns a Stripe checkout URL.
 */

import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import type { CommunityType } from '@propertypro/shared';
import { useDemoSelfServiceUpgrade } from '@/hooks/use-demo-self-service-upgrade';

interface PlanOption {
  id: string;
  label: string;
  monthlyPriceUsd: number;
  description: string;
}

interface UpgradeFormProps {
  slug: string;
  communityName: string;
  communityType: CommunityType;
  plans: PlanOption[];
}

export function UpgradeForm({
  slug,
  communityName,
  communityType,
  plans,
}: UpgradeFormProps) {
  const [selectedPlan, setSelectedPlan] = useState<string | null>(
    plans.length === 1 ? (plans[0]?.id ?? null) : null,
  );
  const [email, setEmail] = useState('');
  const [customerName, setCustomerName] = useState(communityName);
  const [error, setError] = useState<string | null>(null);

  const upgrade = useDemoSelfServiceUpgrade();
  const isSubmitting = upgrade.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPlan || !email.trim()) return;

    setError(null);

    upgrade.mutate(
      {
        slug,
        planId: selectedPlan,
        customerEmail: email.trim(),
        customerName: customerName.trim(),
      },
      {
        onSuccess: ({ checkoutUrl }) => {
          if (checkoutUrl) {
            window.location.href = checkoutUrl;
          }
        },
        onError: (err) => {
          setError(
            err instanceof Error
              ? err.message
              : 'Something went wrong. Please try again.',
          );
        },
      },
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* Plan cards */}
      <div className={plans.length === 1 ? 'space-y-4' : 'grid gap-4 sm:grid-cols-2'}>
        {plans.map((plan) => {
          const isSelected = selectedPlan === plan.id;
          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => setSelectedPlan(plan.id)}
              className={`relative w-full rounded-[10px] border-2 p-5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-primary)] focus-visible:ring-offset-2 ${
                isSelected
                  ? 'border-[var(--interactive-primary)] bg-[var(--surface-card)]'
                  : 'border-[var(--border-default)] bg-[var(--surface-card)] hover:border-[var(--border-strong)]'
              }`}
              aria-pressed={isSelected}
            >
              {isSelected && (
                <div className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--interactive-primary)]">
                  <Check size={12} className="text-white" aria-hidden="true" />
                </div>
              )}
              <div className="text-lg font-semibold text-[var(--text-primary)]">
                {plan.label}
              </div>
              <div className="mt-1 text-2xl font-bold text-[var(--text-primary)]">
                ${plan.monthlyPriceUsd}
                <span className="text-sm font-normal text-[var(--text-secondary)]">/mo</span>
              </div>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                {plan.description}
              </p>
            </button>
          );
        })}
      </div>

      {/* Checkout details — shown when plan is selected */}
      {selectedPlan && (
        <div className="mt-6 space-y-4 rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-card)] p-5">
          <div>
            <label
              htmlFor="customer-email"
              className="mb-1 block text-sm font-medium text-[var(--text-primary)]"
            >
              Email address <span className="text-[var(--status-danger)]">*</span>
            </label>
            <input
              id="customer-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="h-10 w-full rounded-[6px] border border-[var(--border-default)] bg-[var(--surface-card)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--interactive-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--interactive-primary)]/20"
            />
          </div>

          <div>
            <label
              htmlFor="customer-name"
              className="mb-1 block text-sm font-medium text-[var(--text-primary)]"
            >
              Organization name
            </label>
            <input
              id="customer-name"
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="h-10 w-full rounded-[6px] border border-[var(--border-default)] bg-[var(--surface-card)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--interactive-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--interactive-primary)]/20"
            />
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-[6px] border border-[var(--status-danger)]/20 bg-[var(--status-danger-bg)] px-3 py-2 text-sm text-[var(--status-danger)]"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !email.trim()}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-[10px] bg-[var(--interactive-primary)] text-sm font-semibold text-white transition-colors hover:bg-[var(--interactive-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-primary)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                Starting checkout…
              </>
            ) : (
              'Start Checkout'
            )}
          </button>
        </div>
      )}
    </form>
  );
}
