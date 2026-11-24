// breadcrumbs:exempt — delegated to apps/web/src/components/contracts/contract-detail-page.tsx
// page-template: delegated to apps/web/src/components/contracts/contract-detail-page.tsx
/**
 * One contract. Route: /contracts/[id]?communityId=X
 * Gate: signed in, a member, a condo or HOA, and `contracts:read`.
 *
 * The contract is read on the server through the scoped client, so an id from
 * another community is simply not found. `getContractRecord` returns the bids
 * ALREADY SEALED: while bidding is open this page never holds a bid's vendor,
 * amount or note, so it cannot pass one to the view.
 */
import { notFound } from 'next/navigation';
import { createScopedClient } from '@propertypro/db';
import { checkPermissionV2 } from '@/lib/db/access-control';
import { describeAccess } from '@/lib/access/describe-access';
import {
  requireContractsPageAccess,
  resolveContractsCommunityId,
  type PageSearchParams,
} from '@/lib/contracts/page-gate';
import { getContractRecord } from '@/lib/services/contract-service';
import { ContractDetailPage as ContractDetailView } from '@/components/contracts/contract-detail-page';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<PageSearchParams>;
}

export default async function ContractDetailPage({ params, searchParams }: PageProps) {
  const [{ id }, resolvedSearchParams] = await Promise.all([params, searchParams]);

  const communityId = await resolveContractsCommunityId(resolvedSearchParams);
  if (!communityId) {
    notFound();
  }

  const contractId = Number(id);
  if (!Number.isInteger(contractId) || contractId <= 0) {
    notFound();
  }

  const { membership } = await requireContractsPageAccess(communityId, 'read', { serverRead: true });

  const contract = await getContractRecord(createScopedClient(communityId), contractId);
  if (!contract) {
    notFound();
  }

  const canWrite = checkPermissionV2(membership.role, membership.communityType, 'contracts', 'write', {
    isUnitOwner: membership.isUnitOwner,
  });

  return (
    <ContractDetailView
      communityId={communityId}
      contract={contract}
      timeZone={membership.timezone}
      canWrite={canWrite}
      // No resident can read contracts, so the scope names nobody.
      about={describeAccess(membership.communityType, 'contracts', 'all')}
    />
  );
}
