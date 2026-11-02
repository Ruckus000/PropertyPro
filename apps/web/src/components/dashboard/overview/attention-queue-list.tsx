import Link from 'next/link';
import { AlertBanner } from '@/components/shared/alert-banner';
import { EmptyState } from '@/components/shared/empty-state';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { countByTier, type AttentionItem } from '@/lib/dashboard/attention-queue';

const MAX_ROWS = 6;

type Tier = AttentionItem['tier'];

const TIER_STATUS: Record<Tier, string> = { critical: 'overdue', urgent: 'due_soon', aware: 'brand' };
const TIER_ROW_LABEL: Record<Tier, string> = { critical: 'Overdue', urgent: 'Due this week', aware: 'Coming up' };
const TIER_CHIP_SUFFIX: Record<Tier, string> = { critical: 'overdue', urgent: 'due this week', aware: 'coming up' };
const TIERS: Tier[] = ['critical', 'urgent', 'aware'];

interface AttentionQueueListProps {
  /** Null: the viewer has no queue (residents). */
  items: AttentionItem[] | null;
  communityId: number;
  error: boolean;
}

export function AttentionQueueList({ items, communityId, error }: AttentionQueueListProps) {
  if (items === null && !error) return null;

  const complianceHref = `/communities/${communityId}/compliance`;
  const counts = items ? countByTier(items) : null;

  return (
    <section aria-labelledby="needs-attention-heading" className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 id="needs-attention-heading" className="text-lg font-semibold text-content">
          Needs attention
        </h3>
        {counts
          ? TIERS.filter((tier) => counts[tier] > 0).map((tier) => (
              <StatusBadge
                key={tier}
                status={TIER_STATUS[tier]}
                label={`${counts[tier]} ${TIER_CHIP_SUFFIX[tier]}`}
                subtle
              />
            ))
          : null}
      </div>

      {error ? (
        <AlertBanner status="danger" title="We couldn't load your to-do list. Please refresh the page." />
      ) : items && items.length === 0 ? (
        <EmptyState preset="action_required_clear" size="sm" />
      ) : items ? (
        <>
          <ul className="divide-y divide-edge rounded-md border border-edge bg-surface-card">
            {items.slice(0, MAX_ROWS).map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0 space-y-1">
                  <StatusBadge status={TIER_STATUS[item.tier]} label={TIER_ROW_LABEL[item.tier]} size="sm" subtle />
                  <p className="text-base font-medium text-content">{item.title}</p>
                  <p className="text-sm text-content-secondary">{item.detail}</p>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href={item.action.href}>{item.action.label}</Link>
                </Button>
              </li>
            ))}
          </ul>
          {items.length > MAX_ROWS ? (
            <Link href={complianceHref} className="text-sm font-medium text-content-link hover:underline">
              View all {items.length} in Compliance
            </Link>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
