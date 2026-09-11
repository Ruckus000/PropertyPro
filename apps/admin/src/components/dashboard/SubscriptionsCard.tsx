/**
 * SubscriptionsCard — a stacked-bar breakdown of `billing` status counts,
 * with each row linking to the matching Billing filter.
 */
import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { PlatformDashboardStats } from '@/lib/server/dashboard';

interface SubscriptionsCardProps {
  billing: PlatformDashboardStats['billing'];
}

type BillingKey = keyof PlatformDashboardStats['billing'];

interface StatusRow {
  /**
   * Doubles as the Billing filter value in the row's href — there used to be a
   * separate `status` field holding a byte-identical copy in all five rows, i.e.
   * two places to change one fact.
   */
  key: BillingKey;
  label: string;
  barClass: string;
  textClass: string;
}

/** Written out per status in full — a computed `bg-status-${status}` class name is invisible to the class-resolution guard's static scan. */
const STATUS_ROWS: StatusRow[] = [
  { key: 'active', label: 'Active', barClass: 'bg-status-success', textClass: 'text-status-success' },
  { key: 'trialing', label: 'Trialing', barClass: 'bg-status-info', textClass: 'text-status-info' },
  { key: 'past_due', label: 'Past due', barClass: 'bg-status-warning', textClass: 'text-status-warning' },
  { key: 'canceled', label: 'Canceled', barClass: 'bg-status-neutral', textClass: 'text-status-neutral' },
  { key: 'none', label: 'No subscription', barClass: 'bg-surface-muted', textClass: 'text-content-tertiary' },
];

export function SubscriptionsCard({ billing }: SubscriptionsCardProps) {
  const rows = STATUS_ROWS.filter((row) => billing[row.key] > 0);
  const total = rows.reduce((sum, row) => sum + billing[row.key], 0);

  return (
    <div className="rounded-lg border border-edge bg-surface-card p-5 shadow-e1">
      <h2 className="mb-4 text-sm font-semibold text-content-secondary">Subscriptions</h2>

      {total > 0 && (
        <div
          role="img"
          aria-label="Subscription status breakdown"
          className="mb-4 flex h-2 w-full overflow-hidden rounded-full bg-surface-muted"
        >
          {rows.map((row) => (
            <div key={row.key} className={row.barClass} style={{ width: `${(billing[row.key] / total) * 100}%` }} />
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-content-disabled">No subscriptions yet.</p>
      ) : (
        <ul role="list" className="divide-y divide-edge">
          {rows.map((row) => (
            <li key={row.key}>
              <Link
                href={`/billing?status=${row.key}`}
                className="flex min-h-[44px] items-center justify-between py-2 hover:bg-surface-hover md:min-h-[36px]"
              >
                <span className="flex items-center gap-2 text-sm text-content-secondary">
                  <span aria-hidden="true" className={cn('size-2 rounded-full', row.barClass)} />
                  {row.label}
                </span>
                <span className={cn('text-sm font-semibold', row.textClass)}>{billing[row.key]}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
