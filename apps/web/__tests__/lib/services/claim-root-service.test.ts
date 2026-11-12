import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  createScopedClientMock,
  logAuditEventMock,
  selectFromMock,
  updateMock,
  findMyRootlessCommunitiesMock,
  notifyRootClaimedMock,
  claimRootOpMock,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  selectFromMock: vi.fn(),
  updateMock: vi.fn(),
  findMyRootlessCommunitiesMock: vi.fn(),
  notifyRootClaimedMock: vi.fn(),
  claimRootOpMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  logAuditEvent: logAuditEventMock,
  userRoles: {
    id: 'user_roles.id',
    userId: 'user_roles.user_id',
    role: 'user_roles.role',
    communityId: 'user_roles.community_id',
  },
}));

vi.mock('@propertypro/db/unsafe', () => ({
  findMyRootlessCommunities: findMyRootlessCommunitiesMock,
  claimRootOp: claimRootOpMock,
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
  and: (...clauses: unknown[]) => ({ __and: clauses }),
}));

vi.mock('@/lib/services/claim-root-notify', () => ({
  notifyRootClaimed: notifyRootClaimedMock,
}));

import { claimRoot, claimAllRoots } from '@/lib/services/claim-root-service';
import { ForbiddenError } from '@/lib/api/errors';
import { drizzleUniqueViolation } from '../../helpers/pg-errors';

beforeEach(() => {
  vi.clearAllMocks();
  createScopedClientMock.mockReturnValue({
    selectFrom: selectFromMock,
    update: updateMock,
  });
  logAuditEventMock.mockResolvedValue(undefined);
  notifyRootClaimedMock.mockResolvedValue(undefined);
  claimRootOpMock.mockResolvedValue({ outcome: 'kept' });
});

describe('claimRoot', () => {
  it('promotes a property_manager in a rootless community to root_manager', async () => {
    // (1) caller holds property_manager here
    selectFromMock.mockResolvedValueOnce([{ id: 7 }]);
    // (2) no existing root_manager
    selectFromMock.mockResolvedValueOnce([]);

    const result = await claimRoot('user-1', 42);

    expect(result).toEqual({ communityId: 42, claimed: true });
    expect(claimRootOpMock).toHaveBeenCalledWith(42, 'user-1');
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        communityId: 42,
        action: 'root_claimed',
        resourceType: 'community',
        resourceId: '42',
      }),
    );
    expect(notifyRootClaimedMock).toHaveBeenCalledWith(42, 'user-1');
  });

  it('records billing in the audit entry when the claim took over an orphaned group', async () => {
    selectFromMock.mockResolvedValueOnce([{ id: 7 }]);
    selectFromMock.mockResolvedValueOnce([]);
    claimRootOpMock.mockResolvedValueOnce({ outcome: 'moved', billingGroupId: 5, previousOwnerUserId: 'gone-1' });

    await claimRoot('user-1', 42);

    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'root_claimed',
        oldValues: { billingGroupOwner: 'gone-1' },
        newValues: { role: 'root_manager', billingGroupOwner: 'user-1', billingGroupId: 5 },
      }),
    );
  });

  it('records only the role when billing stays put', async () => {
    selectFromMock.mockResolvedValueOnce([{ id: 7 }]);
    selectFromMock.mockResolvedValueOnce([]);
    claimRootOpMock.mockResolvedValueOnce({ outcome: 'target_owns_other_group', billingGroupId: 5 });

    expect(await claimRoot('user-1', 42)).toEqual({ communityId: 42, claimed: true });
    const entry = logAuditEventMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(entry.newValues).toEqual({ role: 'root_manager' });
    expect(entry).not.toHaveProperty('oldValues');
  });

  it('throws ForbiddenError when the caller is not a property_manager', async () => {
    selectFromMock.mockResolvedValueOnce([]); // not a PM here

    await expect(claimRoot('user-1', 42)).rejects.toBeInstanceOf(ForbiddenError);
    expect(claimRootOpMock).not.toHaveBeenCalled();
  });

  it('returns already_claimed when the community already has a root', async () => {
    selectFromMock.mockResolvedValueOnce([{ id: 7 }]); // PM here
    selectFromMock.mockResolvedValueOnce([{ id: 9 }]); // existing root

    const result = await claimRoot('user-1', 42);

    expect(result).toEqual({ communityId: 42, claimed: false, reason: 'already_claimed' });
    expect(claimRootOpMock).not.toHaveBeenCalled();
  });

  it('returns already_claimed on a 23505 unique violation during update', async () => {
    selectFromMock.mockResolvedValueOnce([{ id: 7 }]); // PM here
    selectFromMock.mockResolvedValueOnce([]); // no root yet
    claimRootOpMock.mockRejectedValueOnce(drizzleUniqueViolation('user_roles_one_root_per_community'));

    const result = await claimRoot('user-1', 42);

    expect(result).toEqual({ communityId: 42, claimed: false, reason: 'already_claimed' });
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('rethrows non-unique-violation update errors', async () => {
    selectFromMock.mockResolvedValueOnce([{ id: 7 }]);
    selectFromMock.mockResolvedValueOnce([]);
    claimRootOpMock.mockRejectedValueOnce(new Error('connection lost'));

    await expect(claimRoot('user-1', 42)).rejects.toThrow('connection lost');
  });

  it('still resolves claimed:true when notify fails (best-effort)', async () => {
    selectFromMock.mockResolvedValueOnce([{ id: 7 }]);
    selectFromMock.mockResolvedValueOnce([]);
    notifyRootClaimedMock.mockRejectedValueOnce(new Error('resend down'));

    const result = await claimRoot('user-1', 42);

    expect(result).toEqual({ communityId: 42, claimed: true });
  });
});

describe('claimAllRoots', () => {
  it('claims each of the caller’s rootless communities and aggregates results', async () => {
    findMyRootlessCommunitiesMock.mockResolvedValueOnce([
      { id: 1, name: 'Alpha', slug: 'alpha' },
      { id: 2, name: 'Beta', slug: 'beta' },
    ]);
    // community 1: success
    selectFromMock.mockResolvedValueOnce([{ id: 7 }]);
    selectFromMock.mockResolvedValueOnce([]);
    // community 2: success
    selectFromMock.mockResolvedValueOnce([{ id: 8 }]);
    selectFromMock.mockResolvedValueOnce([]);

    const results = await claimAllRoots('user-1');

    expect(results).toEqual([
      { communityId: 1, claimed: true },
      { communityId: 2, claimed: true },
    ]);
  });

  it('does not abort the batch when one community fails', async () => {
    findMyRootlessCommunitiesMock.mockResolvedValueOnce([
      { id: 1, name: 'Alpha', slug: 'alpha' },
      { id: 2, name: 'Beta', slug: 'beta' },
    ]);
    // community 1: PM check throws an unexpected error
    selectFromMock.mockRejectedValueOnce(new Error('boom'));
    // community 2: success
    selectFromMock.mockResolvedValueOnce([{ id: 8 }]);
    selectFromMock.mockResolvedValueOnce([]);

    const results = await claimAllRoots('user-1');

    expect(results).toEqual([
      { communityId: 1, claimed: false, reason: 'error' },
      { communityId: 2, claimed: true },
    ]);
  });
});
