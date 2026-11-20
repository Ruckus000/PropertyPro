/**
 * Violation Report Page — Phase 1C
 *
 * Route: /violations/report?communityId=X
 * Auth: any community member with violations:write permission
 * Feature gate: hasViolations must be enabled for the community type
 *
 * UX by role:
 *  - Resident w/ unit association → report form with a unit picker (any unit:
 *    neighbour complaints belong on the neighbour's unit, D1), then two lists:
 *    "On your unit" — cases on the resident's own units, minus a neighbour's
 *    report still awaiting review (D1a) — and "Your reports", what they filed,
 *    linked only where the unit is their own. Reporters are named only to the
 *    filer (D1b).
 *  - Resident w/o unit association → guard state, no form
 *  - Staff (property_manager / root_manager) → file-on-behalf form with scoped unit picker
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { getFeaturesForCommunity } from '@propertypro/shared';
import { createScopedClient } from '@propertypro/db';
import {
  getActorUnitIds,
  isResidentRole,
  residentVisibleViolationsWhere,
} from '@/lib/violations/common';
import { resolveReportMode } from '@/lib/violations/report-mode';
import { hydrateReportedByRole } from '@/lib/violations/hydrate-reporter-role';
import { listViolationsForCommunity } from '@/lib/services/violations-service';
import { withUnitLabels } from '@/lib/units/unit-labels';
import { ViolationReportForm } from '@/components/violations/ViolationReportForm';
import { StaffViolationReportForm } from '@/components/violations/StaffViolationReportForm';
import { ViolationCard } from '@/components/violations/ViolationCard';
import { FeatureGate } from '@/components/billing/feature-gate';
import { PageHeader } from '@/components/shared/page-header';

/**
 * Only what the card renders crosses to the client. A "Your reports" row can be
 * a neighbour's case, and the full row carries its hearing details and
 * resolution notes, which are that household's business, not the reporter's.
 */
function toCardFields(v: {
  id: number;
  unitId: number;
  category: string;
  description: string;
  status: string;
  severity: string;
  createdAt: unknown;
  reportedByRole: 'staff' | 'resident' | null;
  unitLabel: string;
}) {
  return {
    id: v.id,
    unitId: v.unitId,
    category: v.category,
    description: v.description,
    status: v.status,
    severity: v.severity,
    createdAt: v.createdAt as string | Date,
    reportedByRole: v.reportedByRole,
    unitLabel: v.unitLabel,
  };
}

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

  const viewer = { membership, userId };
  const [onYourUnit, yourReports] =
    mode === 'resident'
      ? await Promise.all([
          listViolationsForCommunity(communityId, {
            allowedUnitIds: residentUnitIds,
            visibleWhere: residentVisibleViolationsWhere(membership, userId),
          }).then(async (rows) =>
            (await hydrateReportedByRole(scoped, await withUnitLabels(scoped, rows), viewer)).map(
              toCardFields,
            ),
          ),
          listViolationsForCommunity(communityId, { reportedByUserId: userId }).then(
            async (rows) =>
              (await hydrateReportedByRole(scoped, await withUnitLabels(scoped, rows), viewer)).map(
                toCardFields,
              ),
          ),
        ])
      : [[], []];

  return (
    <FeatureGate feature="hasViolations" communityId={communityId}>
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Report a Violation" />

      {mode === 'resident' && (
        <ViolationReportForm communityId={communityId} ownUnitIds={residentUnitIds} />
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

      {onYourUnit.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 text-lg font-medium text-content">On your unit</h2>
          <div className="space-y-3">
            {onYourUnit.map((v) => (
              <ViolationCard key={v.id} violation={v} communityId={communityId} />
            ))}
          </div>
        </section>
      )}

      {yourReports.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-1 text-lg font-medium text-content">Your reports</h2>
          <p className="mb-4 text-sm text-content-secondary">
            Reports you filed. A report about another home opens only for that household and the
            board.
          </p>
          <div className="space-y-3">
            {yourReports.map((v) => (
              <ViolationCard
                key={v.id}
                violation={v}
                communityId={communityId}
                linkable={residentUnitIds.includes(v.unitId)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
    </FeatureGate>
  );
}
