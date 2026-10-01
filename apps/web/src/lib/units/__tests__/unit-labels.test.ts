import { describe, expect, it, vi } from 'vitest';
import type { ScopedClient } from '@propertypro/db';

vi.mock('@propertypro/db', () => ({ units: { id: 'id', unitNumber: 'unit_number', building: 'building' } }));
vi.mock('@propertypro/db/filters', () => ({ inArray: (_c: unknown, ids: unknown) => ({ ids }) }));

import { formatUnitLabel } from '../format-unit-label';
import { withUnitLabels } from '../unit-labels';

describe('formatUnitLabel', () => {
  it('names the unit by its number, with the building when there is one', () => {
    expect(formatUnitLabel({ unitNumber: '1B', building: null })).toBe('Unit 1B');
    expect(formatUnitLabel({ unitNumber: '204', building: 'Bldg A' })).toBe('Bldg A • Unit 204');
  });
});

describe('withUnitLabels', () => {
  it('labels every row from one query, by number not database id', async () => {
    const selectFrom = vi.fn(async (..._args: unknown[]) => [
      { id: 2, unitNumber: '1B', building: null },
      { id: 3, unitNumber: '2A', building: null },
    ]);
    const rows = await withUnitLabels({ selectFrom } as unknown as ScopedClient, [
      { unitId: 2, id: 10 },
      { unitId: 3, id: 11 },
      { unitId: 2, id: 12 },
    ]);
    expect(rows.map((r) => r.unitLabel)).toEqual(['Unit 1B', 'Unit 2A', 'Unit 1B']);
    expect(selectFrom).toHaveBeenCalledTimes(1);
    expect(selectFrom.mock.calls[0]![2]).toEqual({ ids: [2, 3] });
  });

  it('falls back to the id for a unit it cannot find, and skips the query for no rows', async () => {
    const selectFrom = vi.fn(async (..._args: unknown[]) => [] as unknown[]);
    const scoped = { selectFrom } as unknown as ScopedClient;
    expect((await withUnitLabels(scoped, [{ unitId: 9 }]))[0]!.unitLabel).toBe('Unit #9');
    selectFrom.mockClear();
    expect(await withUnitLabels(scoped, [])).toEqual([]);
    expect(selectFrom).not.toHaveBeenCalled();
  });
});
