/**
 * Directory view model — pure functions that turn the units list, the
 * residents list and the delinquency report into what the Directory renders.
 *
 * Everything is keyed by `unitId` / `userId`, never by unit number: `building`
 * is free text, so "101" can exist in two buildings.
 *
 * No React here, so every rule the design encodes (owner line, contradictions
 * between occupancy and who is on file, flags, filters, overview counts) is
 * unit-tested directly — see `__tests__/directory/directory-model.test.ts`.
 */
import type { Unit, UnitOccupancy } from '@/hooks/use-units';
import type { DocumentSendStatus } from '@/hooks/use-documents';
import type { ResidentRecord } from '@/hooks/use-residents-management';

export const NO_BUILDING_KEY = '__none__';
export const NO_BUILDING_LABEL = 'No building';

export interface PastDue {
  amountCents: number;
  daysOverdue: number;
}

/** Mirrors the server's past-due rule (payments/past-due-rule): both must be exceeded. */
export interface PastDueRule {
  minCents: number;
  minDays: number;
}

export const ANY_OVERDUE_RULE: PastDueRule = { minCents: 0, minDays: 0 };

export function isPastDue(overdue: PastDue, rule: PastDueRule): boolean {
  return overdue.amountCents > rule.minCents && overdue.daysOverdue > rule.minDays;
}

export function describeRule(rule: PastDueRule): string {
  if (rule.minCents === 0 && rule.minDays === 0) return 'any overdue balance';
  const parts = [
    rule.minCents > 0 ? `over ${formatCents(rule.minCents)}` : null,
    rule.minDays > 0 ? `more than ${plural(rule.minDays, 'day')} late` : null,
  ].filter(Boolean);
  return `a balance ${parts.join(' and ')}`;
}

export interface DelinquencyRow {
  unitId: number;
  overdueAmountCents: number;
  daysOverdue: number;
}

export interface DirectoryResident extends ResidentRecord {
  displayName: string;
  initials: string;
}

export interface DirectoryUnit {
  id: number;
  unitNumber: string;
  /** Key for grouping/filtering; NO_BUILDING_KEY when the unit has none. */
  buildingKey: string;
  buildingLabel: string;
  floor: number | null;
  /** "Building A · Floor 2" */
  locationLabel: string;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  rentAmount: string | null;
  occupancy: UnitOccupancy | null;
  occupancyConfirmed: boolean;
  /** 'leases' = derived from the unit's leases (apartments); not editable here. */
  occupancySource: 'manual' | 'leases';
  residents: DirectoryResident[];
  owners: DirectoryResident[];
  tenants: DirectoryResident[];
  /** Null when the viewer cannot read residents. */
  ownerText: string | null;
  occupantLine: string | null;
  /** Occupancy contradicts who is on file (e.g. vacant with residents). */
  hasContradiction: boolean;
  noOwner: boolean;
  /** Overdue AND over the community's past-due rule: flagged. */
  pastDue: PastDue | null;
  /** Overdue but under the rule: shown neutrally, never flagged, never "paid up". */
  overdueBelowRule: PastDue | null;
  /** Open violations (0 when none or not visible to the viewer). */
  openViolations: number;
}

export interface DirectoryContext {
  /** False for apartments: no owners, no "No owner on file" flag. */
  hasOwnerRole: boolean;
  /** Residents list was loaded (admins only). */
  canSeeResidents: boolean;
}

/* ─────────────── Formatting ─────────────── */

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

const MONEY = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

export function formatCents(cents: number): string {
  return MONEY.format(Math.round(cents / 100));
}

export function formatRent(rentAmount: string | null): string | null {
  if (rentAmount === null) return null;
  const n = Number(rentAmount);
  if (!Number.isFinite(n)) return null;
  return `${MONEY.format(n)}/mo`;
}

/**
 * Up to two initials: first grapheme of the first and last word, so non-Latin
 * names and surrogate pairs are not split mid-character.
 */
