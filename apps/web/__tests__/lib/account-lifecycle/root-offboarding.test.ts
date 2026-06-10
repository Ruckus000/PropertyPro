import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mock the unscoped DB layer the helper uses --------------------------
const { selectMock, fromMock, whereMock, createUnscopedClientMock } = vi.hoisted(() => {
  const selectMock = vi.fn();
  const fromMock = vi.fn();
  const whereMock = vi.fn();
  const dbMock = { select: selectMock };
  const createUnscopedClientMock = vi.fn(() => dbMock);
  return { selectMock, fromMock, whereMock, createUnscopedClientMock };
});

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: createUnscopedClientMock,
}));

vi.mock('@propertypro/db', () => ({
  userRoles: { communityId: 'user_roles.community_id', userId: 'user_roles.user_id', role: 'user_roles.role' },
}));

vi.mock('@propertypro/db/filters', () => ({
  and: (...clauses: unknown[]) => ({ __and: clauses }),
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
}));

import { findCommunitiesUserIsRootOf } from '@/lib/account-lifecycle/root-offboarding';

describe('findCommunitiesUserIsRootOf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // chain: db.select(...).from(...).where(...) -> rows
    selectMock.mockReturnValue({ from: fromMock });
    fromMock.mockReturnValue({ where: whereMock });
  });

  it('returns community ids where the user holds root_manager', async () => {
    whereMock.mockResolvedValue([{ communityId: 7 }, { communityId: 12 }]);

    const ids = await findCommunitiesUserIsRootOf('user-1');

    expect(Array.isArray(ids)).toBe(true);
    expect(ids).toEqual([7, 12]);
    expect(createUnscopedClientMock).toHaveBeenCalledTimes(1);
  });

  it('returns an empty array when the user holds no root_manager role', async () => {
    whereMock.mockResolvedValue([]);

    const ids = await findCommunitiesUserIsRootOf('user-2');

    expect(ids).toEqual([]);
  });
});
