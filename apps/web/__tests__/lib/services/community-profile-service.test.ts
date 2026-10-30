import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
  createScopedClientMock,
  logAuditEventMock,
  queryMock,
  updateMock,
  updateCommunityContactMock,
  transactionMock,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  queryMock: vi.fn(),
  updateMock: vi.fn(),
  updateCommunityContactMock: vi.fn(),
  transactionMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  logAuditEvent: logAuditEventMock,
  communities: { id: 'communities.id', name: 'communities.name' },
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
}));

vi.mock('@/lib/services/community-contact-service', () => ({
  updateCommunityContact: updateCommunityContactMock,
}));

// The profile save opens its transaction through the unscoped client, as
// resident-service does; the stand-in below decides what a transaction does.
vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: () => ({ transaction: transactionMock }),
}));

import {
  getCommunityName,
  getCommunityProfile,
  getCommunityUnitCount,
  updateCommunityName,
  updateCommunityProfile,
  updateCommunityUnitCount,
} from '@/lib/services/community-profile-service';

beforeEach(() => {
  vi.clearAllMocks();
  createScopedClientMock.mockReturnValue({ query: queryMock, update: updateMock });
  logAuditEventMock.mockResolvedValue(undefined);
});

describe('getCommunityName', () => {
  it('returns the row name', async () => {
    queryMock.mockResolvedValueOnce([{ name: 'Sunset Condos' }]);
    expect(await getCommunityName(42)).toBe('Sunset Condos');
  });

  it('returns null when the row is missing', async () => {
    queryMock.mockResolvedValueOnce([]);
    expect(await getCommunityName(42)).toBeNull();
  });
});

describe('updateCommunityName', () => {
  it('writes the new name and emits a community update audit entry', async () => {
    queryMock.mockResolvedValueOnce([{ name: 'Old Name' }]); // previous
    updateMock.mockResolvedValueOnce([{ name: 'New Name' }]);

    const result = await updateCommunityName(42, 'New Name', { actorUserId: 'user-1' });

    expect(result).toEqual({ name: 'New Name', changed: true });
    expect(updateMock).toHaveBeenCalledWith(
      { id: 'communities.id', name: 'communities.name' },
      { name: 'New Name' },
      { __eq: { col: 'communities.id', val: 42 } },
    );
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        communityId: 42,
        action: 'update',
        resourceType: 'community',
        resourceId: '42',
        oldValues: { name: 'Old Name' },
        newValues: { name: 'New Name' },
      }),
    );
  });

  it('no-ops (no write, no audit) when the name is unchanged', async () => {
    queryMock.mockResolvedValueOnce([{ name: 'Same Name' }]);

    const result = await updateCommunityName(42, 'Same Name', { actorUserId: 'user-1' });

    expect(result).toEqual({ name: 'Same Name', changed: false });
    expect(updateMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });
});

