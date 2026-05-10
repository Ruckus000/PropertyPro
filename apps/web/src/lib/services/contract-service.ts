import type { createScopedClient } from '@propertypro/db';
import { complianceChecklistItems, contractBids, contracts, documents } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';

type ScopedClient = ReturnType<typeof createScopedClient>;

export type ContractRouteRow = Record<string, unknown>;

/**
 * List contracts in the caller's scoped community. Caller MUST verify
 * contracts:read authorization before exposing rows.
 */
export async function listContractsForCommunity(scoped: ScopedClient): Promise<ContractRouteRow[]> {
  return (await scoped.query(contracts)) as ContractRouteRow[];
}

/**
 * List contract bids in the caller's scoped community. Caller owns bid embargo
 * presentation policy before exposing bid details.
 */
export async function listContractBidsForCommunity(scoped: ScopedClient): Promise<ContractRouteRow[]> {
  return (await scoped.query(contractBids)) as ContractRouteRow[];
}

/**
 * Fetch a contract by id inside the caller's scoped community. Caller MUST
 * verify contracts read/write authorization for the operation being performed.
 */
export async function getContractById(
  scoped: ScopedClient,
  id: number,
): Promise<ContractRouteRow | null> {
  const rows = await scoped.selectFrom(contracts, {}, eq(contracts.id, id));
  return ((rows as unknown as ContractRouteRow[])[0]) ?? null;
}

/**
 * Fetch a document by id inside the caller's scoped community for contract
 * attachment validation.
 */
export async function getContractDocumentById(
  scoped: ScopedClient,
  id: number,
): Promise<ContractRouteRow | null> {
  const rows = await scoped.selectFrom(documents, {}, eq(documents.id, id));
  return ((rows as unknown as ContractRouteRow[])[0]) ?? null;
}

/**
 * Fetch a compliance checklist item by id inside the caller's scoped community
 * for contract linkage validation.
 */
export async function getContractChecklistItemById(
  scoped: ScopedClient,
  id: number,
): Promise<ContractRouteRow | null> {
  const rows = await scoped.selectFrom(
    complianceChecklistItems,
    {},
    eq(complianceChecklistItems.id, id),
  );
  return ((rows as unknown as ContractRouteRow[])[0]) ?? null;
}

/**
 * Insert a contract in the caller's scoped community. Caller MUST verify
 * contracts:write authorization and attachment ownership first.
 */
export async function createContractForCommunity(
  scoped: ScopedClient,
  values: Record<string, unknown>,
): Promise<ContractRouteRow | undefined> {
  const rows = await scoped.insert(contracts, values);
  return (rows as unknown as ContractRouteRow[])[0];
}

/**
 * Update a contract by id inside the caller's scoped community. Caller MUST
 * verify contracts:write authorization and build validated old/new values.
 */
export async function updateContractById(
  scoped: ScopedClient,
  id: number,
  values: Record<string, unknown>,
): Promise<ContractRouteRow | undefined> {
  const rows = await scoped.update(contracts, values, eq(contracts.id, id));
  return (rows as unknown as ContractRouteRow[])[0];
}

/**
 * Insert a contract bid in the caller's scoped community. Caller MUST verify
 * contracts:write authorization and contract ownership first.
 */
export async function createContractBidForCommunity(
  scoped: ScopedClient,
  values: Record<string, unknown>,
): Promise<ContractRouteRow | undefined> {
  const rows = await scoped.insert(contractBids, values);
  return (rows as unknown as ContractRouteRow[])[0];
}