export function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = Array.from(words[0]!)[0] ?? '';
  const last = words.length > 1 ? (Array.from(words[words.length - 1]!)[0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** "A-101" → "101" for floor-map tiles; plain numbers are left alone. */
export function shortUnitLabel(unitNumber: string): string {
  return /^[A-Za-z]+-/.test(unitNumber) ? unitNumber.replace(/^[A-Za-z]+-/, '') : unitNumber;
}

export const OCCUPANCY_LABEL: Record<UnitOccupancy, string> = {
  owner_occupied: 'Owner-occupied',
  rented: 'Rented',
  vacant: 'Vacant',
};

const unitNumberCollator = new Intl.Collator('en-US', { numeric: true, sensitivity: 'base' });

/* ─────────────── Building ─────────────── */

export function buildingKeyOf(building: string | null): string {
  const trimmed = building?.trim();
  return trimmed ? trimmed : NO_BUILDING_KEY;
}

export function buildingLabelOf(key: string): string {
  if (key === NO_BUILDING_KEY) return NO_BUILDING_LABEL;
  // Free-text codes like "A" read better as "Building A"; full names stay as-is.
  return /^[A-Za-z0-9]{1,3}$/.test(key) ? `Building ${key}` : key;
}

/* ─────────────── Unit lines ─────────────── */

function joinNames(people: DirectoryResident[], separator: string): string {
  return people.map((p) => p.displayName).join(separator);
}

export function ownerTextFor(
  residents: DirectoryResident[],
  owners: DirectoryResident[],
  ctx: DirectoryContext,
): string | null {
  if (!ctx.canSeeResidents) return null;
  if (!ctx.hasOwnerRole) return joinNames(residents, ', ') || 'No residents';
  return owners.length === 0 ? 'No owner on file' : joinNames(owners, ' & ');
}

/**
 * The second line on a unit: who lives there, stated against the recorded
 * occupancy so contradictions surface instead of being papered over.
 */
export function occupantLineFor(
  occupancy: UnitOccupancy | null,
  residents: DirectoryResident[],
  owners: DirectoryResident[],
  tenants: DirectoryResident[],
  ctx: DirectoryContext,
): { text: string | null; contradiction: boolean } {
  if (!ctx.canSeeResidents) {
    return { text: occupancy ? OCCUPANCY_LABEL[occupancy] : null, contradiction: false };
  }
  switch (occupancy) {
    case 'vacant':
      return residents.length > 0
        ? { text: `Marked vacant, but ${plural(residents.length, 'resident')} on file`, contradiction: true }
        : { text: 'Vacant — no one lives here', contradiction: false };
    case 'rented':
      return tenants.length > 0
        ? { text: `${tenants.length > 1 ? 'Tenants' : 'Tenant'}: ${joinNames(tenants, ', ')}`, contradiction: false }
        : { text: 'Rented — no tenant on file', contradiction: true };
    case 'owner_occupied':
      return owners.length > 0
        ? { text: 'Owner lives here', contradiction: false }
        : { text: 'Owner-occupied — no owner on file', contradiction: true };
    default:
      return {
        text: residents.length > 0 ? `${plural(residents.length, 'resident')} on file` : 'No one on file',
        contradiction: false,
      };
  }
}

/* ─────────────── Build ─────────────── */

/** A household member (no portal login): never invited, emailed documents or counted as of record. */
export function isHouseholdMember(r: Pick<ResidentRecord, 'occupantId'>): boolean {
  return r.occupantId !== undefined;
}

/** "Owner", "Tenant" or "Household member" — one rule for every place that labels a person. */
export function residentTypeLabel(
  r: Pick<ResidentRecord, 'isUnitOwner' | 'occupantId'>,
  hasOwnerRole: boolean,
): 'Owner' | 'Tenant' | 'Household member' {
  if (r.occupantId !== undefined) return 'Household member';
  return hasOwnerRole && r.isUnitOwner ? 'Owner' : 'Tenant';
}

/** Can be invited or re-invited: has a login account that has not been used yet. */
export function canBeInvited(r: Pick<ResidentRecord, 'portalStatus' | 'occupantId'>): boolean {
  return !isHouseholdMember(r) && r.portalStatus !== 'active';
}

export function toDirectoryResident(r: ResidentRecord): DirectoryResident {
  const displayName = r.fullName?.trim() || r.email || 'Unnamed resident';
  return { ...r, displayName, initials: initialsFor(displayName) };
}

export function buildDirectoryUnits(
  units: readonly Unit[],
  residents: readonly ResidentRecord[] | null,
  delinquency: readonly DelinquencyRow[] | null,
  ctx: DirectoryContext,
  rule: PastDueRule = ANY_OVERDUE_RULE,
): DirectoryUnit[] {
  const byUnit = new Map<number, DirectoryResident[]>();
  for (const r of residents ?? []) {
    // Managers can carry a unitId; only residents live in units.
    if (r.role !== 'resident' || r.unitId === null) continue;
    const list = byUnit.get(r.unitId) ?? [];
    list.push(toDirectoryResident(r));
    byUnit.set(r.unitId, list);
  }

  const pastDueByUnit = new Map<number, PastDue>();
  for (const row of delinquency ?? []) {
    if (row.overdueAmountCents > 0) {
      pastDueByUnit.set(row.unitId, {
        amountCents: row.overdueAmountCents,
        daysOverdue: row.daysOverdue,
      });
    }
  }

  return units
    .map((u): DirectoryUnit => {
      const people = (byUnit.get(u.id) ?? []).sort((a, b) =>
        a.displayName.localeCompare(b.displayName),
      );
      // Owners and tenants OF RECORD: household members (no login) live here
      // but are neither, so they never satisfy "owner/tenant on file".
      const ofRecord = people.filter((p) => p.occupantId === undefined);
      const owners = ctx.hasOwnerRole ? ofRecord.filter((p) => p.isUnitOwner) : [];
      const tenants = ctx.hasOwnerRole ? ofRecord.filter((p) => !p.isUnitOwner) : ofRecord;
      const occupant = occupantLineFor(u.occupancy, people, owners, tenants, ctx);
      const buildingKey = buildingKeyOf(u.building);
      const overdue = pastDueByUnit.get(u.id) ?? null;
      const buildingLabel = buildingLabelOf(buildingKey);
      return {
        id: u.id,
        unitNumber: u.unitNumber,
        buildingKey,
        buildingLabel,
        floor: u.floor,
        locationLabel: u.floor === null ? buildingLabel : `${buildingLabel} · Floor ${u.floor}`,
        bedrooms: u.bedrooms,
        bathrooms: u.bathrooms,
        sqft: u.sqft,
        rentAmount: u.rentAmount,
        occupancy: u.occupancy ?? null,
        occupancyConfirmed: u.occupancyConfirmed ?? false,
        occupancySource: u.occupancySource ?? 'manual',
        residents: people,
        owners,
        tenants,
        ownerText: ownerTextFor(people, owners, ctx),
        occupantLine: occupant.text,
        hasContradiction: occupant.contradiction,
        noOwner: ctx.hasOwnerRole && ctx.canSeeResidents && owners.length === 0,
        pastDue: overdue && isPastDue(overdue, rule) ? overdue : null,
        overdueBelowRule: overdue && !isPastDue(overdue, rule) ? overdue : null,
        openViolations: u.openViolations ?? 0,
      };
    })
    .sort(
      (a, b) =>
        a.buildingLabel.localeCompare(b.buildingLabel) ||
        unitNumberCollator.compare(a.unitNumber, b.unitNumber) ||
        a.id - b.id,
    );
}

/* ─────────────── Filters ─────────────── */

export type UnitStatusFilter = 'all' | 'past_due' | 'vacant' | 'no_owner';
export type ResidentStatusFilter = 'all' | 'owners' | 'tenants' | 'board' | 'not_active';

export function matchesUnitStatus(u: DirectoryUnit, status: UnitStatusFilter): boolean {
  switch (status) {
    case 'past_due':
      return u.pastDue !== null;
    case 'vacant':
      return u.occupancy === 'vacant';
    case 'no_owner':
      return u.noOwner;
    default:
      return true;
  }
}

function normalize(q: string): string {
  return q.trim().toLowerCase();
}

export function matchesUnitSearch(u: DirectoryUnit, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;
  return [u.unitNumber, u.buildingLabel, u.ownerText ?? '', u.occupantLine ?? '']
    .join(' ')
    .toLowerCase()
    .includes(q);
}

export function filterUnits(
  units: readonly DirectoryUnit[],
  opts: { status: UnitStatusFilter; building: string | null; query: string },
): DirectoryUnit[] {
  return units.filter(
    (u) =>
      matchesUnitStatus(u, opts.status) &&
      (opts.building === null || u.buildingKey === opts.building) &&
      matchesUnitSearch(u, opts.query),
  );
}

export interface DirectoryResidentRow extends DirectoryResident {
  unit: DirectoryUnit | null;
}

export function buildResidentRows(
  residents: readonly ResidentRecord[],
  units: readonly DirectoryUnit[],
): DirectoryResidentRow[] {
  const unitById = new Map(units.map((u) => [u.id, u]));
  return residents
    .filter((r) => r.role === 'resident')
    .map((r) => ({
      ...toDirectoryResident(r),
      unit: r.unitId === null ? null : (unitById.get(r.unitId) ?? null),
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function matchesResidentStatus(r: DirectoryResidentRow, status: ResidentStatusFilter): boolean {
  switch (status) {
    case 'owners':
      return r.isUnitOwner;
    case 'tenants':
      return !r.isUnitOwner && r.occupantId === undefined;
    case 'board':
      return r.designation !== null;
    case 'not_active':
      // Household members cannot sign in, so they are never "not activated".
      return r.portalStatus !== 'active' && r.portalStatus !== 'no_login';
    default:
      return true;
  }
}

export function matchesResidentSearch(r: DirectoryResidentRow, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;
  const digits = q.replace(/\D/g, '');
  const text = [r.displayName, r.email ?? '', r.unit?.unitNumber ?? ''].join(' ').toLowerCase();
  if (text.includes(q)) return true;
  // Phone: compare digits only, so "(305) 555" finds "+13055550100".
  return digits.length >= 3 && (r.phone ?? '').replace(/\D/g, '').includes(digits);
}

export function filterResidents(
  rows: readonly DirectoryResidentRow[],
  opts: { status: ResidentStatusFilter; building: string | null; query: string },
): DirectoryResidentRow[] {
  return rows.filter(
    (r) =>
      matchesResidentStatus(r, opts.status) &&
      // A resident with no unit has no building, so any building filter hides them.
      (opts.building === null || r.unit?.buildingKey === opts.building) &&
      matchesResidentSearch(r, opts.query),
  );
}

/* ─────────────── Buildings, floors, overview ─────────────── */

export interface BuildingOption {
  key: string;
  label: string;
  unitCount: number;
}

export function listBuildings(units: readonly DirectoryUnit[]): BuildingOption[] {
  const counts = new Map<string, number>();
  for (const u of units) counts.set(u.buildingKey, (counts.get(u.buildingKey) ?? 0) + 1);
  return [...counts.entries()]
    .map(([key, unitCount]) => ({ key, label: buildingLabelOf(key), unitCount }))
    .sort((a, b) => {
      // "No building" always last.
      if (a.key === NO_BUILDING_KEY) return 1;
      if (b.key === NO_BUILDING_KEY) return -1;
      return a.label.localeCompare(b.label);
    });
}

export interface FloorRow {
  label: string;
  units: DirectoryUnit[];
}

export interface BuildingGroup {
  key: string;
  label: string;
  units: DirectoryUnit[];
  /** Highest floor first; units with no floor last, labelled "—". */
  floors: FloorRow[];
  vacantCount: number;
  pastDueCount: number;
}

export function groupByBuilding(units: readonly DirectoryUnit[]): BuildingGroup[] {
  const groups = new Map<string, DirectoryUnit[]>();
  for (const u of units) {
    const list = groups.get(u.buildingKey) ?? [];
    list.push(u);
    groups.set(u.buildingKey, list);
  }
  return listBuildings(units).map(({ key, label }) => {
    const inBuilding = groups.get(key) ?? [];
    const floorKeys = [...new Set(inBuilding.map((u) => u.floor))].sort((a, b) => {
      if (a === null) return 1;
      if (b === null) return -1;
      return b - a;
    });
    return {
      key,
      label,
      units: inBuilding,
      floors: floorKeys.map((f) => ({
        label: f === null ? '—' : String(f),
        units: inBuilding.filter((u) => u.floor === f),
      })),
      vacantCount: inBuilding.filter((u) => u.occupancy === 'vacant').length,
      pastDueCount: inBuilding.filter((u) => u.pastDue !== null).length,
    };
  });
}

export interface OverviewStats {
  totalUnits: number;
  vacantUnits: number;
  occupiedUnits: number;
  pastDueCents: number;
  pastDueUnits: number;
  oldestPastDueDays: number;
  /** 0–100, or null with no residents (never NaN). */
  adoptionPct: number | null;
  notActiveResidents: number;
}

export function computeOverview(
  units: readonly DirectoryUnit[],
  residents: readonly DirectoryResidentRow[],
): OverviewStats {
  const vacantUnits = units.filter((u) => u.occupancy === 'vacant').length;
  const pastDue = units.filter((u) => u.pastDue !== null);
  // Adoption is a share of people who CAN sign in: household members are out.
  const withLogin = residents.filter((r) => r.portalStatus !== 'no_login');
  const active = withLogin.filter((r) => r.portalStatus === 'active').length;
  return {
    totalUnits: units.length,
    vacantUnits,
    occupiedUnits: units.length - vacantUnits,
    pastDueCents: pastDue.reduce((sum, u) => sum + (u.pastDue?.amountCents ?? 0), 0),
    pastDueUnits: pastDue.length,
    oldestPastDueDays: pastDue.reduce((max, u) => Math.max(max, u.pastDue?.daysOverdue ?? 0), 0),
    adoptionPct: withLogin.length === 0 ? null : Math.round((active / withLogin.length) * 100),
    notActiveResidents: withLogin.length - active,
  };
}

/* ── Send documents ─────────────────────────────────────────────────────── */

const SEND_STATUS_PHRASE: ReadonlyArray<[DocumentSendStatus, (n: number) => string]> = [
  ['emailed', (n) => `${n} emailed`],
  ['digest', (n) => `${n} in their email digest`],
  ['opted_out', (n) => `${n} turned off document emails`],
  ['no_access', (n) => `${n} can't open ${n === 1 ? 'them' : 'these'}`],
  ['not_member', (n) => `${n} no longer in this community`],
  ['failed', (n) => `${n} failed`],
];

/**
 * One toast line for a send, counting every recipient: "3 emailed, 1 in their
 * email digest, 1 turned off document emails." Opted-out is not a failure (it
 * is a courtesy copy that respects preferences), so it alone stays a success.
 */
export function describeSendResults(
  results: readonly { status: DocumentSendStatus; limitMessage?: string }[],
): {
  message: string;
  tone: 'success' | 'warning';
} {
  const count = (s: DocumentSendStatus) => results.filter((r) => r.status === s).length;
  const parts = SEND_STATUS_PHRASE.filter(([s]) => count(s) > 0).map(([s, phrase]) => phrase(count(s)));
  const problem = count('failed') + count('no_access') + count('not_member') > 0;
  return { message: withLimitReason(`${parts.join(', ')}.`, results), tone: problem ? 'warning' : 'success' };
}

/** Appends the email-cap reason when any recipient's batch was refused by it. */
export function withLimitReason(message: string, results: readonly { limitMessage?: string }[]): string {
  const reason = results.find((r) => r.limitMessage)?.limitMessage;
  return reason ? `${message} ${reason}` : message;
}
