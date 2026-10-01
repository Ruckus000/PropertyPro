/**
 * One read scope for every violations surface: whoever may act on any unit's
 * violation (requireViolationAdminWrite) reads them all; everyone else reads
 * their own units only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScopedClient } from '@propertypro/db';

const { getActorUnitIdsMock } = vi.hoisted(() => ({ getActorUnitIdsMock: vi.fn() }));

vi.mock('@/lib/units/actor-units', () => ({
  getActorUnitIds: getActorUnitIdsMock,
  requireActorUnitId: vi.fn(),
}));
vi.mock('@/lib/middleware/plan-guard', () => ({ requirePlanFeature: vi.fn() }));

import { getViolationReadUnitIds } from '../common';

const scoped = {} as ScopedClient;

describe('getViolationReadUnitIds', () => {
  beforeEach(() => {
    getActorUnitIdsMock.mockReset().mockResolvedValue([7]);
  });

  it('managers read every unit', async () => {
    await expect(getViolationReadUnitIds(scoped, { isAdmin: true, designation: null }, 'u')).resolves.toBeUndefined();
    expect(getActorUnitIdsMock).not.toHaveBeenCalled();
  });

  it('a resident with a board seat reads every unit', async () => {
    await expect(
      getViolationReadUnitIds(scoped, { isAdmin: false, designation: 'board_member' }, 'u'),
    ).resolves.toBeUndefined();
  });

  it('any other resident reads only their own units', async () => {
    await expect(getViolationReadUnitIds(scoped, { isAdmin: false, designation: null }, 'u')).resolves.toEqual([7]);
    expect(getActorUnitIdsMock).toHaveBeenCalledWith(scoped, 'u');
  });
});
