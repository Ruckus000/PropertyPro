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

  it('includes PM-scope roles regardless of designation', async () => {
    selectFromMock.mockResolvedValueOnce([
      { userId: 'user-pm', role: 'property_manager', designation: null },
    ]);

    const result = await listBillingCapableUserIds(1, EXCLUDE_USER_ID);

    expect(result).toEqual(['user-pm']);
  });

  it('includes PM-scope rows regardless of board designation', async () => {
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
