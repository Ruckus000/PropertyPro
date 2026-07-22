/**
 * Wind-mitigation report detail page (Wave 1).
 *
 * Route: /communities/[id]/insurance/wind-mitigation/[reportId]
 * Auth: same as the insurance hub — READ IS DELIBERATELY OPEN to any community
 *       member (owners retrieve the building's report for their own insurer).
 *       Management controls inside the card are admin-gated (`canManage`).
 * Feature gate: hasInsuranceHub (condo/HOA only).
 *
 * The report is resolved server-side purely to render the page <h1> (which
 * becomes the breadcrumb leaf: Insurance › Wind Mitigation › <report>). The
 * card itself is rendered by the client component from the cached list query.
 *
 * The `[id]` path segment is the authoritative tenant id for this route.
 */
import { redirect } from 'next/navigation';
import { isAdminRole } from '@propertypro/shared';
import { createScopedClient } from '@propertypro/db';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { getEffectiveFeaturesForPage } from '@/lib/middleware/plan-guard';
import { getWindMitigationReportById } from '@/lib/services/wind-mitigation-service';
import { PageHeader } from '@/components/shared/page-header';
import { WindMitigationReportDetail } from '@/components/insurance/wind-mitigation-report-detail';
import {
  WIND_MITIGATION_FORM_LABELS,
  type WindMitigationFormType,
} from '@/components/insurance/types';

interface PageProps {
  params: Promise<{ id: string; reportId: string }>;
}

export default async function WindMitigationReportPage({ params }: PageProps) {
  const { id, reportId } = await params;
  const communityId = Number(id);
  const parsedReportId = Number(reportId);

  if (!Number.isInteger(communityId) || communityId <= 0) {
    redirect('/dashboard?reason=invalid-selection');
  }
  const hubHref = `/communities/${communityId}/insurance`;
  if (!Number.isInteger(parsedReportId) || parsedReportId <= 0) {
    redirect(hubHref);
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

  const scoped = createScopedClient(communityId);
  const report = await getWindMitigationReportById(scoped, parsedReportId);
  if (!report) {
    redirect(hubHref);
  }

  const formType = report.formType as WindMitigationFormType;
  const buildingLabel = (report.buildingLabel as string | null) ?? null;
  const reportName = `${WIND_MITIGATION_FORM_LABELS[formType] ?? 'Wind Mitigation Report'}${
    buildingLabel ? ` — ${buildingLabel}` : ''
  }`;

  return (
    <>
      <PageHeader
        title={reportName}
        description="Wind-mitigation inspection report — a record for your reference. The insurer's policy and agent-issued documents control."
      />

      <div className="mt-8 max-w-2xl">
        <WindMitigationReportDetail
          communityId={communityId}
          communityName={membership.communityName}
          canManage={isAdminRole(membership.role)}
          reportId={parsedReportId}
          hubHref={hubHref}
        />
      </div>
    </>
  );
}
