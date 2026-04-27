/**
 * Violation Report Page — Phase 1C
 *
 * Route: /violations/report?communityId=X
 * Auth: any community member with violations:write permission
 * Feature gate: hasViolations must be enabled for the community type
 *
 * UX by role:
 *  - Resident w/ unit association → self-report form auto-scoped to their unit(s)
 *  - Resident w/o unit association → guard state, no form
 *  - Staff (manager / pm_admin) → file-on-behalf form with scoped unit picker
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { getFeaturesForCommunity } from '@propertypro/shared';
import { createScopedClient } from '@propertypro/db';
import { getActorUnitIds, isResidentRole } from '@/lib/violations/common';
import { resolveReportMode } from '@/lib/violations/report-mode';
import { hydrateReportedByRole } from '@/lib/violations/hydrate-reporter-role';
import { listViolationsForCommunity } from '@/lib/services/violations-service';
import { ViolationReportForm } from '@/components/violations/ViolationReportForm';
import { StaffViolationReportForm } from '@/components/violations/StaffViolationReportForm';
import { ViolationCard } from '@/components/violations/ViolationCard';
import { FeatureGate } from '@/components/billing/feature-gate';

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

  const typeFeatures = getFeaturesForCommunity(membership.communityType);
  if (!typeFeatures.hasViolations) {
    redirect('/dashboard?reason=feature-unavailable');
  }

  const isResident = isResidentRole(membership.role);
  const scoped = createScopedClient(communityId);
  const residentUnitIds = isResident ? await getActorUnitIds(scoped, userId) : [];
  const mode = resolveReportMode(membership.role, residentUnitIds);

  const ownViolations =
    mode === 'resident'
      ? await hydrateReportedByRole(
          scoped,
          await listViolationsForCommunity(communityId, { allowedUnitIds: residentUnitIds }),
        )
      : [];

  return (
    <FeatureGate feature="hasViolations" communityId={communityId}>
    <div className="mx-auto max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-content">Report a Violation</h1>
        <p className="mt-1 text-sm text-content-secondary">
          Report a community concern such as noise, parking, or property violations.
        </p>
      </div>

      {mode === 'resident' && (
        <ViolationReportForm
          communityId={communityId}
          userId={userId}
          defaultUnitId={residentUnitIds[0] ?? null}
          unitIds={residentUnitIds}
        />
      )}

      {mode === 'resident_no_unit' && (
        <div
          role="status"
          className="rounded-xl border border-edge bg-surface-card p-8 text-center"
        >
          <h2 className="text-lg font-medium text-content">You're not linked to a unit yet</h2>
          <p className="mt-2 text-sm text-content-secondary">
            Contact your community manager to be assigned to a unit, then return here to file a
            report.
          </p>
          <Link
            href={`/dashboard?communityId=${communityId}`}
            className="mt-5 inline-flex items-center rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse hover:bg-interactive-hover"
          >
            Back to dashboard
          </Link>
        </div>
      )}

      {mode === 'staff' && (
        <>
          <div
            role="status"
            className="mb-4 rounded-md border border-edge bg-interactive-subtle px-4 py-3 text-sm text-content-link"
          >
            Filing on behalf of a resident. Your name will be recorded as the reporter.
          </div>
          <StaffViolationReportForm communityId={communityId} />
        </>
      )}

      {ownViolations.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 text-lg font-medium text-content">Your Reports</h2>
          <div className="space-y-3">
            {ownViolations.map((v) => (
              <ViolationCard key={v.id} violation={v} communityId={communityId} />
            ))}
          </div>
        </section>
      )}
    </div>
    </FeatureGate>
  );
}
