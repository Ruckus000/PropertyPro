'use client';

import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/status-badge';
import type { CommunityCard } from '@/lib/queries/cross-community.types';
import { buildCommunityDashboardUrl } from '@/lib/utils/community-url';

function scoreStatus(score: number): 'compliant' | 'pending' | 'overdue' {
  if (score >= 90) return 'compliant';
  if (score >= 70) return 'pending';
  return 'overdue';
}

export function PropertyCards({ cards }: { cards: CommunityCard[] }) {
  if (cards.length === 0) {
    return (
      <div className="rounded-md border border-default bg-surface-card p-6">
        <p className="text-sm text-secondary">
          You don&rsquo;t belong to any communities yet.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {cards.map((card) => (
        <li
          key={card.communityId}
          className="rounded-md border border-default bg-surface-card p-5"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold truncate">
                {card.communityName}
              </h3>
              <p className="mt-1 text-xs text-secondary uppercase tracking-wide">
                {card.communityType === 'condo_718'
                  ? 'Condo (§718)'
                  : card.communityType === 'hoa_720'
                    ? 'HOA (§720)'
                    : 'Apartment'}
              </p>
            </div>
            {card.complianceScore != null && (
              <StatusBadge
                status={scoreStatus(card.complianceScore)}
                label={`${card.complianceScore}% compliant`}
                size="sm"
              />
            )}
          </div>
          {(card.urgentItemCount > 0 || card.criticalItemCount > 0) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {card.criticalItemCount > 0 && (
                <StatusBadge
                  status="overdue"
                  label={`${card.criticalItemCount} critical`}
                  size="sm"
                />
              )}
              {card.urgentItemCount > 0 && (
                <StatusBadge
                  status="pending"
                  label={`${card.urgentItemCount} urgent`}
                  size="sm"
                />
              )}
            </div>
          )}
          <div className="mt-4">
            <Button asChild variant="outline" size="sm">
              {/* Cross-subdomain navigation: use a standard <a> for a clean
                  full-page transition. next/link's client-side router is
                  tuned for same-origin routing. */}
              <a href={buildCommunityDashboardUrl(card.communitySlug)}>
                Go to Dashboard
              </a>
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
