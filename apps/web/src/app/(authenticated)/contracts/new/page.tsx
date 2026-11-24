// breadcrumbs:exempt — delegated to apps/web/src/components/contracts/contract-form-page.tsx
// page-template: delegated to apps/web/src/components/contracts/contract-form-page.tsx
/**
 * New contract. Route: /contracts/new?communityId=X
 * Gate: signed in, a member, a condo or HOA, and `contracts:write`.
 */
import { redirect } from 'next/navigation';
import {
  requireContractsPageAccess,
  resolveContractsCommunityId,
  type PageSearchParams,
} from '@/lib/contracts/page-gate';
import { ContractFormPage } from '@/components/contracts/contract-form-page';

interface PageProps {
  searchParams: Promise<PageSearchParams>;
}

export default async function NewContractPage({ searchParams }: PageProps) {
  const communityId = await resolveContractsCommunityId(await searchParams);
  if (!communityId) {
    redirect('/dashboard?reason=invalid-selection');
  }

  const { membership } = await requireContractsPageAccess(communityId, 'write');

  return <ContractFormPage communityId={communityId} timeZone={membership.timezone} />;
}
