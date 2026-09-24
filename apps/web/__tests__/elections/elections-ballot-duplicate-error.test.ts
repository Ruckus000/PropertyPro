import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  queryMock,
  txExecuteMock,
  valuesMock,
  insertMock,
  updateMock,
  selectFromMock,
  tables,
} = vi.hoisted(() => {
    const table = (name: string) => ({
      __table: name,
      id: Symbol(`${name}.id`),
      electionId: Symbol(`${name}.election_id`),
      unitId: Symbol(`${name}.unit_id`),
    });
    return {
      queryMock: vi.fn(),
      txExecuteMock: vi.fn(),
      valuesMock: vi.fn(async () => []),
      insertMock: vi.fn(),
      updateMock: vi.fn(),
      selectFromMock: vi.fn(),
      tables: {
        elections: table('elections'),
        electionCandidates: table('election_candidates'),
        electionBallotSubmissions: table('election_ballot_submissions'),
        electionBallots: table('election_ballots'),
        electionEligibilitySnapshots: table('election_eligibility_snapshots'),
        electionProxies: table('election_proxies'),
        complianceAuditLog: table('compliance_audit_log'),
        units: table('units'),
      },
    };
  });

const scopedClient = () => ({
  selectFrom: selectFromMock,
  insert: insertMock,
  update: updateMock,
});

vi.mock('@propertypro/db', () => ({
  createScopedClient: vi.fn(() => scopedClient()),
  complianceAuditLog: tables.complianceAuditLog,
  electionBallotSubmissions: tables.electionBallotSubmissions,
  electionBallots: tables.electionBallots,
  electionCandidates: tables.electionCandidates,
  electionEligibilitySnapshots: tables.electionEligibilitySnapshots,
  electionProxies: tables.electionProxies,
  elections: tables.elections,
  units: tables.units,
}));

// The service builds WHERE clauses through these; identity stubs keep the
// assertions about which table was read independent of operator semantics.
vi.mock('@propertypro/db/filters', () => ({
  and: (...args: unknown[]) => ({ _type: 'and', args }),
  asc: (col: unknown) => ({ _type: 'asc', col }),
  desc: (col: unknown) => ({ _type: 'desc', col }),
  eq: (col: unknown, val: unknown) => ({ _type: 'eq', col, val }),
  inArray: (col: unknown, vals: unknown[]) => ({ _type: 'inArray', col, vals }),
  sql: (strings: unknown) => ({ _type: 'sql', strings }),
}));

// AUTHZ: the mutation path opens an unscoped transaction and scopes inside it.
vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: vi.fn(() => ({
    transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        execute: txExecuteMock,
        // The audit insert is `tx.insert(table).values(payload)`.
        insert: () => ({ values: valuesMock }),
        selectFrom: selectFromMock,
        update: updateMock,
      }),
  })),
}));

vi.mock('@/lib/units/actor-units', () => ({
  listActorUnitIds: queryMock,
  requireActorUnitId: vi.fn(async () => 11),
}));

import { AppError } from '@/lib/api/errors';
import { castElectionVoteForCommunity } from '@/lib/services/elections-service';

const ACTOR = 'voter-user-1';
const ELECTION_ID = 3;
const UNIT_ID = 11;

