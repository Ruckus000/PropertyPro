/**
 * Insurance hub page (Wave 1).
 *
 * Route: /communities/[id]/insurance
 * Auth: any community member. READ IS DELIBERATELY OPEN — the entire point of
 *       the wind-mitigation locker is that unit owners retrieve the building's
 *       report for their own insurer. Management controls are additive for
 *       admin-tier roles (see `canManage`).
 * Feature gate: hasInsuranceHub (condo/HOA only).
 *
 * The `[id]` path segment is the authoritative tenant id for this route, so
 * breadcrumb hrefs must NOT append `?communityId=` (.claude/rules/design.md).
 */
import { redirect } from 'next/navigation';
import { isAdminRole } from '@propertypro/shared';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { getEffectiveFeaturesForPage } from '@/lib/middleware/plan-guard';
import { Breadcrumbs } from '@/components/shared/breadcrumbs';
import { PageHeader } from '@/components/shared/page-header';
import { InsuranceSummarySection } from '@/components/insurance/insurance-summary-section';
import { WindMitigationSection } from '@/components/insurance/wind-mitigation-section';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function InsurancePage({ params }: PageProps) {
  const { id } = await params;
  const communityId = Number(id);

  if (!Number.isInteger(communityId) || communityId <= 0) {
    redirect('/dashboard?reason=invalid-selection');
  }

  let userId: string;
  try {
    userId = await requireAuthenticatedUserId();
  } catch {
    redirect('/auth/login');
  }

  const membership = await requireCommunityMembership(communityId, userId);

  const features = await getEffectiveFeaturesForPage(communityId, membership.communityType);
  if (!features.hasInsuranceHub) {
    redirect('/dashboard?reason=feature-not-available');
  }

  return (
    <>
      <PageHeader
        breadcrumb={<Breadcrumbs currentLabel="Insurance" />}
        title="Insurance"
        description="Your association's master-policy summary and wind-mitigation reports. These are records for your reference — the insurer's policy and agent-issued documents control, and nothing here says whether coverage is adequate."
      />

      <div className="mt-8 space-y-12">
        <InsuranceSummarySection
          communityId={communityId}
          canManage={isAdminRole(membership.role)}
        />
        <WindMitigationSection
          communityId={communityId}
          communityName={membership.communityName}
          canManage={isAdminRole(membership.role)}
        />
      </div>
    </>
  );
}
