'use client';

/**
 * The subscription portfolio table on `/billing`.
 *
 * ## Filtering is client-side, on purpose
 *
 * `getBillingOverview()` caches one unfiltered Stripe read for five minutes and
 * `filterBillingRows` is a JS predicate over it, so every tab is a view of the
 * same snapshot. A server round-trip per tab would make the per-tab counts lag
 * the click and give each tab its own staleness. The KPIs above stay computed
 * over the UNFILTERED portfolio for the same reason the route does it that way:
 * an MRR headline that changed when you clicked "Past due" would be a different
 * number presented as the same one.
 *
 * ## Orphans are the point of this screen
 *
 * A row with `communityId === null` is a live Stripe subscription that no
 * `communities` row claims — a customer still being charged for a community
 * that was deleted, renamed away or never linked. It cannot link into the
 * console (there is nothing to link to), so it links into Stripe instead, and
 * it is never hidden by a filter tab.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CreditCard, ExternalLink } from 'lucide-react';
import { AlertBanner, Badge, EmptyState, QuickFilterTabs, type BadgeVariant } from '@propertypro/ui';
import type { BillingRow } from '@/lib/server/billing';
import { formatCentsAsCurrency } from '@/lib/billing/format';

interface BillingListProps {
  rows: BillingRow[];
  /** Stripe reported more subscriptions than the portfolio's page bound. */
  truncated: boolean;
  /**
   * `https://dashboard.stripe.com/` or `…/test/` — chosen by the page from the
   * key's own mode, so an orphan link cannot point at the wrong namespace.
   */
  stripeDashboardBase: string;
}

type StatusFilter = 'all' | BillingRow['status'];

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'past_due', label: 'Past due' },
  { value: 'trialing', label: 'Trialing' },
  { value: 'canceled', label: 'Canceled' },
];

const STATUS_LABELS: Record<BillingRow['status'], string> = {
  active: 'Active',
  trialing: 'Trial',
  past_due: 'Past due',
  canceled: 'Canceled',
  other: 'Other',
};

const STATUS_VARIANTS: Record<BillingRow['status'], BadgeVariant> = {
  active: 'success',
  trialing: 'info',
  past_due: 'warning',
  canceled: 'neutral',
  other: 'neutral',
};

const PLAN_LABELS: Record<string, string> = {
  essentials: 'Essentials',
  professional: 'Professional',
  operations_plus: 'Operations Plus',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '—';
  return new Date(ms).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function BillingList({ rows, truncated, stripeDashboardBase }: BillingListProps) {
  const [filter, setFilter] = useState<StatusFilter>('all');

  const counts = useMemo(
    () => ({
      all: rows.length,
      active: rows.filter((row) => row.status === 'active').length,
      trialing: rows.filter((row) => row.status === 'trialing').length,
      past_due: rows.filter((row) => row.status === 'past_due').length,
      canceled: rows.filter((row) => row.status === 'canceled').length,
      other: rows.filter((row) => row.status === 'other').length,
    }),
    [rows],
  );

  const visible = useMemo(
    () => (filter === 'all' ? rows : rows.filter((row) => row.status === filter)),
    [rows, filter],
  );

  return (
    <div className="space-y-4">
      {truncated && (
        <AlertBanner
          status="warning"
          variant="subtle"
          title="This portfolio is truncated"
          description="Stripe reports more subscriptions than this page reads, so the table and every number above it are a partial view. Use the Stripe dashboard for a complete figure."
        />
      )}

      <QuickFilterTabs
        tabs={FILTERS.map((tab) => ({ ...tab, count: counts[tab.value] }))}
        active={filter}
        onChange={(value) => setFilter(value as StatusFilter)}
      />

      {visible.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title={rows.length === 0 ? 'No subscriptions yet' : 'Nothing in this filter'}
          description={
            rows.length === 0
              ? 'Stripe reports no subscriptions for this account. New communities appear here as soon as they check out.'
              : 'No subscription is in this state right now. Switch back to All to see the whole portfolio.'
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-edge">
          <table className="min-w-full divide-y divide-edge text-sm">
            <thead className="bg-surface-page">
              <tr>
                <Th>Community</Th>
                <Th>Plan</Th>
                <Th>Status</Th>
                <Th>MRR</Th>
                <Th>Renews</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge bg-surface-card">
              {visible.map((row) => (
                <tr key={row.stripeSubscriptionId}>
                  <td className="px-4 py-3">
                    {row.communityId === null ? (
                      <a
                        href={`${stripeDashboardBase}subscriptions/${row.stripeSubscriptionId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-content-brand hover:underline"
                      >
                        {row.communityName}
                        <ExternalLink size={12} aria-hidden="true" />
                      </a>
                    ) : (
                      <Link
                        href={`/clients/${row.communityId}?tab=billing`}
                        className="font-medium text-content-brand hover:underline"
                      >
                        {row.communityName}
                      </Link>
                    )}
                    {row.communityId === null && (
                      <p className="mt-0.5 text-xs text-status-warning">
                        No community record — still being charged.
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-content-secondary">
                    {PLAN_LABELS[row.plan] ?? row.plan}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANTS[row.status]} size="sm">
                      {STATUS_LABELS[row.status]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-content">{formatCentsAsCurrency(row.mrrCents)}</td>
                  <td className="px-4 py-3 text-content-secondary">
                    {row.status === 'past_due'
                      ? `Past due since ${formatDate(row.pastDueSince)}`
                      : row.status === 'trialing'
                        ? `Trial ends ${formatDate(row.trialEndsAt)}`
                        : formatDate(row.renewsAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      scope="col"
      className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-content-tertiary"
    >
      {children}
    </th>
  );
}
