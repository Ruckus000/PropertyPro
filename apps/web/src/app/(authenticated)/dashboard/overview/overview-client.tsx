'use client';

import { PropertyCards } from '@/components/overview/property-cards';
import { ActivityFeed } from '@/components/overview/activity-feed';
import { UpcomingEvents } from '@/components/overview/upcoming-events';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertBanner } from '@/components/shared/alert-banner';
import { PageHeader } from '@/components/shared/page-header';
import { useOverview } from '@/hooks/use-overview';

export function OverviewClient() {
  const { data, isLoading, error } = useOverview();

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <PageHeader title="Overview" />
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
      <PageHeader title="Overview" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="space-y-4" aria-labelledby="properties-heading">
          <h2 id="properties-heading" className="text-lg font-semibold">
            My Properties
          </h2>
          <PropertyCards cards={data.cards} />
        </section>
        <div className="space-y-6">
          <ActivityFeed items={data.activity} />
          <UpcomingEvents events={data.events} />
        </div>
      </div>
    </div>
  );
}
