// breadcrumbs:exempt — delegated to apps/web/src/components/contracts/contract-form-page.tsx
// page-template: delegated to apps/web/src/components/contracts/contract-form-page.tsx
/**
 * Edit a contract. Route: /contracts/[id]/edit?communityId=X
 * Gate: signed in, a member, a condo or HOA, and `contracts:write`.
 *
 * Read through `getContractRecord`, which seals: the form is told whether
 * sealed bids exist (to lock the closing time) and nothing a bid says.
 */
import { notFound } from 'next/navigation';
import { createScopedClient } from '@propertypro/db';
import {
  requireContractsPageAccess,
  resolveContractsCommunityId,
  type PageSearchParams,
} from '@/lib/contracts/page-gate';
import { getContractRecord } from '@/lib/services/contract-service';
import { ContractFormPage } from '@/components/contracts/contract-form-page';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<PageSearchParams>;
}

export default async function EditContractPage({ params, searchParams }: PageProps) {
  const [{ id }, resolvedSearchParams] = await Promise.all([params, searchParams]);

  const communityId = await resolveContractsCommunityId(resolvedSearchParams);
  if (!communityId) {
    notFound();
  }

  const contractId = Number(id);
  if (!Number.isInteger(contractId) || contractId <= 0) {
    notFound();
  }

  const { membership } = await requireContractsPageAccess(communityId, 'write', { serverRead: true });

  // The same read the contract's page uses: the bids come back ALREADY SEALED,
  // so while bidding is open this page holds their count and nothing they say.
  const record = await getContractRecord(createScopedClient(communityId), contractId);
  if (!record) {
    notFound();
  }

  return (
    <ContractFormPage
      communityId={communityId}
      timeZone={membership.timezone}
      // Sealed with bids: the closing time can move later, not be cleared or brought forward.
      closingTimeLocked={record.bidSummary.embargoed && record.bidSummary.bidCount > 0}
      contract={{
        id: record.id,
        title: record.title,
        vendorName: record.vendorName,
        description: record.description,
        contractValue: record.contractValue,
        startDate: record.startDate,
        endDate: record.endDate,
        biddingClosesAt: record.biddingClosesAt,
        conflictOfInterest: record.conflictOfInterest,
        conflictOfInterestNote: record.conflictOfInterestNote,
        status: record.status,
        documentId: record.documentId,
        complianceChecklistItemId: record.complianceChecklistItemId,
      }}
    />
  );
}
