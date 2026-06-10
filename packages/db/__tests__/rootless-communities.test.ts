import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit test for findRootlessCommunities.
 *
 * Mocks ../src/drizzle so it runs without DATABASE_URL. Verifies the query
 * builder is exercised (select → from(communities) → where → orderBy) and
 * that the resolved rows are returned as-is.
 */

const { selectMock, fromMock, whereMock, orderByMock } = vi.hoisted(() => ({
  selectMock: vi.fn(),
  fromMock: vi.fn(),
  whereMock: vi.fn(),
  orderByMock: vi.fn(),
}));

vi.mock('../src/drizzle', () => ({
  db: { select: selectMock },
}));

import { findRootlessCommunities } from '../src/queries/rootless-communities';

describe('findRootlessCommunities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // db.select(...).from(...).where(...).orderBy(...) → rows
    // The inner notExists subquery also calls db.select(...).from(...).where(...),
    // so .where must be chainable both into .orderBy (outer) and resolve (inner).
    selectMock.mockReturnValue({ from: fromMock });
    fromMock.mockReturnValue({ where: whereMock });
    whereMock.mockReturnValue({ orderBy: orderByMock });
  });

  it('lists communities lacking a root_manager', async () => {
    const rows = [
      { id: 1, name: 'Alpha HOA', slug: 'alpha-hoa' },
      { id: 2, name: 'Beta Condos', slug: 'beta-condos' },
    ];
    orderByMock.mockResolvedValue(rows);

    const result = await findRootlessCommunities();

    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual(rows);
    expect(selectMock).toHaveBeenCalled();
    expect(orderByMock).toHaveBeenCalled();
  });

  it('returns an empty array when every community has a root_manager', async () => {
    orderByMock.mockResolvedValue([]);

    const result = await findRootlessCommunities();

    expect(result).toEqual([]);
  });
});
