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

  it('includes PM-scope roles regardless of preset or designation', async () => {
    selectFromMock.mockResolvedValueOnce([
      { userId: 'user-pm', role: 'pm_admin', presetKey: null, designation: null },
    ]);

    const result = await listBillingCapableUserIds(1, EXCLUDE_USER_ID);

    expect(result).toEqual(['user-pm']);
  });

  it('includes manager-tier rows with board-president designation (no preset)', async () => {
    // role 'manager' is the only manager-tier role NOT also PM-scope, so this
    // row exercises the designation arm rather than the always-include PM arm.
    selectFromMock.mockResolvedValueOnce([
      {
        userId: 'user-president',
        role: 'manager',
        presetKey: null,
        designation: 'board_president',
      },
    ]);

    const result = await listBillingCapableUserIds(1, EXCLUDE_USER_ID);

    expect(result).toEqual(['user-president']);
  });

  it('includes legacy manager rows with cam preset and no designation', async () => {
    selectFromMock.mockResolvedValueOnce([
      { userId: 'user-cam', role: 'manager', presetKey: 'cam', designation: null },
    ]);

    const result = await listBillingCapableUserIds(1, EXCLUDE_USER_ID);

    expect(result).toEqual(['user-cam']);
  });

  it('excludes manager-tier rows with a president preset but no designation', async () => {
    selectFromMock.mockResolvedValueOnce([
      {
        userId: 'user-preset-only',
        role: 'manager',
        presetKey: 'board_president',
        designation: null,
      },
    ]);

    const result = await listBillingCapableUserIds(1, EXCLUDE_USER_ID);

    expect(result).toEqual([]);
  });

  it('excludes manager-tier rows with a board-member designation and no preset', async () => {
    selectFromMock.mockResolvedValueOnce([
      {
        userId: 'user-board-member',
        role: 'manager',
        presetKey: null,
        designation: 'board_member',
      },
    ]);

    const result = await listBillingCapableUserIds(1, EXCLUDE_USER_ID);

    expect(result).toEqual([]);
  });

  it('excludes the requester even when otherwise billing-capable', async () => {
    selectFromMock.mockResolvedValueOnce([
      { userId: EXCLUDE_USER_ID, role: 'pm_admin', presetKey: null, designation: null },
      {
        userId: 'user-president',
        role: 'root_manager',
        presetKey: null,
        designation: 'board_president',
      },
    ]);

    const result = await listBillingCapableUserIds(1, EXCLUDE_USER_ID);

    expect(result).toEqual(['user-president']);
  });
});
