/**
 * Who may vote, name a proxy, read a receipt and see proxies (decision D5).
 *
 * §718.128 gives the vote to the unit's OWNER. A tenant shares the unit but
 * not the vote, so `listActorUnitIds` (occupancy) is the wrong question for
 * every elections right; `listActorOwnedUnitIds` answers the right one:
 * the unit's recorded owner, plus a resident membership flagged
 * `isUnitOwner` (a co-owner who is not the recorded owner).
 *
 * The service runs against a small in-memory table set: the filter operators
 * are stubbed as data and evaluated per row, so these tests exercise the real
 * WHERE clauses the service builds — a dropped predicate shows up as a row
 * that should not have matched.
 *
 * Revert-checks are recorded in the commit message.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
type Where =
  | { _type: 'eq'; col: { __col: string }; val: unknown }
  | { _type: 'and' | 'or'; args: (Where | undefined)[] }
  | { _type: 'inArray'; col: { __col: string }; vals: unknown[] }
  | { _type: 'isNotNull'; col: { __col: string } }
  | undefined;

const { db, makeTable } = vi.hoisted(() => {
  const db: { tables: Record<string, Row[]>; nextId: number } = { tables: {}, nextId: 1000 };
  // A table is a proxy: `table.__table` is its name, any other property is a
  // column reference `{ __col }` the evaluator below reads row fields through.
  const makeTable = (name: string) =>
    new Proxy({} as Record<string, unknown>, {
      get: (_target, key) => {
        if (key === '__table') return name;
        if (typeof key !== 'string' || key === 'then') return undefined;
        return { __table: name, __col: key };
      },
    });
  return { db, makeTable };
});

const tables = vi.hoisted(() => ({
  complianceAuditLog: makeTable('compliance_audit_log'),
  electionBallotSubmissions: makeTable('election_ballot_submissions'),
  electionBallots: makeTable('election_ballots'),
  electionCandidates: makeTable('election_candidates'),
  electionEligibilitySnapshots: makeTable('election_eligibility_snapshots'),
  electionProxies: makeTable('election_proxies'),
  elections: makeTable('elections'),
  units: makeTable('units'),
  userRoles: makeTable('user_roles'),
}));

function matches(where: Where, row: Row): boolean {
  if (where === undefined) return true;
  switch (where._type) {
    case 'eq':
      return row[where.col.__col] === where.val;
    case 'and':
      return where.args.every((arg) => matches(arg, row));
    case 'or':
      return where.args.some((arg) => matches(arg, row));
    case 'inArray':
      return where.vals.includes(row[where.col.__col]);
    case 'isNotNull':
      return row[where.col.__col] !== null && row[where.col.__col] !== undefined;
  }
}

function chain(rows: Row[]) {
  const promise = Promise.resolve(rows);
  const builder = {
    for: () => builder,
    orderBy: () => builder,
    limit: () => builder,
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
  };
  return builder;
}

function tableName(table: unknown): string {
  return (table as { __table: string }).__table;
}

const insertSpy = vi.fn();

const scopedClient = {
  selectFrom: (table: unknown, _cols: unknown, where: Where) =>
    chain((db.tables[tableName(table)] ?? []).filter((row) => matches(where, row))),
  insert: async (table: unknown, values: Row | Row[]) => {
    insertSpy(tableName(table), values);
    const list = Array.isArray(values) ? values : [values];
    const inserted = list.map((value) => ({
      id: db.nextId++,
      submittedAt: new Date('2026-06-01T00:00:00Z'),
      submissionFingerprint: 'fp-new',
      createdAt: new Date('2026-06-01T00:00:00Z'),
      updatedAt: new Date('2026-06-01T00:00:00Z'),
      approvedByUserId: null,
      approvedAt: null,
      ...value,
    }));
    (db.tables[tableName(table)] ??= []).push(...inserted);
    return inserted;
  },
  update: async (table: unknown, patch: Row, where: Where) => {
    const rows = (db.tables[tableName(table)] ?? []).filter((row) => matches(where, row));
    for (const row of rows) Object.assign(row, patch);
    return rows;
  },
};

vi.mock('@propertypro/db', () => ({
  ...tables,
  createScopedClient: vi.fn(() => scopedClient),
}));

vi.mock('@propertypro/db/filters', () => ({
  and: (...args: unknown[]) => ({ _type: 'and', args }),
  or: (...args: unknown[]) => ({ _type: 'or', args }),
  asc: (col: unknown) => ({ _type: 'asc', col }),
  desc: (col: unknown) => ({ _type: 'desc', col }),
  eq: (col: unknown, val: unknown) => ({ _type: 'eq', col, val }),
  inArray: (col: unknown, vals: unknown[]) => ({ _type: 'inArray', col, vals }),
  isNotNull: (col: unknown) => ({ _type: 'isNotNull', col }),
  sql: () => ({ _type: 'sql' }),
}));

// AUTHZ: the mutation path opens an unscoped transaction and scopes inside it.
vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: vi.fn(() => ({
    transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        execute: async () => [{ now: new Date('2026-06-01T00:00:00Z') }],
        insert: () => ({ values: async () => [] }),
      }),
  })),
}));

import { AppError, ForbiddenError } from '@/lib/api/errors';
import {
  castElectionVoteForCommunity,
  createElectionProxyForCommunity,
  getMyElectionVoteReceiptForCommunity,
  listElectionProxiesForCommunity,
} from '@/lib/services/elections-service';
import { listActorOwnedUnitIds } from '@/lib/units/actor-units';
import type { ScopedClient } from '@propertypro/db';

const COMMUNITY_ID = 42;
const ELECTION_ID = 3;
const UNIT_A = 11;
const UNIT_B = 12;

const OWNER = 'owner-a'; // recorded owner of unit A
const CO_OWNER = 'co-owner-a'; // owner membership on unit A, not the recorded owner
const TENANT = 'tenant-a'; // rents unit A
const HOLDER = 'holder-1'; // tenant of unit B, holds unit A's approved proxy
const OWNER_B = 'owner-b'; // recorded owner of unit B, named a (pending) proxy
const MANAGER = 'manager-1';

function seed() {
  db.nextId = 1000;
  db.tables = {
    elections: [
      {
        id: ELECTION_ID,
        communityId: COMMUNITY_ID,
        title: 'Board election',
        description: null,
        electionType: 'board_election',
        status: 'open',
        isSecretBallot: true,
        ballotSalt: 'salt-1',
        maxSelections: 1,
        opensAt: new Date('2026-01-01T00:00:00Z'),
        closesAt: new Date('2099-01-01T00:00:00Z'),
        quorumPercentage: 50,
        eligibleUnitCount: 2,
        totalBallotsCast: 0,
        certifiedByUserId: null,
        certifiedAt: null,
        resultsDocumentId: null,
        canceledReason: null,
        createdByUserId: MANAGER,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
    ],
    election_candidates: [{ id: 7, electionId: ELECTION_ID }],
    election_eligibility_snapshots: [
      { id: 1, electionId: ELECTION_ID, unitId: UNIT_A, ownerUserId: OWNER, isEligible: true },
      { id: 2, electionId: ELECTION_ID, unitId: UNIT_B, ownerUserId: OWNER_B, isEligible: true },
    ],
    units: [
      { id: UNIT_A, ownerUserId: OWNER },
      { id: UNIT_B, ownerUserId: OWNER_B },
    ],
    user_roles: [
      { userId: OWNER, role: 'resident', isUnitOwner: true, unitId: UNIT_A },
      { userId: CO_OWNER, role: 'resident', isUnitOwner: true, unitId: UNIT_A },
      { userId: TENANT, role: 'resident', isUnitOwner: false, unitId: UNIT_A },
      { userId: HOLDER, role: 'resident', isUnitOwner: false, unitId: UNIT_B },
      { userId: OWNER_B, role: 'resident', isUnitOwner: true, unitId: UNIT_B },
      { userId: MANAGER, role: 'property_manager', isUnitOwner: false, unitId: null },
    ],
    election_proxies: [
      {
        id: 21,
        electionId: ELECTION_ID,
        grantorUserId: OWNER,
        grantorUnitId: UNIT_A,
        proxyHolderUserId: HOLDER,
        status: 'approved',
      },
      {
        id: 22,
        electionId: ELECTION_ID,
        grantorUserId: OWNER_B,
        grantorUnitId: UNIT_B,
        proxyHolderUserId: 'someone-else',
        status: 'pending',
      },
    ],
    election_ballot_submissions: [],
    election_ballots: [],
  };
}

function submissions(): Row[] {
  return db.tables.election_ballot_submissions ?? [];
}

function vote(actor: string, extra: { unitId?: number | null; proxyId?: number | null } = {}) {
  return castElectionVoteForCommunity(COMMUNITY_ID, ELECTION_ID, actor, {
    selectedCandidateIds: [7],
    ...extra,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  seed();
});

describe('listActorOwnedUnitIds', () => {
  const scoped = scopedClient as unknown as ScopedClient;

  it('returns the recorded owner\'s unit', async () => {
    expect(await listActorOwnedUnitIds(scoped, OWNER)).toEqual([UNIT_A]);
  });

  it('returns a co-owner\'s unit from their owner membership', async () => {
    expect(await listActorOwnedUnitIds(scoped, CO_OWNER)).toEqual([UNIT_A]);
  });

  it('returns nothing for a tenant, though the tenant lives in the unit', async () => {
    expect(await listActorOwnedUnitIds(scoped, TENANT)).toEqual([]);
  });
});

describe('castElectionVoteForCommunity — owners or approved proxy holders only', () => {
  it('records the recorded owner\'s ballot for their unit', async () => {
    const receipt = await vote(OWNER);
    expect(receipt).toMatchObject({ hasVoted: true, viaProxy: false });
    expect(submissions()).toEqual([
      expect.objectContaining({ unitId: UNIT_A, submittedByUserId: OWNER, isProxyVote: false }),
    ]);
  });

  it('lets a co-owner vote the unit they co-own', async () => {
    await vote(CO_OWNER, { unitId: UNIT_A });
    expect(submissions()).toEqual([
      expect.objectContaining({ unitId: UNIT_A, submittedByUserId: CO_OWNER }),
    ]);
  });

  it('refuses a tenant (403) and records nothing', async () => {
    const error = await vote(TENANT).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ForbiddenError);
    expect(error).toMatchObject({ message: 'Only unit owners can vote in association elections' });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('refuses a tenant naming the unit they rent (403)', async () => {
    const error = await vote(TENANT, { unitId: UNIT_A }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ForbiddenError);
    expect(error).toMatchObject({ message: 'You are not authorized to vote for that unit' });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('lets an approved proxy holder vote the grantor\'s unit, though they own nothing', async () => {
    const receipt = await vote(HOLDER, { proxyId: 21 });
    expect(receipt).toMatchObject({ hasVoted: true });
    expect(submissions()).toEqual([
      expect.objectContaining({ unitId: UNIT_A, submittedByUserId: HOLDER, isProxyVote: true, proxyId: 21 }),
    ]);
  });

  it('refuses a proxy the actor does not hold (403)', async () => {
    const error = await vote(TENANT, { proxyId: 21 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ForbiddenError);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('keeps one ballot per unit: a co-owner cannot cast a second, different ballot', async () => {
    db.tables.election_candidates!.push({ id: 8, electionId: ELECTION_ID });
    await vote(OWNER);
    const error = await castElectionVoteForCommunity(COMMUNITY_ID, ELECTION_ID, CO_OWNER, {
      selectedCandidateIds: [8],
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ statusCode: 409 });
    expect(submissions()).toHaveLength(1);
  });
});

describe('createElectionProxyForCommunity — only an owner can give their vote away', () => {
  function designate(actor: string, grantorUnitId?: number) {
    return createElectionProxyForCommunity(COMMUNITY_ID, ELECTION_ID, actor, {
      proxyHolderUserId: 'holder-2',
      grantorUnitId: grantorUnitId ?? null,
    });
  }

  it('records an owner\'s designation for their unit', async () => {
    db.tables.election_proxies = [];
    const proxy = await designate(OWNER);
    expect(proxy).toMatchObject({ grantorUserId: OWNER, grantorUnitId: UNIT_A, status: 'pending' });
  });

  it('lets a co-owner designate for the unit they co-own', async () => {
    db.tables.election_proxies = [];
    const proxy = await designate(CO_OWNER, UNIT_A);
    expect(proxy).toMatchObject({ grantorUserId: CO_OWNER, grantorUnitId: UNIT_A });
  });

  it('refuses a tenant (403) and records nothing', async () => {
    const error = await designate(TENANT).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ForbiddenError);
    expect(error).toMatchObject({ message: 'Only unit owners can designate a proxy' });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('refuses a tenant naming the unit they rent (403)', async () => {
    const error = await designate(TENANT, UNIT_A).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ForbiddenError);
    expect(insertSpy).not.toHaveBeenCalled();
  });
});

describe('getMyElectionVoteReceiptForCommunity — the owner\'s receipt stays the owner\'s', () => {
  beforeEach(async () => {
    await vote(OWNER);
  });

  it('shows the owner their unit\'s receipt', async () => {
    const receipt = await getMyElectionVoteReceiptForCommunity(COMMUNITY_ID, ELECTION_ID, OWNER);
    expect(receipt).toMatchObject({
      hasVoted: true,
      submissionFingerprint: submissions()[0]!.submissionFingerprint,
    });
  });

  it('shows a co-owner the unit\'s receipt', async () => {
    const receipt = await getMyElectionVoteReceiptForCommunity(COMMUNITY_ID, ELECTION_ID, CO_OWNER);
    expect(receipt).toMatchObject({ hasVoted: true });
  });

  it('does not show a tenant the owner\'s receipt', async () => {
    const receipt = await getMyElectionVoteReceiptForCommunity(COMMUNITY_ID, ELECTION_ID, TENANT);
    expect(receipt).toMatchObject({
      hasVoted: false,
      submittedAt: null,
      submissionFingerprint: null,
      viaProxy: false,
    });
  });
});

describe('listElectionProxiesForCommunity — participants see their own designations', () => {
  async function ids(options?: { participantUserId?: string }) {
    const rows = await listElectionProxiesForCommunity(COMMUNITY_ID, ELECTION_ID, options);
    return rows.map((row) => row.id).sort();
  }

  it('lists every designation, pending included, when no participant is named (the board)', async () => {
    expect(await ids()).toEqual([21, 22]);
  });

  it('shows a grantor only the designation they gave', async () => {
    expect(await ids({ participantUserId: OWNER })).toEqual([21]);
  });

  it('shows a holder only the designation they hold', async () => {
    expect(await ids({ participantUserId: HOLDER })).toEqual([21]);
  });

  it('shows an uninvolved resident nothing', async () => {
    expect(await ids({ participantUserId: TENANT })).toEqual([]);
  });
});
