// page-template: delegated to apps/web/src/components/contracts/contracts-list-page.tsx
/**
 * P3-52: Contracts & Vendors — the list.
 *
 * Route: /contracts?communityId=X
 * Gate (lib/contracts/page-gate.ts): signed in, a member, a condo or HOA
 * (`hasCompliance`), and `contracts:read` — the same permission the API checks.
 * Only the manager row has it; board designation grants nothing (ADR-006).
 */
import { redirect } from 'next/navigation';
import { checkPermissionV2 } from '@/lib/db/access-control';
import { describeAccess } from '@/lib/access/describe-access';
import {
  requireContractsPageAccess,
  resolveContractsCommunityId,
  type PageSearchParams,
} from '@/lib/contracts/page-gate';
import { ContractsListPage } from '@/components/contracts/contracts-list-page';

interface PageProps {
  searchParams: Promise<PageSearchParams>;
}

export default async function ContractsPage({ searchParams }: PageProps) {
  const communityId = await resolveContractsCommunityId(await searchParams);
  if (!communityId) {
    redirect('/dashboard?reason=invalid-selection');
  }

  const { membership } = await requireContractsPageAccess(communityId, 'read');
  const canWrite = checkPermissionV2(membership.role, membership.communityType, 'contracts', 'write', {
    isUnitOwner: membership.isUnitOwner,
  });

  return (
    <ContractsListPage
      communityId={communityId}
      timeZone={membership.timezone}
      canWrite={canWrite}
      // No resident can read contracts, so the scope names nobody.
      about={describeAccess(membership.communityType, 'contracts', 'all')}
    />
  );
}
