// page-template: delegated to apps/web/src/components/violations/violations-page.tsx
/**
 * Violations — admin review inbox and ARC requests (tabbed).
 *
 * Route: /violations?communityId=X
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { getFeaturesForCommunity, isAdminRole } from '@propertypro/shared';
import { createScopedClient } from '@propertypro/db';
import { canActAsBoard } from '@/lib/db/access-control';
import { ViolationsAdminInbox } from '@/components/violations/ViolationsAdminInbox';
import { FeatureGate } from '@/components/billing/feature-gate';
import { ViolationsPage } from '@/components/violations/violations-page';
import { isDesignPreviewOn } from '@/lib/design-preview';
import { describeAccess } from '@/lib/access/describe-access';
import { getActorUnitIds } from '@/lib/violations/common';
import { loadResidentViolationLists } from '@/lib/violations/resident-lists';
import { pickTab, violationsTabs } from '@/lib/violations/violations-view';

interface PageProps {
  searchParams: Promise<SearchParams>;
}

/**
 * Violations Admin Inbox
 *
 * Route: /violations?communityId=X
 * Auth: canActAsBoard — managers, and residents with a board seat, who already
 * hold the violation admin writes (requireViolationAdminWrite, ADR-006 §2a).
 * Creating a violation for any unit stays manager-only (the inbox's button).
 * Feature gate: hasViolations must be enabled for the community type
 */
function positiveInt(value: string | string[] | undefined): number | undefined {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

export default async function ViolationsRoute({ searchParams }: PageProps) {
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

  // ponytail: two views of this page while the pilot is judged. Trigger: the owner
  // approves or rejects the pilot (plan Task 19), or 30 days after the pilot merges.
  const preview = await isDesignPreviewOn(userId);

  // Gate off: the board rule runs before the type gate, as it always did.
  if (!preview && !canActAsBoard(membership)) {
    redirect('/dashboard?reason=insufficient-permissions');
  }

  // Type-gate: if the community type doesn't support violations, redirect.
  // Plan-gate is delegated to <FeatureGate>, which renders the marketing surface
  // for non-tenants and redirects tenants to /dashboard.
  const typeFeatures = getFeaturesForCommunity(membership.communityType);
  if (!typeFeatures.hasViolations) {
    redirect('/dashboard?reason=feature-unavailable');
  }

  if (preview) {
    // The gate picks a view, never authorization: tabs come from the same board
    // rule as before, plus Mine for residents. Review data is fetched by the
    // client only when Review is one of the tabs; nothing is loaded for it here.
    const tabs = violationsTabs(membership);
    if (tabs.length === 0) {
      redirect('/dashboard?reason=insufficient-permissions');
    }

    let mine: {
      residentUnitIds: number[];
      onYourUnit: Awaited<ReturnType<typeof loadResidentViolationLists>>['onYourUnit'];
      yourReports: Awaited<ReturnType<typeof loadResidentViolationLists>>['yourReports'];
    } | null = null;
    if (tabs.includes('mine')) {
      const residentUnitIds = await getActorUnitIds(createScopedClient(communityId), userId);
      const lists =
        residentUnitIds.length > 0
          ? await loadResidentViolationLists(communityId, membership, userId, residentUnitIds)
          : { onYourUnit: [], yourReports: [] };
      mine = { residentUnitIds, ...lists };
    }

    return (
      <FeatureGate feature="hasViolations" communityId={communityId}>
        <ViolationsPage
          communityId={communityId}
          tabs={tabs}
          initialTab={pickTab(typeof params['tab'] === 'string' ? params['tab'] : undefined, tabs)}
          canCreate={isAdminRole(membership.role)}
          finesEnabled={membership.violationFinesEnabled}
          hasArc={typeFeatures.hasARC}
          about={describeAccess(membership.communityType, 'violations', 'own')}
          initialUnitId={positiveInt(params['unitId'])}
          mine={mine}
        />
      </FeatureGate>
    );
  }

  return (
    <FeatureGate feature="hasViolations" communityId={communityId}>
      {/*
        Legal gates ride on `membership` (hydrated from community_settings), NOT
        through <FeatureGate> — that resolves via requirePlanFeature, which fails
        open when a community has no plan. Passing a plain boolean from this
        server component is the same pattern the board layout uses.
      */}
      <ViolationsAdminInbox
        communityId={communityId}
        communityTimezone={membership.timezone}
        userId={userId}
        userRole={membership.role}
        finesEnabled={membership.violationFinesEnabled}
        initialUnitId={positiveInt(params['unitId'])}
      />
    </FeatureGate>
  );
}
