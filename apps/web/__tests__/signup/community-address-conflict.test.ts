/**
 * `lib/auth/community-address-conflict.ts` — one community per street address.
 *
 * Pinned: spelling variants of one address match; a different house number or
 * ZIP never does; an address that cannot be canonicalized never blocks; demo,
 * deleted and the caller's own pending row are not conflicts (those filters are
 * asserted on the query, since the DB is mocked).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  createUnscopedClientMock: vi.fn(),
  communitiesTable: {
    addressLine1: 'communities.address_line1',
    zipCode: 'communities.zip_code',
    deletedAt: 'communities.deleted_at',
    isDemo: 'communities.is_demo',
  },
  pendingSignupsTable: {
    addressLine1: 'pending_signups.address_line_1',
    zipCode: 'pending_signups.zip_code',
    status: 'pending_signups.status',
    signupRequestId: 'pending_signups.signup_request_id',
  },
}));

vi.mock('@propertypro/db/unsafe', () => ({ createUnscopedClient: h.createUnscopedClientMock }));
vi.mock('@propertypro/db', () => ({
  communities: h.communitiesTable,
  pendingSignups: h.pendingSignupsTable,
}));
vi.mock('@propertypro/db/filters', () => ({
  and: (...clauses: unknown[]) => ({ _type: 'and', clauses }),
  eq: (col: unknown, value: unknown) => ({ _type: 'eq', col, value }),
  ne: (col: unknown, value: unknown) => ({ _type: 'ne', col, value }),
  isNull: (col: unknown) => ({ _type: 'isNull', col }),
  inArray: (col: unknown, values: unknown) => ({ _type: 'inArray', col, values }),
}));

import {
  buildAddressKey,
  hasConflictingCommunity,
} from '../../src/lib/auth/community-address-conflict';

type Row = { addressLine1: string | null; zipCode: string | null };

function mockDb(live: Row[], paid: Row[] = []) {
  const wheres: unknown[] = [];
  const results = [live, paid];
  h.createUnscopedClientMock.mockReturnValue({
    select: () => ({
      from: () => ({
        where: async (clause: unknown) => {
          wheres.push(clause);
          return results.shift() ?? [];
        },
      }),
    }),
  });
  return wheres;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildAddressKey', () => {
  it.each([
    ['1200 Brickell Bay Drive', '33131'],
    ['1200 brickell bay dr.', '33131'],
    ['  1200  BRICKELL BAY DR ', '33131-4410'],
    ['1200 Brickell Bay Dr, Apt 4B', '33131'],
    ['1200 Brickell Bay Dr #1203', '33131'],
    ['1200 Brickell Bay Dr Suite 300', '33131'],
  ])('reads %j / %j as the same building', (line, zip) => {
    expect(buildAddressKey(line, zip)).toBe('33131|1200 brickell bay dr');
  });

  it('canonicalizes directionals and suffixes', () => {
    expect(buildAddressKey('500 North Ocean Boulevard', '33062')).toBe(
      buildAddressKey('500 N Ocean Blvd', '33062'),
    );
  });

  it('keeps a different house number or ZIP apart', () => {
    const key = buildAddressKey('1200 Brickell Bay Dr', '33131');
    expect(buildAddressKey('1201 Brickell Bay Dr', '33131')).not.toBe(key);
    expect(buildAddressKey('1200 Brickell Bay Dr', '33130')).not.toBe(key);
  });

  it.each([
    ['Brickell Bay Dr', '33131'], // no house number
    ['1200', '33131'], // no street
    ['1200 Brickell Bay Dr', '3313'], // not a ZIP
    ['1200 Brickell Bay Dr', null],
    [null, '33131'],
    ['', ''],
  ])('declines to key %j / %j', (line, zip) => {
    expect(buildAddressKey(line, zip)).toBeNull();
  });
});

describe('hasConflictingCommunity', () => {
  it('finds a live community spelled differently', async () => {
    mockDb([{ addressLine1: '1200 Brickell Bay Drive', zipCode: '33131' }]);
    await expect(
      hasConflictingCommunity({ addressLine1: '1200 brickell bay dr', zipCode: '33131' }),
    ).resolves.toBe(true);
  });

  it('asks only for live, non-demo communities in that ZIP', async () => {
    const wheres = mockDb([]);
    await hasConflictingCommunity({ addressLine1: '1200 Brickell Bay Dr', zipCode: '33131' });
    expect(wheres[0]).toEqual({
      _type: 'and',
      clauses: [
        { _type: 'eq', col: 'communities.zip_code', value: '33131' },
        { _type: 'isNull', col: 'communities.deleted_at' },
        { _type: 'eq', col: 'communities.is_demo', value: false },
      ],
    });
  });

  it('finds another signup that has paid for the address, excluding the caller\'s own', async () => {
    const wheres = mockDb([], [{ addressLine1: '1200 Brickell Bay Dr', zipCode: '33131' }]);
    await expect(
      hasConflictingCommunity({
        addressLine1: '1200 Brickell Bay Dr',
        zipCode: '33131',
        excludeSignupRequestId: 'mine',
      }),
    ).resolves.toBe(true);
    expect(wheres[1]).toEqual({
      _type: 'and',
      clauses: [
        { _type: 'eq', col: 'pending_signups.zip_code', value: '33131' },
        { _type: 'inArray', col: 'pending_signups.status', values: ['payment_completed', 'provisioning'] },
        { _type: 'ne', col: 'pending_signups.signup_request_id', value: 'mine' },
      ],
    });
  });

  it('is false for a neighbour in the same ZIP', async () => {
    mockDb([{ addressLine1: '1201 Brickell Bay Dr', zipCode: '33131' }], []);
    await expect(
      hasConflictingCommunity({ addressLine1: '1200 Brickell Bay Dr', zipCode: '33131' }),
    ).resolves.toBe(false);
  });

  it('never queries for an address it cannot key', async () => {
    mockDb([]);
    await expect(
      hasConflictingCommunity({ addressLine1: 'Brickell Bay Dr', zipCode: '33131' }),
    ).resolves.toBe(false);
    expect(h.createUnscopedClientMock).not.toHaveBeenCalled();
  });
});
