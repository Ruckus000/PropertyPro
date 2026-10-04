/**
 * Directory CSV export, built on the server so it can be permission-checked
 * per column and audited (design §2.8). The browser-built CSV it replaces was
 * neither: whatever the page held went into the file, and nothing recorded
 * that resident contact details had left the system.
 */
import { createScopedClient, logAuditEvent } from '@propertypro/db';
import { generateCSV } from '@/lib/services/csv-export';
import { listResidentsForCommunity } from '@/lib/services/resident-service';
import { countOpenViolationsByUnit, listUnitsForCommunity } from '@/lib/services/unit-service';
import { listDelinquentUnits } from '@/lib/services/finance-service';
import { listOccupantsForExport } from '@/lib/services/occupant-service';
import { apartmentOccupancyByUnit } from '@/lib/leases/apartment-occupancy';

export type DirectoryExportKind = 'units' | 'residents';

const OCCUPANCY: Record<string, string> = { owner_occupied: 'Owner-occupied', rented: 'Rented', vacant: 'Vacant' };

type Column = { key: string; label: string };

export interface DirectoryExportAccess {
  /** Manager tier: occupancy, residents and owners. */
  isAdmin: boolean;
  /** finances:read on a plan with finance: overdue balances. */
  canSeeBalances: boolean;
  /** Violations on for the community (type + plan) and admin. */
  canSeeViolations: boolean;
}

export async function buildDirectoryExport(params: {
  communityId: number;
  kind: DirectoryExportKind;
  /** Residents only: export just these (the Directory selection). */
  selection?: { userIds: readonly string[]; occupantIds: readonly number[] };
  access: DirectoryExportAccess;
  actorUserId: string;
  /** Apartments: derive occupancy from leases (the stored column is not used). */
  occupancyFromLeases?: { timezone: string };
}): Promise<{ csv: string; rowCount: number }> {
  const { communityId, kind, access, actorUserId } = params;
  const { columns, rows } =
    kind === 'units'
      ? await unitRows(communityId, access, params.occupancyFromLeases)
      : await residentRows(communityId, params.selection);

  await logAuditEvent({
    userId: actorUserId,
    action: 'directory_exported',
    resourceType: 'directory',
    resourceId: kind,
    communityId,
    metadata: { kind, rowCount: rows.length, columns: columns.map((c) => c.label), selection: params.selection !== undefined },
  });

  return { csv: generateCSV(columns, rows), rowCount: rows.length };
}

async function unitRows(
  communityId: number,
  access: DirectoryExportAccess,
  occupancyFromLeases: { timezone: string } | undefined,
) {
  const scoped = createScopedClient(communityId);
  const [units, residents, delinquent, violations] = await Promise.all([
    listUnitsForCommunity(scoped),
    access.isAdmin ? listResidentsForCommunity(communityId, { role: 'resident' }) : Promise.resolve([]),
    access.canSeeBalances ? listDelinquentUnits(communityId, Number.MAX_SAFE_INTEGER) : Promise.resolve([]),
    access.canSeeViolations ? countOpenViolationsByUnit(scoped) : Promise.resolve(new Map<number, number>()),
  ]);

  const columns: Column[] = [
    { key: 'unit', label: 'Unit' },
    { key: 'building', label: 'Building' },
    { key: 'floor', label: 'Floor' },
    { key: 'bedrooms', label: 'Bedrooms' },
    { key: 'bathrooms', label: 'Bathrooms' },
    { key: 'sqft', label: 'Sq ft' },
    ...(access.isAdmin
      ? [
          { key: 'occupancy', label: 'Occupancy' },
          { key: 'owners', label: 'Owners' },
          { key: 'residents', label: 'Residents' },
        ]
      : []),
    ...(access.canSeeBalances
      ? [
          { key: 'overdue', label: 'Overdue balance' },
          { key: 'daysOverdue', label: 'Days overdue' },
        ]
      : []),
    ...(access.canSeeViolations ? [{ key: 'openViolations', label: 'Open violations' }] : []),
  ];

  const byUnit = new Map<number, { owners: string[]; count: number }>();
  for (const r of residents) {
    if (r.unitId === null) continue;
    const entry = byUnit.get(r.unitId) ?? { owners: [], count: 0 };
    entry.count += 1;
    if (r.isUnitOwner) entry.owners.push(r.fullName ?? r.email ?? '');
    byUnit.set(r.unitId, entry);
  }
  const overdueByUnit = new Map(delinquent.map((d) => [d.unitId, d]));
  const derived =
    occupancyFromLeases && access.isAdmin
      ? await apartmentOccupancyByUnit(communityId, units as Record<string, unknown>[], occupancyFromLeases.timezone)
      : null;
  const occupancyLabel = (u: Record<string, unknown>) => {
    if (!derived) return OCCUPANCY[String(u['occupancy'])] ?? '';
    const value = derived.get(u['id'] as number);
    return value ? OCCUPANCY[value]! : u['offlineSince'] ? 'Offline' : '';
  };

  const rows = units
    .map((u) => {
      const id = u['id'] as number;
      const people = byUnit.get(id);
      const overdue = overdueByUnit.get(id);
      return {
        unit: u['unitNumber'],
        building: u['building'] ?? '',
        floor: u['floor'] ?? '',
        bedrooms: u['bedrooms'] ?? '',
        bathrooms: u['bathrooms'] ?? '',
        sqft: u['sqft'] ?? '',
        occupancy: occupancyLabel(u),
        owners: people?.owners.join('; ') ?? '',
        residents: people?.count ?? 0,
        overdue: overdue ? (overdue.overdueAmountCents / 100).toFixed(2) : '0.00',
        daysOverdue: overdue?.daysOverdue ?? 0,
        openViolations: violations.get(id) ?? 0,
      };
    })
    .sort((a, b) => String(a.building).localeCompare(String(b.building)) || String(a.unit).localeCompare(String(b.unit), undefined, { numeric: true }));

  return { columns, rows };
}

