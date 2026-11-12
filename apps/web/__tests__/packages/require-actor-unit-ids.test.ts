/**
 * R-3 (2026-11-11 empty-state audit): the resident packages view must tell a
 * resident with no linked unit apart from a real failure. A bare 403 cannot —
 * `/api/v1/packages/my` also answers 403 for a disabled feature or a non-resident
 * — so the no-unit gate carries its own error code.
 */
import { describe, expect, it, vi } from 'vitest';

const { getActorUnitIdsMock } = vi.hoisted(() => ({ getActorUnitIdsMock: vi.fn() }));

vi.mock('@/lib/units/actor-units', () => ({
  getActorUnitIds: getActorUnitIdsMock,
  requireActorUnitId: vi.fn(),
}));
vi.mock('@/lib/db/access-control', () => ({ requirePermission: vi.fn() }));
vi.mock('@/lib/middleware/plan-guard', () => ({ requirePlanFeature: vi.fn() }));

import { requireActorUnitIds } from '@/lib/logistics/common';
import { isNoUnitAssociationError } from '@/lib/units/no-unit-association';

describe('requireActorUnitIds', () => {
  it('throws 403 NO_UNIT_ASSOCIATION when the actor has no unit', async () => {
    getActorUnitIdsMock.mockResolvedValueOnce([]);
    const error = await requireActorUnitIds({} as never, 'u-1').catch((e: unknown) => e);
    expect(error).toMatchObject({ statusCode: 403, code: 'NO_UNIT_ASSOCIATION' });
  });

  it('returns the unit ids when the actor has units', async () => {
    getActorUnitIdsMock.mockResolvedValueOnce([3, 7]);
    await expect(requireActorUnitIds({} as never, 'u-1')).resolves.toEqual([3, 7]);
  });
});

describe('isNoUnitAssociationError', () => {
  it('matches only a 403 carrying the code', () => {
    expect(isNoUnitAssociationError({ status: 403, code: 'NO_UNIT_ASSOCIATION' })).toBe(true);
    expect(isNoUnitAssociationError({ status: 403, code: 'FORBIDDEN' })).toBe(false);
    expect(isNoUnitAssociationError({ status: 500, code: 'NO_UNIT_ASSOCIATION' })).toBe(false);
    expect(isNoUnitAssociationError(new Error('x'))).toBe(false);
    expect(isNoUnitAssociationError(null)).toBe(false);
  });
});
