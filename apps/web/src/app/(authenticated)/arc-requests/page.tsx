/**
 * ARC requests — one route, two audiences.
 *
 * This page used to `redirect('/dashboard?reason=insufficient-permissions')`
 * for anyone failing `isAdminRole`. Meanwhile `requireArcSubmitterRole` throws
 * unless `role === 'resident'`. So the only people permitted to submit an ARC
 * application were the only people who could not reach a single ARC screen, and
 * the whole feature — routes, state machine, decision email, HB 1203 denial
 * validation — was unreachable from the product (#933).
 *
 * Role-branching one route rather than adding a parallel resident route: it
 * keeps a single nav entry and a single URL to link from the help centre and
 * from `feature-registry.ts`, which advertises this page to `roles: 'all'`.
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { getFeaturesForCommunity, isAdminRole } from '@propertypro/shared';
import { FeatureGate } from '@/components/billing/feature-gate';
import { ArcSubmissionsTab } from '@/components/violations/ArcSubmissionsTab';
import { ResidentArcRequests } from '@/components/violations/ResidentArcRequests';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function ArcRequestsPage({ searchParams }: PageProps) {
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

  const isReviewer = isAdminRole(membership.role);

  return (
    <FeatureGate feature="hasARC" communityId={communityId}>
      <PageHeader
        title="ARC Requests"
        description={
          isReviewer
            ? 'Review architectural review submissions for your community.'
            : 'Request approval for exterior changes to your home, and track where each request stands.'
        }
        actions={
          isReviewer ? undefined : (
            <Button asChild>
              <Link href={`/arc-requests/new?communityId=${communityId}`}>New request</Link>
            </Button>
          )
        }
      />
      {isReviewer ? (
        <ArcSubmissionsTab communityId={communityId} />
      ) : (
        <ResidentArcRequests communityId={communityId} />
      )}
    </FeatureGate>
  );
}