describe('updateCommunityUnitCount', () => {
  it('records the first count, auditing unknown -> value', async () => {
    queryMock.mockResolvedValueOnce([{ unitCount: null }]);
    updateMock.mockResolvedValueOnce([]);

    const result = await updateCommunityUnitCount(42, 40, { actorUserId: 'user-1' });

    expect(result).toEqual({ unitCount: 40, changed: true });
    expect(updateMock).toHaveBeenCalledWith(
      expect.anything(),
      { unitCount: 40 },
      { __eq: { col: 'communities.id', val: 42 } },
    );
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        communityId: 42,
        resourceType: 'community',
        oldValues: { unitCount: null },
        newValues: { unitCount: 40 },
      }),
    );
  });

  it('no-ops (no write, no audit) when the count is unchanged', async () => {
    queryMock.mockResolvedValueOnce([{ unitCount: 40 }]);

    expect(await updateCommunityUnitCount(42, 40, { actorUserId: 'user-1' })).toEqual({
      unitCount: 40,
      changed: false,
    });
    expect(updateMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('reads an unknown count as null', async () => {
    queryMock.mockResolvedValueOnce([{ unitCount: null }]);
    expect(await getCommunityUnitCount(42)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The executor parameter: how a caller's transaction reaches the name writer.
// ---------------------------------------------------------------------------

describe('updateCommunityName and getCommunityName with an executor', () => {
  const EXECUTOR = { executor: 'a transaction handle' };

  it('getCommunityName reads through the executor it is given', async () => {
    queryMock.mockResolvedValueOnce([{ name: 'Sunset Condos' }]);

    expect(await getCommunityName(42, EXECUTOR as never)).toBe('Sunset Condos');
    expect(createScopedClientMock).toHaveBeenCalledWith(42, EXECUTOR);
  });

  it('updateCommunityName reads, writes and audits through the executor it is given', async () => {
    queryMock.mockResolvedValueOnce([{ name: 'Old Name' }]);
    updateMock.mockResolvedValueOnce([{ name: 'New Name' }]);

    await updateCommunityName(42, 'New Name', { actorUserId: 'user-1' }, EXECUTOR as never);

    // The read of the old name and the write each built their scoped client on it.
    expect(createScopedClientMock.mock.calls).toEqual([
      [42, EXECUTOR],
      [42, EXECUTOR],
    ]);
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceType: 'community',
        oldValues: { name: 'Old Name' },
        newValues: { name: 'New Name' },
      }),
      EXECUTOR,
    );
  });

  it('without an executor, writes on the pool and calls the audit exactly as before', async () => {
    queryMock.mockResolvedValueOnce([{ name: 'Old Name' }]);
    updateMock.mockResolvedValueOnce([{ name: 'New Name' }]);

    await updateCommunityName(42, 'New Name', { actorUserId: 'user-1' });

    expect(createScopedClientMock.mock.calls.map((call) => call[1])).toEqual([undefined, undefined]);
    expect(logAuditEventMock.mock.calls[0]).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// The community profile: one read, and one save that fans out to the three
// places the columns are owned (updateCommunityName, updateCommunityContact,
// and the profile's own UPDATE) and writes the audit row for what they do not.
//
// The save is ONE transaction. The stand-in database below has two layers, what
// is committed and what the open transaction has done so far, so a case can ask
// what survives a failure:
//   - a statement given the transaction handle lands in the transaction's layer,
//     and is kept on COMMIT (the callback resolves) or dropped on ROLLBACK (it
//     throws);
//   - a statement given anything else runs on the pool, lands in the committed
//     layer at once, and is recorded in `ranOnThePool`. That is how one write
//     drifting out of the transaction shows up: as a commit a rollback does not
//     undo.
// `statements` records every statement in order, so a failure case can also show
// that the statements before the failing one really ran before being discarded.
//
// This is a model, so it proves WHICH statements go through the transaction
// handle. That Postgres really rolls them back, and that they share one
// transaction id, is proven in `integration/community-profile.integration.test.ts`.
// ---------------------------------------------------------------------------

const TX = Symbol('transaction');
const TABLE = { id: 'communities.id', name: 'communities.name' };
const WHERE_ID_42 = { __eq: { col: 'communities.id', val: 42 } };

/** A communities row: the twelve profile columns, plus columns that are not the profile's to expose. */
const COMMUNITY_ROW = {
  id: 42,
  name: 'Sunset Condos',
  shortName: null,
  addressLine1: '100 Ocean Drive',
  addressLine2: null,
  city: 'Miami',
  state: 'FL',
  zipCode: '33139',
  unitCount: 60,
  officeHours: null,
  contactName: null,
  contactEmail: null,
  contactPhone: null,
  slug: 'sunset-condos',
  stripeCustomerId: 'cus_123',
};

type Statement =
  | 'read'
  | 'read-back'
  | 'name-write'
  | 'name-audit'
  | 'contact-write'
  | 'profile-write'
  | 'profile-audit';

type Audit = Record<string, unknown>;

let committedRow: Record<string, unknown>;
let committedAudits: Audit[];
let open: { changes: Record<string, unknown>; audits: Audit[] } | null;
let statements: Statement[];
let ranOnThePool: Statement[];
let failAt: Statement | null;
let communityIsGone: boolean;

/** Record a statement, and fail it if this case asked for that. Returns whether it ran on the transaction. */
function run(statement: Statement, executor: unknown): boolean {
  const onTransaction = executor === TX;
  statements.push(statement);
  if (onTransaction && !open) throw new Error(`${statement} ran on a transaction that had already ended`);
  if (!onTransaction && open) ranOnThePool.push(statement);
  if (failAt === statement) throw new Error(`injected failure at ${statement}`);
  return onTransaction;
}

function readRows(executor: unknown): Array<Record<string, unknown>> {
  // The read after the profile audit row is the read-back.
  const afterTheAudit = open?.audits.some((audit) => audit['resourceType'] === 'community_profile');
  const onTransaction = run(afterTheAudit && executor === TX ? 'read-back' : 'read', executor);
  if (communityIsGone) return [];
  return [{ ...committedRow, ...(onTransaction ? open!.changes : {}) }];
}

function writeRow(statement: Statement, data: Record<string, unknown>, executor: unknown): Record<string, unknown> {
  if (run(statement, executor)) {
    Object.assign(open!.changes, data);
    return { ...committedRow, ...open!.changes };
  }
  Object.assign(committedRow, data); // on the pool: committed at once
  return { ...committedRow };
}

/** Make the scoped client, the contact writer, the audit and the transaction share one row. */
function useCommunityRow(initial: Record<string, unknown>): void {
  committedRow = { ...initial };
  committedAudits = [];
  open = null;
  statements = [];
  ranOnThePool = [];
  failAt = null;
  communityIsGone = false;

  createScopedClientMock.mockImplementation((_communityId: number, executor?: unknown) => ({
    query: async () => {
      queryMock();
      return readRows(executor);
    },
    update: async (table: unknown, data: Record<string, unknown>, where: unknown) => {
      updateMock(table, data, where);
      return [writeRow('name' in data ? 'name-write' : 'profile-write', data, executor)];
    },
  }));
  updateCommunityContactMock.mockImplementation(
    async (_communityId: number, patch: Record<string, unknown>, executor?: unknown) => ({
      updateData: patch,
      contact: writeRow('contact-write', patch, executor),
    }),
  );
  logAuditEventMock.mockImplementation(async (entry: Audit, executor?: unknown) => {
    const onTransaction = run(entry['resourceType'] === 'community_profile' ? 'profile-audit' : 'name-audit', executor);
    (onTransaction ? open!.audits : committedAudits).push(entry);
  });
  transactionMock.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
    open = { changes: {}, audits: [] };
    try {
      const result = await callback(TX);
      Object.assign(committedRow, open.changes); // COMMIT
      committedAudits.push(...open.audits);
      return result;
    } finally {
      open = null; // a throw above skips the commit lines: ROLLBACK
    }
  });
}

/** The audit rows the profile itself wrote (updateCommunityName writes its own, as `community`). */
function profileAudits(): Array<Record<string, unknown>> {
  return logAuditEventMock.mock.calls
    .map(([entry]) => entry as Record<string, unknown>)
    .filter((entry) => entry['resourceType'] === 'community_profile');
}

/** The stand-ins above must not leak into any case that queues its own rows. */
function resetStandIns(): void {
  queryMock.mockReset();
  updateMock.mockReset();
  updateCommunityContactMock.mockReset();
  transactionMock.mockReset();
}

describe('getCommunityProfile', () => {
  afterEach(resetStandIns);

  it('returns the twelve profile fields and no other column', async () => {
    useCommunityRow({
      ...COMMUNITY_ROW,
      shortName: 'Sunset',
      addressLine2: 'Suite 4',
      officeHours: 'Mon–Fri, 9–5',
      contactName: 'Jane Manager',
      contactEmail: 'office@sunset.example',
      contactPhone: '305-555-0100',
    });

    expect(await getCommunityProfile(42)).toEqual({
      name: 'Sunset Condos',
      shortName: 'Sunset',
      addressLine1: '100 Ocean Drive',
      addressLine2: 'Suite 4',
      city: 'Miami',
      state: 'FL',
      zipCode: '33139',
      unitCount: 60,
      officeHours: 'Mon–Fri, 9–5',
      contactName: 'Jane Manager',
      contactEmail: 'office@sunset.example',
      contactPhone: '305-555-0100',
    });
    // A plain read: on the pool, and no transaction.
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('reads a column that was never set as null, and an unknown count as null', async () => {
    queryMock.mockResolvedValueOnce([{ name: 'Sunset Condos', unitCount: null }]);

    expect(await getCommunityProfile(42)).toEqual({
      name: 'Sunset Condos',
      shortName: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      state: null,
      zipCode: null,
      unitCount: null,
      officeHours: null,
      contactName: null,
      contactEmail: null,
      contactPhone: null,
    });
  });

  it('throws NotFound when the community is missing', async () => {
    queryMock.mockResolvedValueOnce([]);

    await expect(getCommunityProfile(42)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('updateCommunityProfile', () => {
  beforeEach(() => useCommunityRow(COMMUNITY_ROW));
  afterEach(resetStandIns);

  it('writes the fields it is given in one UPDATE and returns the profile as it now stands', async () => {
    const profile = await updateCommunityProfile(
      42,
      { officeHours: 'Mon–Fri, 9–5', zipCode: '33140' },
      { actorUserId: 'user-1' },
    );

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith(
      TABLE,
      { officeHours: 'Mon–Fri, 9–5', zipCode: '33140' },
      WHERE_ID_42,
    );
    expect(profile).toMatchObject({ officeHours: 'Mon–Fri, 9–5', zipCode: '33140', city: 'Miami' });
    // What it hands back is the twelve fields, not the row.
    expect(Object.keys(profile)).toHaveLength(12);
  });

  it('routes a rename through updateCommunityName and contact fields through updateCommunityContact', async () => {
    const profile = await updateCommunityProfile(
      42,
      {
        name: 'Sunset Condominiums',
        contactName: 'Jane Manager',
        contactEmail: 'office@sunset.example',
        officeHours: 'Mon–Fri, 9–5',
      },
      { actorUserId: 'user-1' },
    );

    // The rename is updateCommunityName's: a { name }-only UPDATE and its own
    // `community` audit row, old to new.
    expect(updateMock).toHaveBeenCalledWith(TABLE, { name: 'Sunset Condominiums' }, WHERE_ID_42);
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        communityId: 42,
        action: 'update',
        resourceType: 'community',
        resourceId: '42',
        oldValues: { name: 'Sunset Condos' },
        newValues: { name: 'Sunset Condominiums' },
      }),
      TX,
    );

    // The contact fields are updateCommunityContact's, on the transaction.
    expect(updateCommunityContactMock).toHaveBeenCalledTimes(1);
    expect(updateCommunityContactMock).toHaveBeenCalledWith(
      42,
      { contactName: 'Jane Manager', contactEmail: 'office@sunset.example' },
      TX,
    );

    // The profile's own UPDATE carries neither the name nor a contact field.
    expect(updateMock).toHaveBeenCalledWith(TABLE, { officeHours: 'Mon–Fri, 9–5' }, WHERE_ID_42);
    expect(updateMock).toHaveBeenCalledTimes(2);

    expect(profile).toMatchObject({
      name: 'Sunset Condominiums',
      contactName: 'Jane Manager',
      contactEmail: 'office@sunset.example',
      officeHours: 'Mon–Fri, 9–5',
    });
  });

  it('audits changed keys only', async () => {
    await updateCommunityProfile(
      42,
      {
        // unchanged: the city is already Miami, and the contact name is already unset
        city: 'Miami',
        contactName: null,
        // changed
        state: 'GA',
        officeHours: 'Mon–Fri, 9–5',
        contactPhone: '305-555-0100',
      },
      { actorUserId: 'user-1' },
    );

    // One row, old and new for exactly the keys that changed.
    expect(profileAudits()).toEqual([
      {
        userId: 'user-1',
        communityId: 42,
        action: 'update',
        resourceType: 'community_profile',
        resourceId: '42',
        oldValues: { state: 'FL', officeHours: null, contactPhone: null },
        newValues: { state: 'GA', officeHours: 'Mon–Fri, 9–5', contactPhone: '305-555-0100' },
      },
    ]);
    // And only those keys were written.
    expect(updateMock).toHaveBeenCalledWith(
      TABLE,
      { state: 'GA', officeHours: 'Mon–Fri, 9–5' },
      WHERE_ID_42,
    );
    expect(updateCommunityContactMock).toHaveBeenCalledWith(42, { contactPhone: '305-555-0100' }, TX);
  });

  it('leaves the name to updateCommunityName: a rename alone adds no profile audit row', async () => {
    await updateCommunityProfile(42, { name: 'Sunset Condominiums' }, { actorUserId: 'user-1' });

    expect(logAuditEventMock).toHaveBeenCalledTimes(1);
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ resourceType: 'community' }),
      TX,
    );
    expect(profileAudits()).toEqual([]);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateCommunityContactMock).not.toHaveBeenCalled();
  });

  it('writes nothing and audits nothing when no value differs from what is stored', async () => {
    const profile = await updateCommunityProfile(
      42,
      { name: 'Sunset Condos', city: 'Miami', state: 'FL', addressLine2: null, contactEmail: null },
      { actorUserId: 'user-1' },
    );

    expect(updateMock).not.toHaveBeenCalled();
    expect(updateCommunityContactMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
    expect(profile.name).toBe('Sunset Condos');
  });

  it('writes nothing for an empty patch', async () => {
    await updateCommunityProfile(42, {}, { actorUserId: 'user-1' });

    expect(updateMock).not.toHaveBeenCalled();
    expect(updateCommunityContactMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('clears a field with null, auditing the old value to null', async () => {
    const profile = await updateCommunityProfile(42, { addressLine1: null }, { actorUserId: 'user-1' });

    expect(updateMock).toHaveBeenCalledWith(TABLE, { addressLine1: null }, WHERE_ID_42);
    expect(profileAudits()).toHaveLength(1);
    expect(profileAudits()[0]).toMatchObject({
      oldValues: { addressLine1: '100 Ocean Drive' },
      newValues: { addressLine1: null },
    });
    expect(profile.addressLine1).toBeNull();
  });

  it('leaves a field alone when it is undefined, rather than clearing it', async () => {
    await updateCommunityProfile(42, { city: undefined, state: 'GA' }, { actorUserId: 'user-1' });

    expect(updateMock).toHaveBeenCalledWith(TABLE, { state: 'GA' }, WHERE_ID_42);
    expect(committedRow['city']).toBe('Miami');
  });

  it('never writes a column outside the profile, even if a caller sneaks one in', async () => {
    await updateCommunityProfile(
      42,
      { unitCount: 5, slug: 'taken', stripeCustomerId: 'cus_evil' } as never,
      { actorUserId: 'user-1' },
    );

    expect(updateMock).not.toHaveBeenCalled();
    expect(updateCommunityContactMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
    expect(committedRow).toMatchObject({ unitCount: 60, slug: 'sunset-condos', stripeCustomerId: 'cus_123' });
  });

  it('throws NotFound before writing anything when the community is missing', async () => {
    communityIsGone = true;

    await expect(
      updateCommunityProfile(42, { name: 'Sunset Condominiums', city: 'Doral' }, { actorUserId: 'user-1' }),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(statements).toEqual(['read']);
    expect(updateMock).not.toHaveBeenCalled();
    expect(updateCommunityContactMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });
});

describe('updateCommunityProfile is one transaction', () => {
  beforeEach(() => useCommunityRow(COMMUNITY_ROW));
  afterEach(resetStandIns);

  /** Touches all three writers, so both audit rows are written. */
  const EVERYTHING = {
    name: 'Sunset Condominiums',
    contactName: 'Jane Manager',
    city: 'Doral',
    officeHours: 'Mon–Fri, 9–5',
  };

  it('commits the rename, the contact fields, the other fields and both audit rows together', async () => {
    await updateCommunityProfile(42, EVERYTHING, { actorUserId: 'user-1' });

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(committedRow).toMatchObject(EVERYTHING);
    expect(committedAudits.map((audit) => audit['resourceType'])).toEqual(['community', 'community_profile']);
    // In order: read the profile, read the old name, then the three writers,
    // each audit straight after its write, and the read-back last.
    expect(statements).toEqual([
      'read',
      'read',
      'name-write',
      'name-audit',
      'contact-write',
      'profile-write',
      'profile-audit',
      'read-back',
    ]);
  });

  it('runs every read, write and audit insert on the transaction, and none on the pool', async () => {
    await updateCommunityProfile(42, EVERYTHING, { actorUserId: 'user-1' });

    expect(ranOnThePool).toEqual([]);
    // The pool is small: a statement that waited for a second connection while
    // the transaction held one could starve it. So reads count as well as writes.
    expect(createScopedClientMock.mock.calls.map((call) => call[1])).toEqual(
      createScopedClientMock.mock.calls.map(() => TX),
    );
    expect(logAuditEventMock.mock.calls.map((call) => call[1])).toEqual([TX, TX]);
    expect(updateCommunityContactMock.mock.calls.map((call) => call[2])).toEqual([TX]);
  });

  it.each([
    ['the rename write', 'name-write', ['read', 'read', 'name-write']],
    ['the rename audit insert', 'name-audit', ['read', 'read', 'name-write', 'name-audit']],
    ['the contact write', 'contact-write', ['read', 'read', 'name-write', 'name-audit', 'contact-write']],
    // A write that has committed, then a later one that throws: the case a retry could not repair.
    [
      'the profile UPDATE',
      'profile-write',
      ['read', 'read', 'name-write', 'name-audit', 'contact-write', 'profile-write'],
    ],
    // The audit insert itself failing must take every write with it.
    [
      'the profile audit insert',
      'profile-audit',
      ['read', 'read', 'name-write', 'name-audit', 'contact-write', 'profile-write', 'profile-audit'],
    ],
    [
      'the read-back',
      'read-back',
      ['read', 'read', 'name-write', 'name-audit', 'contact-write', 'profile-write', 'profile-audit', 'read-back'],
    ],
  ] as Array<[string, Statement, Statement[]]>)(
    'rolls everything back, rows and audit rows, when %s fails',
    async (_label, failing, ranBeforeAndAt) => {
      failAt = failing;

      await expect(updateCommunityProfile(42, EVERYTHING, { actorUserId: 'user-1' })).rejects.toThrow(
        `injected failure at ${failing}`,
      );

      // The earlier statements really ran, and were then discarded with the rest.
      expect(statements).toEqual(ranBeforeAndAt);
      expect(committedRow).toEqual(COMMUNITY_ROW);
      expect(committedAudits).toEqual([]);
      expect(ranOnThePool).toEqual([]);
    },
  );

  it('leaves a failed save for a plain retry: the retry writes and audits once, not twice', async () => {
    failAt = 'profile-write';
    await expect(updateCommunityProfile(42, EVERYTHING, { actorUserId: 'user-1' })).rejects.toThrow();

    failAt = null;
    await updateCommunityProfile(42, EVERYTHING, { actorUserId: 'user-1' });

    expect(committedRow).toMatchObject(EVERYTHING);
    // Both audit rows, once each. Before the save was a transaction, the contact
    // write from the failed attempt stayed committed and the retry never audited it.
    expect(committedAudits.map((audit) => audit['resourceType'])).toEqual(['community', 'community_profile']);
    expect(committedAudits[1]).toMatchObject({
      oldValues: { contactName: null, city: 'Miami', officeHours: null },
      newValues: { contactName: 'Jane Manager', city: 'Doral', officeHours: 'Mon–Fri, 9–5' },
    });
  });
});
