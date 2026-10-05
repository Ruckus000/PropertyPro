/**
 * Apartment occupancy derived from leases, for every read that shows it
 * (units GET, the Directory export). Apartments never store a manual value:
 * the units routes and the CSV import refuse one.
 *
 * AUTHZ: the caller decides whether the viewer may see occupancy at all.
 */
import { captureMessage } from '@sentry/nextjs';
import { listLeasesForCommunity } from '@/lib/services/lease-service';
import { utcDateToWallClockValue } from '@/lib/utils/zoned-datetime';
import { occupancyFromLeases, type LeaseStateInput } from './lease-state';

export type DerivedOccupancy = 'rented' | 'vacant' | null;

export async function apartmentOccupancyByUnit(
  communityId: number,
  units: ReadonlyArray<Record<string, unknown>>,
  timezone: string | null | undefined,
  unitId?: number,
): Promise<Map<number, DerivedOccupancy>> {
  const today = utcDateToWallClockValue(new Date(), timezone ?? 'America/New_York').slice(0, 10);
  // Only `active` rows can be current; ended and cancelled leases never decide occupancy.
  const { rows, truncated } = await listLeasesForCommunity(communityId, {
    status: 'active',
    ...(unitId !== undefined ? { unitId } : {}),
  });
  if (truncated) {
    captureMessage('lease_list_truncated', { level: 'warning', extra: { communityId, path: 'occupancy' } });
  }
  const byUnit = new Map<number, LeaseStateInput[]>();
  for (const row of rows) {
    const lease = row as unknown as LeaseStateInput;
    byUnit.set(lease.unitId, [...(byUnit.get(lease.unitId) ?? []), lease]);
  }
  return new Map(
    units.map((u) => {
      const id = u['id'] as number;
      const offlineSince = (u['offlineSince'] as string | null | undefined) ?? null;
      return [id, occupancyFromLeases(byUnit.get(id) ?? [], { offlineSince }, today)];
    }),
  );
}