function electionRow() {
  return {
    id: ELECTION_ID,
    communityId: 42,
    title: 'Board election',
    description: null,
    electionType: 'board',
    status: 'open',
    isSecretBallot: true,
    ballotSalt: 'salt-1',
    maxSelections: 1,
    opensAt: new Date('2026-01-01T00:00:00Z'),
    closesAt: new Date('2099-01-01T00:00:00Z'),
    quorumPercentage: 50,
    eligibleUnitCount: 10,
    totalBallotsCast: 0,
    certifiedByUserId: null,
    certifiedAt: null,
    resultsDocumentId: null,
    canceledReason: null,
    createdByUserId: 'root-user',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

/**
 * Drizzle's select builder is both awaitable and chainable, and the election
 * read uses `.for('update')`. A bare promise satisfies the first and breaks
 * the second, so the fake carries both.
 */
function selectResult(rows: unknown[]) {
  const promise = Promise.resolve(rows);
  return {
    for: () => promise,
    limit: () => promise,
    orderBy: () => promise,
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
  };
}

/** Route each read to the row its table expects. */
function stubHappyPathReads() {
  selectFromMock.mockImplementation((table: unknown) => {
    if (table === tables.elections) return selectResult([electionRow()]);
    if (table === tables.electionEligibilitySnapshots) {
      return selectResult([
        { id: 1, electionId: ELECTION_ID, unitId: UNIT_ID, isEligible: true },
      ]);
    }
    if (table === tables.electionCandidates) {
      return selectResult([{ id: 7, electionId: ELECTION_ID }]);
    }
    // getExistingSubmissionForUnit — no prior ballot, so the insert is reached.
    return selectResult([]);
  });
  updateMock.mockImplementation(async () => [electionRow()]);
  txExecuteMock.mockResolvedValue([{ now: new Date('2026-06-01T00:00:00Z') }]);
  queryMock.mockResolvedValue([UNIT_ID]);
}

function castVote() {
  return castElectionVoteForCommunity(42, ELECTION_ID, ACTOR, {
    selectedCandidateIds: [7],
    unitId: UNIT_ID,
  });
}

/**
 * SVC-06's highest-stakes branch: the §718.128 duplicate-ballot path.
 *
 * `castElectionVoteForCommunity` classifies the error thrown by the ballot
 * insert with the TOP-LEVEL unique-violation predicate, so the SHAPE of the
 * error decides whether the voter is told "your unit already voted" or the
 * request fails outright. These cases pin that decision from both sides.
 *
 * Revert-check for the family split: point the service at the cause-walking
 * `isUniqueConstraintError` instead (i.e. collapse family 2 into family 1) and
 * the wrapped case below stops re-throwing — it becomes a 409 claiming a
 * duplicate ballot the unit may never have cast. The opposite collapse
 * (dropping the cause walk) reddens the family-1 discriminators in
 * `__tests__/lib/db/postgres-error.test.ts` and the wrapped case in
 * `__tests__/site-editor/site-publish-schedule-service.test.ts`.
 */
describe('castElectionVoteForCommunity duplicate-ballot classification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubHappyPathReads();
  });

  it('turns a top-level 23505 into the 409 duplicate-ballot conflict', async () => {
    insertMock.mockRejectedValueOnce(
      Object.assign(
        new Error('duplicate key value violates unique constraint "election_ballot_submissions_unit_id_key"'),
        { code: '23505' },
      ),
    );

    const error = await castVote().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      statusCode: 409,
      message: 'This unit has already submitted a ballot for this election',
    });
  });

  it('re-throws a 23505 wrapped in `cause` rather than reporting a duplicate ballot', async () => {
    // This is the case the two predicate families disagree on. The service
    // must NOT classify it as a duplicate: a wrapped error is the driver
    // failing the QUERY, not the constraint rejecting the ballot, and the
    // insert may well have succeeded. Answering "you already voted" there
    // would be a wrong-but-200 on a statutory path.
    const wrapped = Object.assign(new Error('failed query'), {
      cause: Object.assign(new Error('duplicate key'), { code: '23505' }),
    });
    insertMock.mockRejectedValueOnce(wrapped);

    await expect(castVote()).rejects.toBe(wrapped);
  });

  it('does not turn an unrelated insert failure into a conflict', async () => {
    const boom = new Error('connection reset');
    insertMock.mockRejectedValueOnce(boom);

    await expect(castVote()).rejects.toBe(boom);
  });

  it('records the ballot when the insert succeeds', async () => {
    insertMock.mockResolvedValue([
      {
        id: 99,
        submittedAt: new Date('2026-06-01T00:00:00Z'),
        submissionFingerprint: 'fp',
        isProxyVote: false,
      },
    ]);

    const receipt = await castVote();
    expect(receipt).toMatchObject({ id: 99, hasVoted: true });
    expect(insertMock).toHaveBeenCalled();
    // The audit row is written inside the same transaction.
    expect(valuesMock).toHaveBeenCalledTimes(1);
  });
});
