/**
 * Violation Report Page — Phase 1C
 *
 * Route: /violations/report?communityId=X
 * Auth: any community member (all roles can report violations for their own unit)
 * Feature gate: hasViolations must be enabled for the community type
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { getFeaturesForCommunity } from '@propertypro/shared';
import { createScopedClient } from '@propertypro/db';
import { getActorUnitIds } from '@/lib/violations/common';
import { listViolationsForCommunity } from '@/lib/services/violations-service';
import { ViolationReportForm } from '@/components/violations/ViolationReportForm';
import { ViolationCard } from '@/components/violations/ViolationCard';

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function ViolationReportPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const rawId = Number(params['communityId']);

  if (!Number.isInteger(rawId) || rawId <= 0) {
    redirect('/dashboard?reason=invalid-selection');
  }

  const communityId = rawId;
  let userId: string;

  try {
    userId = await requireAuthenticatedUserId();
  } catch {
    redirect('/auth/login');
  }

  const membership = await requireCommunityMembership(communityId, userId);

  // Feature gate — redirect if violations are not enabled for this community type
  const features = getFeaturesForCommunity(membership.communityType);
  if (!features.hasViolations) {
    redirect('/dashboard?reason=feature-unavailable');
  }

  // Resolve actor's unit IDs for auto-populating the form
  const scoped = createScopedClient(communityId);
  const unitIds = await getActorUnitIds(scoped, userId);
  const defaultUnitId = unitIds[0] ?? null;

  // Fetch the user's own reported violations for initial render
  // Scope to actor's unit(s) so they only see their own violations
  const ownViolations = await listViolationsForCommunity(communityId, {
    allowedUnitIds: unitIds.length > 0 ? unitIds : undefined,
  });

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-content">Report a Violation</h1>
        <p className="mt-1 text-sm text-content-secondary">
          Report a community concern such as noise, parking, or property violations.
        </p>
      </div>

      <ViolationReportForm
        communityId={communityId}
        userId={userId}
        defaultUnitId={defaultUnitId}
        unitIds={unitIds}
      />

      {ownViolations.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 text-lg font-medium text-content">Your Reports</h2>
          <div className="space-y-3">
            {ownViolations.map((v) => (
              <ViolationCard
                key={v.id}
                violation={v}
                communityId={communityId}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
