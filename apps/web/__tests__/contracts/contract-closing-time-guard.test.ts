/**
 * The closing time of a sealed contract with bids (owner decision 2026-11-24,
 * "Block it once bids exist"): it can stay or move later, and cannot be
 * cleared or brought forward. Run against the real service functions over a
 * stand-in scoped client that records the order of what it was asked to do,
 * because the order (lock, then look for bids, then write) is what keeps a new
 * bid and a change to the closing time from passing each other.
 */
import { describe, expect, it, vi } from 'vitest';

const tables = vi.hoisted(() => ({
  contracts: { __table: 'contracts', id: 'contracts.id' },
  contractBids: { __table: 'contract_bids', id: 'contract_bids.id', contractId: 'contract_bids.contract_id' },
  documents: { __table: 'documents', id: 'documents.id' },
  complianceChecklistItems: { __table: 'compliance_checklist_items', id: 'items.id' },
}));

vi.mock('@propertypro/db', () => tables);
vi.mock('@propertypro/db/filters', () => ({
  eq: (col: unknown, val: unknown) => ({ col, val }),
}));

import {
  createContractBidForCommunity,
  updateContractGuardingSealedBids,
} from '../../src/lib/services/contract-service';
import {
  CLOSING_TIME_LOCKED_MESSAGE,
  isBiddingSealed,
  isClosingTimeChangeAllowed,
} from '../../src/lib/contracts/bid-sealing';

type Scoped = Parameters<typeof updateContractGuardingSealedBids>[0];

const NOW = new Date('2026-12-01T15:00:00.000Z');
const CLOSES = new Date('2026-12-12T22:00:00.000Z');
const LATER = new Date('2026-12-20T22:00:00.000Z');
const EARLIER_STILL_AHEAD = new Date('2026-12-05T22:00:00.000Z');
const PAST = new Date('2026-11-30T22:00:00.000Z');

/** A scoped client over one contract and its bids, logging every call in order. */
function fake(contract: Record<string, unknown> | null, bidCount: number) {
  const log: string[] = [];
  const updates: Record<string, unknown>[] = [];
  const inserts: Record<string, unknown>[] = [];
  const client = {
    transaction: async <T,>(fn: (tx: unknown) => Promise<T>) => {
      log.push('begin');
      const result = await fn(client);
      log.push('commit');
      return result;
    },
    selectFrom: (table: { __table: string }) => {
      const rows =
        table.__table === 'contracts'
          ? contract
            ? [contract]
            : []
          : Array.from({ length: bidCount }, (_, i) => ({ id: i + 1 }));
      const builder = {
        for: (strength: string) => {
          log.push(`lock ${table.__table} for ${strength}`);
          return Promise.resolve(rows);
        },
        limit: (n: number) => {
          log.push(`read ${table.__table}`);
          return Promise.resolve(rows.slice(0, n));
        },
      };
      return builder;
    },
    update: async (table: { __table: string }, values: Record<string, unknown>) => {
      log.push(`update ${table.__table}`);
      updates.push(values);
      return [{ ...contract, ...values }];
    },
    insert: async (table: { __table: string }, values: Record<string, unknown>) => {
      log.push(`insert ${table.__table}`);
      inserts.push(values);
      return [{ id: 99, ...values }];
    },
  };
  return { scoped: client as unknown as Scoped, log, updates, inserts };
}

const sealed = { id: 7, communityId: 42, biddingClosesAt: CLOSES };

describe('isClosingTimeChangeAllowed (sealed, with bids)', () => {
  it('allows the same time or a later one', () => {
    expect(isClosingTimeChangeAllowed(CLOSES, LATER, NOW)).toBe(true);
    expect(isClosingTimeChangeAllowed(CLOSES, new Date(CLOSES), NOW)).toBe(true);
  });

  it('refuses clearing it, a time already past, and an earlier time that is still ahead', () => {
    expect(isClosingTimeChangeAllowed(CLOSES, null, NOW)).toBe(false);
    expect(isClosingTimeChangeAllowed(CLOSES, PAST, NOW)).toBe(false);
    expect(isClosingTimeChangeAllowed(CLOSES, NOW, NOW)).toBe(false);
    expect(isClosingTimeChangeAllowed(CLOSES, EARLIER_STILL_AHEAD, NOW)).toBe(false);
    expect(isClosingTimeChangeAllowed(CLOSES, new Date('garbage'), NOW)).toBe(false);
  });

  it('with a stored time it cannot read, only a time ahead of now is allowed', () => {
    expect(isClosingTimeChangeAllowed(new Date('garbage'), LATER, NOW)).toBe(true);
    expect(isClosingTimeChangeAllowed('text', PAST, NOW)).toBe(false);
    expect(isClosingTimeChangeAllowed(undefined, null, NOW)).toBe(false);
  });

  it('is the same predicate the embargo uses', () => {
    expect(isBiddingSealed(CLOSES, NOW)).toBe(true);
    expect(isBiddingSealed(PAST, NOW)).toBe(false);
    expect(isBiddingSealed(null, NOW)).toBe(false);
    expect(isBiddingSealed('2020-01-01T00:00:00Z', NOW)).toBe(true);
    expect(CLOSING_TIME_LOCKED_MESSAGE).toBe(
      'Bids have been received, so the closing time can be moved later but not opened early.',
    );
  });
});

