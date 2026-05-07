'use client';

/**
 * ContractTableContainer — feature-container pattern (B5).
 *
 * Owns:
 *   - Data fetch via `useContracts()` (TanStack Query).
 *   - Cache invalidation after child mutations (`<ContractForm />` create/update,
 *     `<BidTracker />` add-bid) via `useContractsInvalidator()`.
 *
 * Hands a pure-prop `<ContractTable />` everything it needs to render.
 *
 * Replaces the previous `useState + useEffect + fetch + fetchContracts()`
 * pattern. The child mutation components remain grandfathered direct-fetch
 * for now (tracked in `KNOWN_DIRECT_API_CALL_FILES`); the container's
 * invalidator wires their `onSaved`/`onBidAdded` callbacks into the cache so
 * the list refreshes without a `fetchContracts()` callback chain.
 */

import { useContracts, useContractsInvalidator } from '@/hooks/use-contracts';
import { ContractTable } from './ContractTable';

interface ContractTableContainerProps {
  communityId: number;
}

export function ContractTableContainer({ communityId }: ContractTableContainerProps) {
  const query = useContracts({ communityId });
  const invalidate = useContractsInvalidator(communityId);

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
      onAfterMutation={invalidate}
    />
  );
}
