import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit test for findRootlessCommunities.
 *
 * Mocks ../src/drizzle so it runs without DATABASE_URL. Verifies the query
 * builder is exercised (select → from(communities) → where → orderBy → limit)
 * and that the resolved rows are returned as-is.
 */

const { selectMock, fromMock, innerJoinMock, whereMock, orderByMock, limitMock } = vi.hoisted(() => ({
  selectMock: vi.fn(),
  fromMock: vi.fn(),
  innerJoinMock: vi.fn(),
  whereMock: vi.fn(),
  orderByMock: vi.fn(),
  limitMock: vi.fn(),
}));

vi.mock('../src/drizzle', () => ({
  db: { select: selectMock },
}));

import {
  findMyRootlessCommunities,
  findRootlessCommunities,
  ROOTLESS_REPORT_LIMIT,
} from '../src/queries/rootless-communities';

describe('findRootlessCommunities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // db.select(...).from(...).where(...).orderBy(...).limit(...) → rows
    // The inner notExists subquery also calls db.select(...).from(...).where(...),
    // so .where must be chainable both into .orderBy (outer) and resolve (inner).
    selectMock.mockReturnValue({ from: fromMock });
    fromMock.mockReturnValue({ where: whereMock });
    whereMock.mockReturnValue({ orderBy: orderByMock });
    orderByMock.mockReturnValue({ limit: limitMock });
  });

  it('lists communities lacking a root_manager', async () => {
    const rows = [
      { id: 1, name: 'Alpha HOA', slug: 'alpha-hoa' },
      { id: 2, name: 'Beta Condos', slug: 'beta-condos' },
    ];
    limitMock.mockResolvedValue(rows);

    const result = await findRootlessCommunities();

    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual(rows);
    expect(selectMock).toHaveBeenCalled();
    expect(orderByMock).toHaveBeenCalled();
    // Bounded, not unbounded — teaching the mock about .limit() without
    // asserting it would hide whether the cap is actually applied.
    expect(limitMock).toHaveBeenCalledWith(ROOTLESS_REPORT_LIMIT);
  });

  it('returns an empty array when every community has a root_manager', async () => {
    limitMock.mockResolvedValue([]);

    const result = await findRootlessCommunities();

    expect(result).toEqual([]);
  });
});

describe('findMyRootlessCommunities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // db.select(...).from(...).innerJoin(...).where(...).orderBy(...) → rows.
    // The inner notExists subquery calls db.select(...).from(...).where(...),
    // so .where must be chainable into .orderBy (outer) and resolve (inner).
    selectMock.mockReturnValue({ from: fromMock });
    fromMock.mockReturnValue({ innerJoin: innerJoinMock, where: whereMock });
    innerJoinMock.mockReturnValue({ where: whereMock });
    whereMock.mockReturnValue({ orderBy: orderByMock });
  });

  it('returns only communities where the user is property_manager and no root exists', async () => {
    const rows = [{ id: 1, name: 'Alpha HOA', slug: 'alpha-hoa' }];
    orderByMock.mockResolvedValue(rows);

    const result = await findMyRootlessCommunities('user-1');

    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual(rows);
    expect(innerJoinMock).toHaveBeenCalled();
    expect(orderByMock).toHaveBeenCalled();
  });

  it('returns an empty array when the caller has no rootless communities', async () => {
    orderByMock.mockResolvedValue([]);

    const result = await findMyRootlessCommunities('user-1');

    expect(result).toEqual([]);
  });
});
