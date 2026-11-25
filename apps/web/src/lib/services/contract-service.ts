import type { createScopedClient } from '@propertypro/db';
import { complianceChecklistItems, contractBids, contracts, documents } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { isBiddingSealed, isClosingTimeChangeAllowed } from '@/lib/contracts/bid-sealing';

type ScopedClient = ReturnType<typeof createScopedClient>;

export type ContractRouteRow = Record<string, unknown>;

/**
 * The audit entry for a write, built from the row the write produced (or, for
 * an update, the row as it stood under the lock) and written in the SAME
 * transaction: an audit failure rolls the write back, and a write never commits
 * unaudited.
 */
export type ContractAuditBuilder = (
  row: ContractRouteRow,
) => Parameters<ScopedClient['logAudit']>[0];

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
  audit?: ContractAuditBuilder,
): Promise<ContractRouteRow | undefined> {
  if (!audit) {
    const rows = await scoped.update(contracts, values, eq(contracts.id, id));
    return (rows as unknown as ContractRouteRow[])[0];
  }
  return scoped.transaction(async (tx) => {
    const before = await lockContractById(tx, id);
    if (!before) return undefined;
    const rows = await tx.update(contracts, values, eq(contracts.id, id));
    await tx.logAudit(audit(before));
    return (rows as unknown as ContractRouteRow[])[0];
  });
}

/** The contract's row, locked until the transaction ends. Null when it is not in this community. */
async function lockContractById(tx: ScopedClient, id: number): Promise<ContractRouteRow | null> {
  const rows = await tx.selectFrom(contracts, {}, eq(contracts.id, id)).for('update');
  return ((rows as unknown as ContractRouteRow[])[0]) ?? null;
}

/**
 * Insert a contract bid in the caller's scoped community. Caller MUST verify
 * contracts:write authorization and contract ownership first.
 *
 * The contract's row is locked first, in the same transaction. That is what
 * keeps a new bid and a change to the closing time from passing each other:
 * `updateContractGuardingSealedBids` takes the same lock before it counts
 * bids, so each sees the other's finished work. Undefined when the contract is
 * no longer there.
 */
export async function createContractBidForCommunity(
  scoped: ScopedClient,
  values: Record<string, unknown>,
  audit?: ContractAuditBuilder,
): Promise<ContractRouteRow | undefined> {
  return scoped.transaction(async (tx) => {
    const contract = await lockContractById(tx, values['contractId'] as number);
    if (!contract) return undefined;
    const rows = await tx.insert(contractBids, values);
    const created = (rows as unknown as ContractRouteRow[])[0];
    if (created && audit) await tx.logAudit(audit(created));
    return created;
  });
}

export type GuardedContractUpdate =
  | { status: 'updated'; row: ContractRouteRow | undefined; before: ContractRouteRow }
  | { status: 'not_found' }
  /** Sealed, with bids, and the new closing time would open them early. Nothing was written. */
  | { status: 'closing_time_locked' };

/**
 * Update a contract when the update touches `biddingClosesAt`. Caller MUST
 * verify contracts:write authorization and pass a Date or null for the time.
 *
 * While the contract is sealed and has at least one bid, the closing time may
 * only stay or move later (`isClosingTimeChangeAllowed`); clearing it or
 * bringing it forward is refused and nothing is written. With no bids, or once
 * bidding has closed, any change goes through.
 *
 * One transaction: lock the contract's row, read its closing time, look for a
 * bid, then update. Adding a bid takes the same lock, so a bid cannot arrive
 * between the check and the write.
 */
export async function updateContractGuardingSealedBids(
  scoped: ScopedClient,
  id: number,
  values: Record<string, unknown>,
  now: Date = new Date(),
  audit?: ContractAuditBuilder,
): Promise<GuardedContractUpdate> {
  return scoped.transaction(async (tx) => {
    const current = await lockContractById(tx, id);
    if (!current) return { status: 'not_found' as const };

    const next = (values['biddingClosesAt'] as Date | null | undefined) ?? null;
    const stored = current['biddingClosesAt'];
    if (isBiddingSealed(stored, now) && !isClosingTimeChangeAllowed(stored, next, now)) {
      const bids = await tx.selectFrom(contractBids, { id: contractBids.id }, eq(contractBids.contractId, id)).limit(1);
      if ((bids as unknown as unknown[]).length > 0) return { status: 'closing_time_locked' as const };
    }

    const rows = await tx.update(contracts, values, eq(contracts.id, id));
    if (audit) await tx.logAudit(audit(current));
    return {
      status: 'updated' as const,
      row: (rows as unknown as ContractRouteRow[])[0],
      /** The row as it stood under the lock, before this update. */
      before: current,
    };
  });
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
  // The predicate itself (it fails closed) is `isBiddingSealed`, shared with
  // the audit trail's redaction of bid entries.
  const embargoed = isBiddingSealed(contract.biddingClosesAt, now);
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

/** A stored time as a Date. Null stays null; anything unreadable becomes an Invalid Date, never null. */
function toDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  return new Date(typeof value === 'string' && value !== '' ? value : Number.NaN);
}

/** ISO text for a readable time; null for none or for one that cannot be read. */
function toIso(value: unknown): string | null {
  const date = toDate(value);
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
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
  // The stored value itself, not the readable text: an unreadable time must reach the rule as unreadable.
  const sealed = applyBidEmbargo({ biddingClosesAt: toDate(row['biddingClosesAt']) }, bidRows, now);

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
