import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  createScopedClientMock,
  logAuditEventMock,
  selectFromMock,
  updateMock,
  findMyRootlessCommunitiesMock,
  notifyRootClaimedMock,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  selectFromMock: vi.fn(),
  updateMock: vi.fn(),
  findMyRootlessCommunitiesMock: vi.fn(),
  notifyRootClaimedMock: vi.fn(),
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

beforeEach(() => {
  vi.clearAllMocks();
  createScopedClientMock.mockReturnValue({
    selectFrom: selectFromMock,
    update: updateMock,
  });
  logAuditEventMock.mockResolvedValue(undefined);
  notifyRootClaimedMock.mockResolvedValue(undefined);
});

describe('claimRoot', () => {
  it('promotes a property_manager in a rootless community to root_manager', async () => {
    // (1) caller holds property_manager here
    selectFromMock.mockResolvedValueOnce([{ id: 7 }]);
    // (2) no existing root_manager
    selectFromMock.mockResolvedValueOnce([]);
    updateMock.mockResolvedValueOnce([{ id: 7 }]);

    const result = await claimRoot('user-1', 42);

    expect(result).toEqual({ communityId: 42, claimed: true });
    expect(updateMock).toHaveBeenCalledTimes(1);
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

  it('throws ForbiddenError when the caller is not a property_manager', async () => {
    selectFromMock.mockResolvedValueOnce([]); // not a PM here

    await expect(claimRoot('user-1', 42)).rejects.toBeInstanceOf(ForbiddenError);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('returns already_claimed when the community already has a root', async () => {
    selectFromMock.mockResolvedValueOnce([{ id: 7 }]); // PM here
    selectFromMock.mockResolvedValueOnce([{ id: 9 }]); // existing root

    const result = await claimRoot('user-1', 42);

    expect(result).toEqual({ communityId: 42, claimed: false, reason: 'already_claimed' });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('returns already_claimed on a 23505 unique violation during update', async () => {
    selectFromMock.mockResolvedValueOnce([{ id: 7 }]); // PM here
    selectFromMock.mockResolvedValueOnce([]); // no root yet
    updateMock.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }));

    const result = await claimRoot('user-1', 42);

    expect(result).toEqual({ communityId: 42, claimed: false, reason: 'already_claimed' });
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('rethrows non-unique-violation update errors', async () => {
    selectFromMock.mockResolvedValueOnce([{ id: 7 }]);
    selectFromMock.mockResolvedValueOnce([]);
    updateMock.mockRejectedValueOnce(new Error('connection lost'));

    await expect(claimRoot('user-1', 42)).rejects.toThrow('connection lost');
  });

  it('still resolves claimed:true when notify fails (best-effort)', async () => {
    selectFromMock.mockResolvedValueOnce([{ id: 7 }]);
    selectFromMock.mockResolvedValueOnce([]);
    updateMock.mockResolvedValueOnce([{ id: 7 }]);
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
    updateMock.mockResolvedValueOnce([{ id: 7 }]);
    // community 2: success
    selectFromMock.mockResolvedValueOnce([{ id: 8 }]);
    selectFromMock.mockResolvedValueOnce([]);
    updateMock.mockResolvedValueOnce([{ id: 8 }]);

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
    updateMock.mockResolvedValueOnce([{ id: 8 }]);

    const results = await claimAllRoots('user-1');

    expect(results).toEqual([
      { communityId: 1, claimed: false, reason: 'already_claimed' },
      { communityId: 2, claimed: true },
    ]);
  });
});
