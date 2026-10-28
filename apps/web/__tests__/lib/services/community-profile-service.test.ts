import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
  createScopedClientMock,
  logAuditEventMock,
  queryMock,
  updateMock,
  updateCommunityContactMock,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  queryMock: vi.fn(),
  updateMock: vi.fn(),
  updateCommunityContactMock: vi.fn(),
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
// The community profile: one read, and one write that fans out to the three
// places the columns are owned (updateCommunityName, updateCommunityContact,
// and the profile's own UPDATE).
//
// These use a small in-memory stand-in for the communities row rather than a
// queue of `mockResolvedValueOnce` rows: the service reads before it writes and
// again afterwards, and a stand-in lets each case assert what was WRITTEN and
// what the caller was handed back, without counting reads.
// ---------------------------------------------------------------------------

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

let row: Record<string, unknown>;

/** Make the scoped client and the contact service read and write one shared row. */
function useCommunityRow(initial: Record<string, unknown>): void {
  row = { ...initial };
  queryMock.mockImplementation(async () => [{ ...row }]);
  updateMock.mockImplementation(async (_table: unknown, data: Record<string, unknown>) => {
    Object.assign(row, data);
    return [{ ...row }];
  });
  updateCommunityContactMock.mockImplementation(async (_id: number, patch: Record<string, unknown>) => {
    Object.assign(row, patch);
    return { updateData: patch, contact: {} };
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
    );

    // The contact fields are updateCommunityContact's.
    expect(updateCommunityContactMock).toHaveBeenCalledTimes(1);
    expect(updateCommunityContactMock).toHaveBeenCalledWith(42, {
      contactName: 'Jane Manager',
      contactEmail: 'office@sunset.example',
    });

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
    expect(updateCommunityContactMock).toHaveBeenCalledWith(42, { contactPhone: '305-555-0100' });
  });

  it('leaves the name to updateCommunityName: a rename alone adds no profile audit row', async () => {
    await updateCommunityProfile(42, { name: 'Sunset Condominiums' }, { actorUserId: 'user-1' });

    expect(logAuditEventMock).toHaveBeenCalledTimes(1);
    expect(logAuditEventMock).toHaveBeenCalledWith(expect.objectContaining({ resourceType: 'community' }));
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
    expect(row['city']).toBe('Miami');
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
    expect(row).toMatchObject({ unitCount: 60, slug: 'sunset-condos', stripeCustomerId: 'cus_123' });
  });

  it('throws NotFound before writing anything when the community is missing', async () => {
    queryMock.mockReset();
    queryMock.mockResolvedValue([]);

    await expect(
      updateCommunityProfile(42, { name: 'Sunset Condominiums', city: 'Doral' }, { actorUserId: 'user-1' }),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(updateMock).not.toHaveBeenCalled();
    expect(updateCommunityContactMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('has already audited the change when the read after it fails', async () => {
    queryMock.mockReset();
    queryMock
      .mockResolvedValueOnce([{ ...row }]) // the read before the writes
      .mockRejectedValueOnce(new Error('connection lost')); // the read after them

    await expect(
      updateCommunityProfile(42, { officeHours: 'Mon–Fri, 9–5' }, { actorUserId: 'user-1' }),
    ).rejects.toThrow('connection lost');

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(profileAudits()).toHaveLength(1);
    expect(profileAudits()[0]).toMatchObject({ newValues: { officeHours: 'Mon–Fri, 9–5' } });
  });
});
