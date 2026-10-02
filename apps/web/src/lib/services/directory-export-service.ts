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
  /** Residents only: export just these members (the Directory selection). */
  userIds?: readonly string[];
  access: DirectoryExportAccess;
  actorUserId: string;
}): Promise<{ csv: string; rowCount: number }> {
  const { communityId, kind, access, actorUserId } = params;
  const { columns, rows } =
    kind === 'units'
      ? await unitRows(communityId, access)
      : await residentRows(communityId, params.userIds);

  await logAuditEvent({
    userId: actorUserId,
    action: 'directory_exported',
    resourceType: 'directory',
    resourceId: kind,
    communityId,
    metadata: { kind, rowCount: rows.length, columns: columns.map((c) => c.label), selection: params.userIds !== undefined },
  });

  return { csv: generateCSV(columns, rows), rowCount: rows.length };
}

async function unitRows(communityId: number, access: DirectoryExportAccess) {
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
        occupancy: OCCUPANCY[String(u['occupancy'])] ?? '',
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

async function residentRows(communityId: number, userIds?: readonly string[]) {
  const scoped = createScopedClient(communityId);
  const [residents, units] = await Promise.all([
    listResidentsForCommunity(communityId, { role: 'resident' }, { includePortalActivity: true }),
    listUnitsForCommunity(scoped),
  ]);
  const unitById = new Map(units.map((u) => [u['id'] as number, u]));
  const wanted = userIds ? new Set(userIds) : null;

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
  const rows = residents
    .filter((r) => !wanted || wanted.has(r.userId))
    .map((r) => ({
      name: r.fullName ?? '',
      email: r.email ?? '',
      phone: r.phone ?? '',
      unit: (r.unitId !== null && (unitById.get(r.unitId)?.['unitNumber'] as string | undefined)) || '',
      building: (r.unitId !== null && (unitById.get(r.unitId)?.['building'] as string | null | undefined)) || '',
      type: r.isUnitOwner ? 'Owner' : 'Tenant',
      board: r.designation ? BOARD[r.designation] : '',
      portal: r.portalStatus ? PORTAL[r.portalStatus] : '',
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { columns, rows };
}
