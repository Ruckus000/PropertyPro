import { units, type ScopedClient } from '@propertypro/db';
import { inArray } from '@propertypro/db/filters';
import { formatUnitLabel } from './format-unit-label';

/**
 * Attach `unitLabel` to rows that carry only a `unitId`, in one query. A unit
 * that is gone falls back to `Unit #<id>` rather than failing the read.
 */
export async function withUnitLabels<T extends { unitId: number }>(
  scoped: ScopedClient,
  rows: readonly T[],
): Promise<Array<T & { unitLabel: string }>> {
  const ids = [...new Set(rows.map((row) => row.unitId))];
  const unitRows =
    ids.length === 0
      ? []
      : await scoped.selectFrom<{ id: number; unitNumber: string; building: string | null }>(
          units,
          { id: units.id, unitNumber: units.unitNumber, building: units.building },
          inArray(units.id, ids),
        );
  const labels = new Map(unitRows.map((unit) => [unit.id, formatUnitLabel(unit)]));
  return rows.map((row) => ({ ...row, unitLabel: labels.get(row.unitId) ?? `Unit #${row.unitId}` }));
}

/** withUnitLabels for one record. */
export async function withUnitLabel<T extends { unitId: number }>(
  scoped: ScopedClient,
  row: T,
): Promise<T & { unitLabel: string }> {
  const [labelled] = await withUnitLabels(scoped, [row]);
  return labelled!;
}
