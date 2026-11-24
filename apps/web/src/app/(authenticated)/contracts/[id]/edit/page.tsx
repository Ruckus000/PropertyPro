// breadcrumbs:exempt — delegated to apps/web/src/components/contracts/contract-form-page.tsx
// page-template: delegated to apps/web/src/components/contracts/contract-form-page.tsx
/**
 * Edit a contract. Route: /contracts/[id]/edit?communityId=X
 * Gate: signed in, a member, a condo or HOA, and `contracts:write`.
 *
 * Only the contract's own fields are read here (`getContractById`): no bid is
 * loaded, so nothing about a sealed bid can reach the form.
 */
import { notFound } from 'next/navigation';
import { createScopedClient } from '@propertypro/db';
import {
  requireContractsPageAccess,
  resolveContractsCommunityId,
  type PageSearchParams,
} from '@/lib/contracts/page-gate';
import { getContractById } from '@/lib/services/contract-service';
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

  const row = await getContractById(createScopedClient(communityId), contractId);
  if (!row) {
    notFound();
  }

  const closesAt = row['biddingClosesAt'];

  return (
    <ContractFormPage
      communityId={communityId}
      timeZone={membership.timezone}
      contract={{
        id: row['id'] as number,
        title: row['title'] as string,
        vendorName: row['vendorName'] as string,
        description: (row['description'] as string | null) ?? null,
        contractValue: (row['contractValue'] as string | null) ?? null,
        startDate: row['startDate'] as string,
        endDate: (row['endDate'] as string | null) ?? null,
        biddingClosesAt: closesAt ? new Date(closesAt as Date | string).toISOString() : null,
        conflictOfInterest: (row['conflictOfInterest'] as boolean | null) ?? false,
        conflictOfInterestNote: (row['conflictOfInterestNote'] as string | null) ?? null,
        status: row['status'] as string,
        documentId: (row['documentId'] as number | null) ?? null,
        complianceChecklistItemId: (row['complianceChecklistItemId'] as number | null) ?? null,
      }}
    />
  );
}
