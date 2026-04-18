import { createScopedClient, units } from '@propertypro/db';
import { asc, inArray, sql } from '@propertypro/db/filters';
import { escapeLikePattern } from '@/lib/utils/escape-like';

export interface UnitSearchResult {
  id: number;
  unitNumber: string;
  building: string | null;
  floor: number | null;
}

export type UnitResolution =
  | { kind: 'resolved'; unitId: number; unitNumber: string }
  | { kind: 'not_found' }
  | { kind: 'ambiguous' };

interface UnitRow {
  [key: string]: unknown;
  id: number;
  unitNumber: string;
  building: string | null;
  floor: number | null;
}

export async function resolveUnitIdByLabel(
  communityId: number,
  label: string,
): Promise<UnitResolution> {
  const trimmed = label.trim();
  if (!trimmed) return { kind: 'not_found' };

  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom<UnitRow>(
    units,
    {},
    sql`lower(${units.unitNumber}) = lower(${trimmed})`,
  );

  if (rows.length === 0) return { kind: 'not_found' };
  if (rows.length > 1) return { kind: 'ambiguous' };
  const [only] = rows;
  if (!only) return { kind: 'not_found' };
  return { kind: 'resolved', unitId: only.id, unitNumber: only.unitNumber };
}

export async function searchUnitsByLabel(
  communityId: number,
  query: string,
  limit: number,
): Promise<UnitSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const scoped = createScopedClient(communityId);
  const escaped = escapeLikePattern(trimmed);
  const rows = await scoped
    .selectFrom<UnitRow>(
      units,
      {},
      sql`lower(${units.unitNumber}) LIKE lower(${escaped + '%'})`,
    )
    .orderBy(asc(units.unitNumber))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    unitNumber: r.unitNumber,
    building: r.building,
    floor: r.floor,
  }));
}

export async function getUnitLabelMap(
  communityId: number,
  unitIds: readonly number[],
): Promise<Map<number, string>> {
  if (unitIds.length === 0) return new Map();
  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom<UnitRow>(
    units,
    {},
    inArray(units.id, [...unitIds]),
  );
  const map = new Map<number, string>();
  for (const row of rows) map.set(row.id, row.unitNumber);
  return map;
}
