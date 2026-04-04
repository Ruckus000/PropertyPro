'use client';

import Link from 'next/link';
import { Building2, Plus, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/shared/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { PortfolioCommunity } from '@/hooks/use-portfolio-dashboard';

const TYPE_LABELS: Record<string, string> = {
  condo_718: 'Condo',
  hoa_720: 'HOA',
  apartment: 'Apartment',
};

function maintenanceStatusKey(count: number): string {
  if (count === 0) return 'compliant';
  if (count <= 5) return 'pending';
  return 'overdue';
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function CommunityCard({ community }: { community: PortfolioCommunity }) {
  const isApartment = community.communityType === 'apartment';
  return (
    <Link
      href={`/pm/dashboard/${community.communityId}`}
      aria-label={`Open dashboard for ${community.communityName}`}
      className={cn(
        'group block rounded-md border border-edge bg-surface-card p-5',
        'shadow-e0 transition-all duration-quick',
        'hover:border-edge-strong hover:shadow-e1',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-focus',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-base font-semibold text-content leading-tight">
            {community.communityName}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {TYPE_LABELS[community.communityType] ?? community.communityType}
            </Badge>
          </div>
        </div>
        <ArrowRight
          className="h-4 w-4 shrink-0 text-content-tertiary opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden="true"
        />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div>
          <dt className="text-content-tertiary">Units</dt>
          <dd className="mt-0.5 font-medium text-content">{community.totalUnits}</dd>
        </div>
        <div>
          <dt className="text-content-tertiary">
            {isApartment ? 'Occupancy' : 'Residents'}
          </dt>
          <dd className="mt-0.5 font-medium text-content">
            {isApartment
              ? community.occupancyRate != null
                ? `${community.occupancyRate}%`
                : '\u2014'
              : community.residentCount}
          </dd>
        </div>
        <div>
          <dt className="text-content-tertiary">Maintenance</dt>
          <dd className="mt-0.5">
            {community.openMaintenanceRequests > 0 ? (
              <StatusBadge
                status={maintenanceStatusKey(community.openMaintenanceRequests)}
                label={`${community.openMaintenanceRequests} open`}
                size="sm"
                subtle
              />
            ) : (
              <span className="font-medium text-content">0</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-content-tertiary">
            {isApartment ? 'Balance' : 'Compliance'}
          </dt>
          <dd className="mt-0.5 font-medium text-content">
            {isApartment
              ? formatCurrency(community.outstandingBalance)
              : community.complianceScore != null
                ? `${community.complianceScore}%`
                : '\u2014'}
          </dd>
        </div>
      </dl>
    </Link>
  );
}

function AddCommunityCard() {
  return (
    <Link
      href="/pm/dashboard/communities/new"
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-md',
        'border-2 border-dashed border-edge bg-transparent p-5',
        'min-h-[180px] transition-all duration-quick',
        'hover:border-interactive-primary hover:bg-surface-subtle',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-focus',
      )}
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-interactive-subtle">
        <Plus className="h-5 w-5 text-interactive-primary" aria-hidden="true" />
      </div>
      <span className="text-sm font-semibold text-interactive-primary">Add Community</span>
      <span className="text-xs text-content-secondary">Set up a new association</span>
    </Link>
  );
}

function CardSkeleton() {
  return (
    <div className="animate-pulse rounded-md border border-edge bg-surface-card p-5">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-5 w-16" />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyPortfolio() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted">
        <Building2 className="h-6 w-6 text-content-secondary" aria-hidden="true" />
      </div>
      <div>
        <h2 className="text-base font-semibold text-content">Add your first community</h2>
        <p className="mt-1 text-sm text-content-secondary">
          Set up a community to start managing documents, compliance, and residents.
        </p>
      </div>
      <Link
        href="/pm/dashboard/communities/new"
        className={cn(
          'inline-flex items-center gap-2 rounded-md px-4 py-2',
          'bg-interactive-primary text-sm font-semibold text-white',
          'hover:bg-interactive-primary-hover',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2',
        )}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add Community
      </Link>
    </div>
  );
}

interface CommunityCardGridProps {
  communities: PortfolioCommunity[];
  isLoading: boolean;
}

export function CommunityCardGrid({ communities, isLoading }: CommunityCardGridProps) {
  if (isLoading) {
    return (
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (communities.length === 0) {
    return <EmptyPortfolio />;
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      {communities.map((c) => (
        <CommunityCard key={c.communityId} community={c} />
      ))}
      {communities.length < 20 && <AddCommunityCard />}
    </div>
  );
}
