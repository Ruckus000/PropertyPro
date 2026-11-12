/**
 * `findSoleManagedCommunityId` answers "exactly one?" from a query capped at
 * two ids: none and several both mean "show the page".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ids = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock('@propertypro/db/unsafe', () => ({
  findManagedCommunitiesPortfolioUnscoped: vi.fn(),
  findManagedCommunityIdsUnscoped: ids.fn,
  hasOpenAddCommunityCheckoutUnscoped: vi.fn(),
  isPmAdminInAnyCommunity: vi.fn(),
}));

import { findSoleManagedCommunityId } from '../../src/lib/api/pm-communities';

beforeEach(() => ids.fn.mockReset());

describe('findSoleManagedCommunityId', () => {
  it('returns the id when there is exactly one, asking for at most two', async () => {
    ids.fn.mockResolvedValue([5]);
    await expect(findSoleManagedCommunityId('u')).resolves.toBe(5);
    expect(ids.fn).toHaveBeenCalledWith('u', 2);
  });

  it('returns null for none and for several', async () => {
    ids.fn.mockResolvedValue([]);
    await expect(findSoleManagedCommunityId('u')).resolves.toBeNull();
    ids.fn.mockResolvedValue([5, 6]);
    await expect(findSoleManagedCommunityId('u')).resolves.toBeNull();
  });
});
