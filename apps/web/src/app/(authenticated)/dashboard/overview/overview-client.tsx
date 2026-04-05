'use client';

import { useQuery } from '@tanstack/react-query';
import { PropertyCards } from '@/components/overview/property-cards';
import { ActivityFeed } from '@/components/overview/activity-feed';
import { UpcomingEvents } from '@/components/overview/upcoming-events';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertBanner } from '@/components/shared/alert-banner';
import type { OverviewPayload } from '@/lib/queries/cross-community.types';

interface OverviewResponse {
  data: OverviewPayload;
}

export function OverviewClient() {
  const { data, isLoading, error } = useQuery<OverviewResponse>({
    queryKey: ['overview'],
    queryFn: async () => {
      const res = await fetch('/api/v1/overview');
      if (!res.ok) throw new Error('Failed to load overview');
      return res.json();
    },
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-semibold">Overview</h1>
          <p className="mt-1 text-sm text-secondary">Loading your properties&hellip;</p>
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <AlertBanner
          status="danger"
          title="We couldn't load your overview"
          description="Please refresh the page to try again."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="mt-1 text-sm text-secondary">
          All your communities at a glance.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="space-y-4" aria-labelledby="properties-heading">
          <h2 id="properties-heading" className="text-lg font-semibold">
            My Properties
          </h2>
          <PropertyCards cards={data.data.cards} />
        </section>
        <div className="space-y-6">
          <ActivityFeed items={data.data.activity} />
          <UpcomingEvents events={data.data.events} />
        </div>
      </div>
    </div>
  );
}
