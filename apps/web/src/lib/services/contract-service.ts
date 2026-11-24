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
 * List every contract bid in the caller's scoped community. The rows are
 * unsealed: pass them through `applyBidEmbargo` before anything leaves the
 * server.
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

/**
 * List the bids on one contract inside the caller's scoped community. The rows
 * are unsealed: pass them through `applyBidEmbargo` before anything leaves the
 * server. `getContractRecord` does both.
 */
export async function listContractBidsForContract(
  scoped: ScopedClient,
  contractId: number,
): Promise<ContractRouteRow[]> {
  const rows = await scoped.selectFrom(contractBids, {}, eq(contractBids.contractId, contractId));
  return rows as unknown as ContractRouteRow[];
}

// ---------------------------------------------------------------------------
// Sealed bids
// ---------------------------------------------------------------------------

export interface SealedBids<Bid> {
  /** Empty while sealed. */
  bids: Bid[];
  embargoed: boolean;
  bidCount: number;
  biddingClosesAt: Date | null;
}

/**
 * THE sealing rule, and the only copy of it: while a contract's bidding is
 * still open, its bids are withheld from everyone, managers included, and
 * only their count and the closing time are returned. The list route and the
 * contract's own page both go through here; a second implementation is how a
 * sealed amount would leak.
 */
export function applyBidEmbargo<Bid>(
  contract: { biddingClosesAt: Date | null },
  bids: Bid[],
  now: Date = new Date(),
): SealedBids<Bid> {
  const embargoed = contract.biddingClosesAt !== null && contract.biddingClosesAt > now;
  return {
    bids: embargoed ? [] : bids,
    embargoed,
    bidCount: bids.length,
    biddingClosesAt: contract.biddingClosesAt,
  };
}

// ---------------------------------------------------------------------------
// One contract, for its own page
// ---------------------------------------------------------------------------

export interface ContractRecordBid {
  id: number;
  vendorName: string;
  /** numeric(12,2) as text. */
  bidAmount: string;
  /** ISO time. */
  submittedAt: string | null;
  notes: string | null;
}

/** One contract as its page shows it. Plain data: safe to hand to a client component. */
export interface ContractRecordData {
  id: number;
  title: string;
  vendorName: string;
  description: string | null;
  /** numeric(12,2) as text. */
  contractValue: string | null;
  /** 'YYYY-MM-DD'. */
  startDate: string;
  endDate: string | null;
  /** ISO time. */
  biddingClosesAt: string | null;
  conflictOfInterest: boolean;
  conflictOfInterestNote: string | null;
  status: string;
  documentId: number | null;
  complianceChecklistItemId: number | null;
  /** The linked document, when it can still be read in this community. */
  document: { id: number; title: string } | null;
  /** The linked compliance item, when it can still be read in this community. */
  complianceItem: { id: number; title: string } | null;
  /** Already sealed: `bids` is empty until bidding closes. */
  bidSummary: {
    bids: ContractRecordBid[];
    embargoed: boolean;
    bidCount: number;
  };
}

function toIso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' && value !== '' ? new Date(value).toISOString() : null;
}

/**
 * One contract with its bids ALREADY SEALED and its linked records named, or
 * null when the id is not in the caller's scoped community. Caller MUST verify
 * contracts:read first. Nothing a sealed bid says (vendor, amount, note) is in
 * the returned value, so a page can pass it on whole.
 */
export async function getContractRecord(
  scoped: ScopedClient,
  id: number,
  now: Date = new Date(),
): Promise<ContractRecordData | null> {
  const row = await getContractById(scoped, id);
  if (!row) return null;

  const documentId = (row['documentId'] as number | null) ?? null;
  const complianceChecklistItemId = (row['complianceChecklistItemId'] as number | null) ?? null;
  // One after another, not Promise.all: three small indexed reads, and no
  // pipelining on the pooled connection.
  const bidRows = await listContractBidsForContract(scoped, id);
  // In the order they were recorded.
  bidRows.sort((a, b) => (a['id'] as number) - (b['id'] as number));
  const documentRow = documentId ? await getContractDocumentById(scoped, documentId) : null;
  const itemRow = complianceChecklistItemId
    ? await getContractChecklistItemById(scoped, complianceChecklistItemId)
    : null;

  const closesAt = toIso(row['biddingClosesAt']);
  const sealed = applyBidEmbargo(
    { biddingClosesAt: closesAt ? new Date(closesAt) : null },
    bidRows,
    now,
  );

  return {
    id: row['id'] as number,
    title: row['title'] as string,
    vendorName: row['vendorName'] as string,
    description: (row['description'] as string | null) ?? null,
    contractValue: (row['contractValue'] as string | null) ?? null,
    startDate: row['startDate'] as string,
    endDate: (row['endDate'] as string | null) ?? null,
    biddingClosesAt: closesAt,
    conflictOfInterest: (row['conflictOfInterest'] as boolean | null) ?? false,
    conflictOfInterestNote: (row['conflictOfInterestNote'] as string | null) ?? null,
    status: row['status'] as string,
    documentId,
    complianceChecklistItemId,
    document: documentRow
      ? { id: documentRow['id'] as number, title: documentRow['title'] as string }
      : null,
    complianceItem: itemRow ? { id: itemRow['id'] as number, title: itemRow['title'] as string } : null,
    bidSummary: {
      bids: sealed.bids.map((bid) => ({
        id: bid['id'] as number,
        vendorName: bid['vendorName'] as string,
        bidAmount: bid['bidAmount'] as string,
        submittedAt: toIso(bid['submittedAt']),
        notes: (bid['notes'] as string | null) ?? null,
      })),
      embargoed: sealed.embargoed,
      bidCount: sealed.bidCount,
    },
  };
}
