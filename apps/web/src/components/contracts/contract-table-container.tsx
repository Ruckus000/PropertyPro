'use client';

/**
 * ContractTableContainer — feature-container pattern (B5).
 *
 * Owns the read-side hook (`useContracts`); the mutation hooks live in
 * `<ContractForm />` and `<BidTracker />` themselves and self-invalidate the
 * contracts query on success, so the container no longer threads a manual
 * invalidator callback through the presenter.
 *
 * Hands a pure-prop `<ContractTable />` everything it needs to render.
 */

import { useContracts } from '@/hooks/use-contracts';
import { ContractTable } from './ContractTable';

interface ContractTableContainerProps {
  communityId: number;
}

export function ContractTableContainer({ communityId }: ContractTableContainerProps) {
  const query = useContracts({ communityId });

  const contracts = query.data?.contracts ?? [];
  const alerts = query.data?.alerts ?? [];
  const errorMessage = query.error instanceof Error ? query.error.message : null;

  return (
    <ContractTable
      contracts={contracts}
      alerts={alerts}
      isLoading={query.isLoading}
      errorMessage={errorMessage}
      communityId={communityId}
    />
  );
}
