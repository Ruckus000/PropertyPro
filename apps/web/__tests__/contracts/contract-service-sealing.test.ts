/**
 * The one sealing rule (`applyBidEmbargo`) and the read a contract's own page
 * uses (`getContractRecord`), run for real against a stand-in scoped client.
 *
 * What must hold: while bidding is open, nothing a bid says (vendor, amount,
 * note) is anywhere in the value the service returns. Only the count and the
 * closing time are.
 */
import { describe, expect, it, vi } from 'vitest';

const tables = vi.hoisted(() => ({
  contracts: { __table: 'contracts', id: 'contracts.id' },
  contractBids: { __table: 'contract_bids', contractId: 'contract_bids.contract_id' },
  documents: { __table: 'documents', id: 'documents.id' },
  complianceChecklistItems: { __table: 'compliance_checklist_items', id: 'items.id' },
}));

vi.mock('@propertypro/db', () => tables);
vi.mock('@propertypro/db/filters', () => ({
  eq: (col: unknown, val: unknown) => ({ col, val }),
}));

import {
  applyBidEmbargo,
  getContractRecord,
  listContractBidsForContract,
} from '../../src/lib/services/contract-service';

type Row = Record<string, unknown>;
type Scoped = Parameters<typeof getContractRecord>[0];

const NOW = new Date('2026-12-01T15:00:00.000Z');
const CLOSES_LATER = new Date('2026-12-12T22:00:00.000Z');
const CLOSED_EARLIER = new Date('2026-11-20T22:00:00.000Z');

const BIDS: Row[] = [
  { id: 1, contractId: 7, vendorName: 'Zephyr Roofing', bidAmount: '48250.00', notes: 'Includes tear-off', submittedAt: new Date('2026-11-28T14:00:00Z') },
  { id: 2, contractId: 7, vendorName: 'Quarry Builders', bidAmount: '51900.50', notes: null, submittedAt: new Date('2026-11-29T14:00:00Z') },
  { id: 3, contractId: 8, vendorName: 'Other Contract Vendor', bidAmount: '10.00', notes: null, submittedAt: new Date('2026-11-29T14:00:00Z') },
];

function contractRow(over: Row = {}): Row {
  return {
    id: 7,
    communityId: 42,
    title: 'Roof replacement',
    vendorName: 'To be awarded',
    description: 'Replace the flat roof',
    contractValue: '50000.00',
    startDate: '2027-01-01',
    endDate: '2027-06-30',
    documentId: null,
    complianceChecklistItemId: null,
    biddingClosesAt: CLOSES_LATER,
    conflictOfInterest: false,
    conflictOfInterestNote: null,
    status: 'draft',
    ...over,
  };
}

/** A scoped client over fixed rows: `selectFrom(table, {}, eq(col, val))`. */
function scopedOver(rows: { contracts?: Row[]; bids?: Row[]; documents?: Row[]; items?: Row[] }): Scoped {
  const selectFrom = vi.fn(async (table: { __table: string }, _cols: unknown, where: { col: string; val: unknown }) => {
    switch (table.__table) {
      case 'contracts':
        return (rows.contracts ?? []).filter((r) => r['id'] === where.val);
      case 'contract_bids':
        return (rows.bids ?? []).filter((r) => r['contractId'] === where.val);
      case 'documents':
        return (rows.documents ?? []).filter((r) => r['id'] === where.val);
      case 'compliance_checklist_items':
        return (rows.items ?? []).filter((r) => r['id'] === where.val);
      default:
        throw new Error(`unexpected table ${table.__table}`);
    }
  });
  return { selectFrom } as unknown as Scoped;
}

describe('applyBidEmbargo', () => {
  it('withholds every bid while the closing time is in the future, keeping the count', () => {
    const sealed = applyBidEmbargo({ biddingClosesAt: CLOSES_LATER }, BIDS.slice(0, 2), NOW);
    expect(sealed).toEqual({ bids: [], embargoed: true, bidCount: 2, biddingClosesAt: CLOSES_LATER });
  });

  it('returns the bids once the closing time has passed', () => {
    const open = applyBidEmbargo({ biddingClosesAt: CLOSED_EARLIER }, BIDS.slice(0, 2), NOW);
    expect(open.embargoed).toBe(false);
    expect(open.bids).toHaveLength(2);
    expect(open.bidCount).toBe(2);
  });

  it('returns the bids when no closing time was ever set', () => {
    const open = applyBidEmbargo({ biddingClosesAt: null }, BIDS.slice(0, 2), NOW);
    expect(open.embargoed).toBe(false);
    expect(open.bids).toHaveLength(2);
  });

  it('opens at the closing instant itself, not after it', () => {
    expect(applyBidEmbargo({ biddingClosesAt: NOW }, BIDS, NOW).embargoed).toBe(false);
  });
});