const PORTAL: Record<string, string> = { active: 'Active', invited: 'Invited', not_invited: 'Not invited' };
const BOARD: Record<string, string> = { board_president: 'President', board_member: 'Board member' };

async function residentRows(
  communityId: number,
  selection?: { userIds: readonly string[]; occupantIds: readonly number[] },
) {
  const scoped = createScopedClient(communityId);
  const [residents, units, occupants] = await Promise.all([
    listResidentsForCommunity(communityId, { role: 'resident' }, { includePortalActivity: true }),
    listUnitsForCommunity(scoped),
    listOccupantsForExport(communityId, selection?.occupantIds),
  ]);
  const unitById = new Map(units.map((u) => [u['id'] as number, u]));
  const wanted = selection ? new Set(selection.userIds) : null;
  const wantedOccupants = selection ? new Set(selection.occupantIds) : null;

  const columns: Column[] = [
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'unit', label: 'Unit' },
    { key: 'building', label: 'Building' },
    { key: 'type', label: 'Type' },
    { key: 'board', label: 'Board' },
    { key: 'portal', label: 'Portal' },
  ];
  const unitCells = (unitId: number | null) => ({
    unit: (unitId !== null && (unitById.get(unitId)?.['unitNumber'] as string | undefined)) || '',
    building: (unitId !== null && (unitById.get(unitId)?.['building'] as string | null | undefined)) || '',
  });
  const memberRows = residents
    .filter((r) => !wanted || wanted.has(r.userId))
    .map((r) => ({
      name: r.fullName ?? '',
      email: r.email ?? '',
      phone: r.phone ?? '',
      ...unitCells(r.unitId),
      type: r.isUnitOwner ? 'Owner' : 'Tenant',
      board: r.designation ? BOARD[r.designation] : '',
      portal: r.portalStatus ? PORTAL[r.portalStatus] : '',
    }));
  // Household members (no login) are part of the roster too.
  const occupantRows = occupants
    .filter((o) => !wantedOccupants || wantedOccupants.has(o.id))
    .map((o) => ({
      name: o.fullName,
      email: o.email ?? '',
      phone: o.phone ?? '',
      ...unitCells(o.unitId),
      type: o.isOwnerHousehold ? 'Household (owner)' : 'Household (tenant)',
      board: '',
      portal: 'No login',
    }));
  const rows = [...memberRows, ...occupantRows].sort((a, b) => a.name.localeCompare(b.name));
  return { columns, rows };
}