describe('updateContractGuardingSealedBids', () => {
  describe('sealed, with bids', () => {
    it('refuses a time at or before now, and writes nothing', async () => {
      const f = fake(sealed, 2);
      expect(await updateContractGuardingSealedBids(f.scoped, 7, { biddingClosesAt: PAST }, NOW)).toEqual({
        status: 'closing_time_locked',
      });
      expect(f.updates).toEqual([]);
    });

    it('refuses clearing it, and writes nothing', async () => {
      const f = fake(sealed, 1);
      expect(await updateContractGuardingSealedBids(f.scoped, 7, { biddingClosesAt: null }, NOW)).toEqual({
        status: 'closing_time_locked',
      });
      expect(f.updates).toEqual([]);
    });

    it('refuses an earlier time that is still ahead: that opens the bids sooner than bidders were told', async () => {
      const f = fake(sealed, 1);
      const result = await updateContractGuardingSealedBids(f.scoped, 7, { biddingClosesAt: EARLIER_STILL_AHEAD }, NOW);
      expect(result.status).toBe('closing_time_locked');
    });

    it('accepts a later time, along with whatever else the update carries', async () => {
      const f = fake(sealed, 2);
      const result = await updateContractGuardingSealedBids(f.scoped, 7, { biddingClosesAt: LATER, title: 'Renamed' }, NOW);
      expect(result.status).toBe('updated');
      expect(f.updates).toEqual([{ biddingClosesAt: LATER, title: 'Renamed' }]);
    });
  });

  it('with no bids, any change is accepted: cleared, brought forward, set in the past', async () => {
    for (const next of [null, EARLIER_STILL_AHEAD, PAST]) {
      const f = fake(sealed, 0);
      const result = await updateContractGuardingSealedBids(f.scoped, 7, { biddingClosesAt: next }, NOW);
      expect(result.status).toBe('updated');
      expect(f.updates).toEqual([{ biddingClosesAt: next }]);
    }
  });

  it('once bidding has closed, any change is accepted, and the bids are not even counted', async () => {
    for (const next of [null, PAST, LATER]) {
      const f = fake({ ...sealed, biddingClosesAt: PAST }, 3);
      const result = await updateContractGuardingSealedBids(f.scoped, 7, { biddingClosesAt: next }, NOW);
      expect(result.status).toBe('updated');
      expect(f.log).not.toContain('read contract_bids');
    }
  });

  it('a contract with no closing time can be given one freely', async () => {
    const f = fake({ ...sealed, biddingClosesAt: null }, 3);
    expect((await updateContractGuardingSealedBids(f.scoped, 7, { biddingClosesAt: LATER }, NOW)).status).toBe('updated');
  });

  it('says so when the contract is not in this community', async () => {
    const f = fake(null, 0);
    expect(await updateContractGuardingSealedBids(f.scoped, 7, { biddingClosesAt: LATER }, NOW)).toEqual({
      status: 'not_found',
    });
    expect(f.updates).toEqual([]);
  });

  it('locks the contract, then looks for bids, then writes, all in one transaction', async () => {
    const f = fake(sealed, 0);
    await updateContractGuardingSealedBids(f.scoped, 7, { biddingClosesAt: null }, NOW);
    expect(f.log).toEqual([
      'begin',
      'lock contracts for update',
      'read contract_bids',
      'update contracts',
      'commit',
    ]);
  });
});

describe('createContractBidForCommunity', () => {
  it('takes the same lock on the contract before it inserts the bid, in one transaction', async () => {
    const f = fake(sealed, 0);
    const created = await createContractBidForCommunity(f.scoped, { contractId: 7, vendorName: 'BidCo', bidAmount: '100.00' });
    expect(created).toMatchObject({ id: 99, vendorName: 'BidCo' });
    expect(f.log).toEqual(['begin', 'lock contracts for update', 'insert contract_bids', 'commit']);
  });

  it('inserts nothing when the contract is gone', async () => {
    const f = fake(null, 0);
    expect(await createContractBidForCommunity(f.scoped, { contractId: 7, vendorName: 'BidCo' })).toBeUndefined();
    expect(f.inserts).toEqual([]);
  });
});