describe('listContractBidsForContract', () => {
  it("reads one contract's bids, not the community's", async () => {
    const scoped = scopedOver({ bids: BIDS });
    const rows = await listContractBidsForContract(scoped, 7);
    expect(rows.map((r) => r['id'])).toEqual([1, 2]);
  });
});

describe('getContractRecord', () => {
  it('sealed: no bid vendor, amount or note is anywhere in the returned value', async () => {
    const scoped = scopedOver({ contracts: [contractRow()], bids: BIDS });
    const record = await getContractRecord(scoped, 7, NOW);

    expect(record).not.toBeNull();
    expect(record!.bidSummary).toEqual({ bids: [], embargoed: true, bidCount: 2 });
    expect(record!.biddingClosesAt).toBe('2026-12-12T22:00:00.000Z');

    const everything = JSON.stringify(record);
    for (const secret of ['Zephyr Roofing', 'Quarry Builders', '48250', '51900', 'Includes tear-off']) {
      expect(everything).not.toContain(secret);
    }
  });

  it('after closing: the bids come back as plain data', async () => {
    const scoped = scopedOver({
      contracts: [contractRow({ biddingClosesAt: CLOSED_EARLIER })],
      bids: BIDS,
    });
    const record = await getContractRecord(scoped, 7, NOW);

    expect(record!.bidSummary.embargoed).toBe(false);
    expect(record!.bidSummary.bidCount).toBe(2);
    expect(record!.bidSummary.bids).toEqual([
      { id: 1, vendorName: 'Zephyr Roofing', bidAmount: '48250.00', submittedAt: '2026-11-28T14:00:00.000Z', notes: 'Includes tear-off' },
      { id: 2, vendorName: 'Quarry Builders', bidAmount: '51900.50', submittedAt: '2026-11-29T14:00:00.000Z', notes: null },
    ]);
  });

  it('lists the bids in the order they were recorded', async () => {
    const scoped = scopedOver({
      contracts: [contractRow({ biddingClosesAt: null })],
      bids: [BIDS[1]!, BIDS[0]!],
    });
    const record = await getContractRecord(scoped, 7, NOW);
    expect(record!.bidSummary.bids.map((b) => b.id)).toEqual([1, 2]);
  });

  it('is null for an id the scoped client cannot see', async () => {
    const scoped = scopedOver({ contracts: [contractRow()], bids: BIDS });
    expect(await getContractRecord(scoped, 999, NOW)).toBeNull();
  });

  it('names the linked document and compliance item, and carries status and the conflict note', async () => {
    const scoped = scopedOver({
      contracts: [
        contractRow({
          documentId: 100,
          complianceChecklistItemId: 200,
          status: 'terminated',
          conflictOfInterest: true,
          conflictOfInterestNote: 'Treasurer owns the vendor',
        }),
      ],
      documents: [{ id: 100, title: 'Signed roofing agreement' }],
      items: [{ id: 200, title: 'Contracts and bids' }],
    });
    const record = await getContractRecord(scoped, 7, NOW);

    expect(record!.document).toEqual({ id: 100, title: 'Signed roofing agreement' });
    expect(record!.complianceItem).toEqual({ id: 200, title: 'Contracts and bids' });
    expect(record!.status).toBe('terminated');
    expect(record!.conflictOfInterest).toBe(true);
    expect(record!.conflictOfInterestNote).toBe('Treasurer owns the vendor');
  });

  it('keeps the id when a linked record can no longer be read', async () => {
    const scoped = scopedOver({ contracts: [contractRow({ documentId: 100 })] });
    const record = await getContractRecord(scoped, 7, NOW);
    expect(record!.documentId).toBe(100);
    expect(record!.document).toBeNull();
  });
});
