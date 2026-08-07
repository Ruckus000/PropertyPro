import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createScopedClientMock, selectFromMock, userRolesMock } = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  selectFromMock: vi.fn(),
  userRolesMock: { __table: 'user_roles' },
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  userRoles: userRolesMock,
}));

import { listBillingCapableUserIds } from '../../src/lib/services/billing-upgrade-requests-service';

const EXCLUDE_USER_ID = 'user-requester';

describe('listBillingCapableUserIds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createScopedClientMock.mockReturnValue({ selectFrom: selectFromMock });
    selectFromMock.mockResolvedValue([]);
  });

  // R3-03: the root manager is the correct recipient (only they can complete a
  // purchase), with a PM-scope FALLBACK when the root seat is vacant. Without
  // that fallback a rootless community yields zero recipients and the route
  // returns `{ notified: 0 }` with a 200 — silent failure in exactly the
  // communities where nobody can purchase yet.

  it('rootless community: falls back to PM-scope roles', async () => {
    selectFromMock.mockResolvedValueOnce([
      { userId: 'user-pm', role: 'property_manager', designation: null },
    ]);

    const result = await listBillingCapableUserIds(1, EXCLUDE_USER_ID);

    expect(result).toEqual(['user-pm']);
  });

  it('rooted community: notifies ONLY the root, not the property managers', async () => {
    selectFromMock.mockResolvedValueOnce([
      { userId: 'user-pm-a', role: 'property_manager', designation: null },
      { userId: 'user-pm-b', role: 'property_manager', designation: null },
      { userId: 'user-root', role: 'root_manager', designation: null },
    ]);

    const result = await listBillingCapableUserIds(1, EXCLUDE_USER_ID);

    expect(result).toEqual(['user-root']);
  });

  it('a root who is themselves the requester still counts as filling the seat', async () => {
    // The root is excluded as a recipient (no self-notify), but the seat is NOT
    // vacant — falling back to the PMs here would notify people who cannot act.
    selectFromMock.mockResolvedValueOnce([
      { userId: EXCLUDE_USER_ID, role: 'root_manager', designation: null },
      { userId: 'user-pm', role: 'property_manager', designation: null },
    ]);

    const result = await listBillingCapableUserIds(1, EXCLUDE_USER_ID);

    expect(result).toEqual([]);
  });

  it('rootless community: includes PM-scope rows regardless of board designation', async () => {
    selectFromMock.mockResolvedValueOnce([
      {
        userId: 'user-president',
        role: 'property_manager',
        designation: 'board_president',
      },
    ]);

    const result = await listBillingCapableUserIds(1, EXCLUDE_USER_ID);

    expect(result).toEqual(['user-president']);
  });

  it('excludes residents with a board-member designation', async () => {
    selectFromMock.mockResolvedValueOnce([
      {
        userId: 'user-board-member',
        role: 'resident',
        designation: 'board_member',
      },
    ]);

    const result = await listBillingCapableUserIds(1, EXCLUDE_USER_ID);

    expect(result).toEqual([]);
  });

  it('excludes the requester even when otherwise billing-capable', async () => {
    selectFromMock.mockResolvedValueOnce([
      { userId: EXCLUDE_USER_ID, role: 'property_manager', designation: null },
      {
        userId: 'user-president',
        role: 'root_manager',
        designation: 'board_president',
      },
    ]);

    const result = await listBillingCapableUserIds(1, EXCLUDE_USER_ID);

    expect(result).toEqual(['user-president']);
  });
});
