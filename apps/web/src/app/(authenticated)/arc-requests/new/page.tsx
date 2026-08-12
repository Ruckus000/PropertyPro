/**
 * Submit an ARC application. Residents only.
 *
 * Mirrors `/violations/report`, the sibling resident-submit flow, including its
 * handling of a resident with no unit association: the form needs a unit the
 * submitter actually holds, and `createArcSubmissionForCommunity` rejects any
 * other, so a resident with none is told plainly rather than shown a form that
 * cannot succeed.
 *
 * Reviewers are sent back to the queue instead of seeing this form. Submitting
 * on a resident's behalf is not a thing the API supports — `requireArcSubmitterRole`
 * demands `role === 'resident'` — so offering the form to a manager would only
 * produce a 403 after they had filled it in.
 */
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { getFeaturesForCommunity } from '@propertypro/shared';
import { createScopedClient } from '@propertypro/db';
import { getActorUnitIds, isResidentRole } from '@/lib/violations/common';
import { FeatureGate } from '@/components/billing/feature-gate';
import { ArcSubmissionForm } from '@/components/violations/ArcSubmissionForm';
import { PageHeader } from '@/components/shared/page-header';

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function NewArcRequestPage({ searchParams }: PageProps) {
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
  if (!typeFeatures.hasARC) {
    redirect('/dashboard?reason=feature-unavailable');
  }

  if (!isResidentRole(membership.role)) {
    redirect(`/arc-requests?communityId=${communityId}`);
  }

  const scoped = createScopedClient(communityId);
  const unitIds = await getActorUnitIds(scoped, userId);

  return (
    <FeatureGate feature="hasARC" communityId={communityId}>
      <PageHeader
        title="New ARC Request"
        description="Submit exterior changes for architectural review before work begins."
      />

      {unitIds.length === 0 ? (
        <div className="rounded-md border border-edge bg-surface-card p-6">
          <h2 className="text-sm font-semibold text-content">
            Your account isn&apos;t linked to a unit yet
          </h2>
          <p className="mt-2 text-sm text-content-secondary">
            An architectural request has to be attached to a specific home, and your
            account isn&apos;t associated with one. Ask your property manager to link
            your unit, then come back — nothing you enter here would be lost, because
            the request cannot be created without it.
          </p>
          <Link
            href={`/arc-requests?communityId=${communityId}`}
            className="mt-4 inline-block text-sm font-medium text-interactive hover:underline"
          >
            Back to ARC requests
          </Link>
        </div>
      ) : (
        <div className="max-w-2xl">
          <ArcSubmissionForm
            communityId={communityId}
            unitIds={unitIds}
            defaultUnitId={unitIds.length === 1 ? (unitIds[0] as number) : null}
          />
        </div>
      )}
    </FeatureGate>
  );
}
