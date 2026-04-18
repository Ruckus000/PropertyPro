/**
 * PackagesUnavailableState — guard state shown when a community/plan
 * cannot access package logging.
 *
 * Replaces the prior silent `redirect('/dashboard?reason=feature-unavailable')`
 * so a user who lands on /dashboard/packages via a deep link, search result,
 * or stale bookmark gets an explanation rather than being bounced.
 *
 * Server component: no client-side state, no hooks.
 * Reuses existing design-system primitives (AlertBanner, Button) — no new UI.
 */
import Link from 'next/link';
import { AlertBanner } from '@/components/shared/alert-banner';
import { Button } from '@/components/ui/button';

export type PackagesUnavailableReason = 'community_type' | 'plan';

interface PackagesUnavailableStateProps {
  communityId: number;
  reason: PackagesUnavailableReason;
}

const COPY: Record<
  PackagesUnavailableReason,
  { title: string; description: string }
> = {
  community_type: {
    title: "Package logging isn't included for this community",
    description:
      'Package tracking is available for condo and apartment communities. HOA communities don\u2019t currently include this feature.',
  },
  plan: {
    title: "Package logging isn't included in your plan",
    description:
      'Package tracking isn\u2019t part of your current subscription plan. Contact your property manager to upgrade.',
  },
};

export function PackagesUnavailableState({
  communityId,
  reason,
}: PackagesUnavailableStateProps) {
  const { title, description } = COPY[reason];

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-content">Packages</h1>
        <p className="mt-1 text-sm text-content-secondary">
          Track incoming packages and pickups for residents.
        </p>
      </div>

      <AlertBanner
        status="info"
        variant="subtle"
        title={title}
        description={description}
        action={
          <Button asChild variant="outline" size="sm">
            <Link href={`/dashboard?communityId=${communityId}`}>
              Back to dashboard
            </Link>
          </Button>
        }
      />
    </>
  );
}
