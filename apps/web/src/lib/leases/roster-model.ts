/**
 * Leases v3 roster model — pure. Builds one row per unit from the API data,
 * then the tiles, filters, sort and floor groups the Leases page renders.
 *
 * Ported from the Leases Roster v3 prototype (`model()`, `row()`,
 * `listVals()`), rebuilt on `lease-state` so the page and the API derive a
 * unit's status the same way. No React, no clock: `today` is passed in.
 */
import {
  deriveUnitState,
  daysBetween,
  addDays,
  leasePhase,
  type LeaseStateInput,
  type UnitState,
  type UrgencyTier,
} from './lease-state';

// ── Inputs (the API wire shapes the page needs) ──────────────────────────────

export interface RosterUnit {
  id: number;
  unitNumber: string;
  building: string | null;
  floor: number | null;
  rentAmount: string | null;
  offlineReason?: string | null;
  offlineNote?: string | null;
  offlineSince?: string | null;
  offlineUntil?: string | null;
}

export interface RosterResident {
  userId: string | null;
  occupantId: number | null;
  isPrimary: boolean;
  removedOn: string | null;
  occupant: { fullName: string; email?: string | null } | null;
}

export interface RosterLease extends LeaseStateInput {
  residentId: string | null;
  rentAmount: string | null;
  notes: string | null;
  version?: number;
  noticeDays?: number | null;
  zeroRentReason?: string | null;
  endReason?: string | null;
  noticeReceivedOn?: string | null;
  cancelledReason?: string | null;
  transferredFromLeaseId?: number | null;
  signedDocumentId?: number | null;
  residents?: RosterResident[];
  deposits?: Array<{
    id: number;
    amount: string;
    heldMethod: string | null;
    depository: string | null;
    receivedOn: string | null;
    noticeSentOn: string | null;
    disposition: string | null;
    dispositionOn: string | null;
    claimedAmount: string | null;
  }>;
}

export interface RosterOffer {
  id: number;
  leaseId: number;
  stage: 'offer_sent' | 'accepted' | 'declined' | 'expired' | 'signed' | 'withdrawn';
  offerRent: string;
  termMonths: number | null;
  customEndDate: string | null;
  startDate: string;
  depositAmount: string | null;
  sentOn: string;
  expiresOn: string;
  respondedOn: string | null;
  renewalLeaseId: number | null;
}

export interface PersonDirectory {
  /** user id → name / email (from /api/v1/residents) */
  users: Map<string, { name: string; email: string }>;
}

// ── Outputs ──────────────────────────────────────────────────────────────────

export type RenewalStage =
  | 'not_started'
  | 'offer_sent'
  | 'offer_expired'
  | 'accepted'
  | 'declined'
  | 'notice'
  | 'signed'
  | 'ending';

export type RowAction =
  | 'new_lease'
  | 'pre_lease'
  | 'send_offer'
  | 'resend_offer'
  | 'record_response'
  | 'record_renewal'
  /** Holdover: an offer cannot fix it (the new term would start in the past) — open the unit to convert or record a move-out. */
  | 'resolve_holdover';

export type StatusLabel =
  | 'Leased'
  | 'Month-to-month'
  | 'Pre-leased'
  | 'Expiring'
  | 'Ending'
  | 'Holdover'
  | 'Vacant'
  | 'Offline';

export interface PersonRef {
  name: string;
  email: string | null;
  userId: string | null;
  occupantId: number | null;
  isPrimary: boolean;
}

export interface UnitModel {
  unit: RosterUnit;
  state: UnitState;
  current: RosterLease | null;
  next: RosterLease | null;
  past: RosterLease[];
  /** The open or most recent offer on the current lease. */
  offer: RosterOffer | null;
  stage: RenewalStage | null;
  status: StatusLabel;
  /** Leased / Month-to-month / Pre-leased read as plain text; the rest get a badge. */
  statusIsCalm: boolean;
  people: PersonRef[];
  action: RowAction | null;
  /** Sort key for "Lease end": holdovers first, then soonest. */
  endSortKey: number;
  groupKey: string;
}

export type RosterFilter = 'all' | 'expiring' | 'vacant' | 'm2m' | 'past';
export type RosterSort = 'unit' | 'end';

// ── Names ────────────────────────────────────────────────────────────────────

export function peopleOn(lease: RosterLease | null, dir: PersonDirectory): PersonRef[] {
  if (!lease) return [];
  const rows: RosterResident[] =
    lease.residents && lease.residents.length > 0
      ? lease.residents.filter((r) => r.removedOn == null)
      : lease.residentId
        ? [{ userId: lease.residentId, occupantId: null, isPrimary: true, removedOn: null, occupant: null }]
        : [];
  return rows
    .map((r) => {
      const user = r.userId ? dir.users.get(r.userId) : undefined;
      return {
        name: r.occupant?.fullName ?? user?.name ?? 'Unknown resident',
        email: user?.email ?? r.occupant?.email ?? null,
        userId: r.userId,
        occupantId: r.occupantId,
        isPrimary: r.isPrimary,
      };
    })
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
}

/** Lower-case and strip accents, so "Beltran" finds "Beltrán". */
export function fold(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0]!)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// ── Model ────────────────────────────────────────────────────────────────────

function renewalStage(state: UnitState, offer: RosterOffer | null, today: string): RenewalStage | null {
  const cur = state.current;
  if (!cur) return null;
  if (state.kind === 'ending') return 'ending';
  if (state.renewalSigned) return 'signed';
  if (cur.moveOutOn && cur.endVia === 'declined') return 'declined';
  if (cur.moveOutOn && cur.endVia === 'notice') return 'notice';
  if (offer && (offer.stage === 'offer_sent' || offer.stage === 'accepted')) {
    if (offer.stage === 'offer_sent' && offer.expiresOn < today) return 'offer_expired';
    return offer.stage;
  }
  if (state.kind === 'expiring' || state.kind === 'holdover') return 'not_started';
  return null;
}

function statusLabel(state: UnitState): StatusLabel {
  if (state.preLeased) return 'Pre-leased';
  switch (state.kind) {
    case 'leased':
      return 'Leased';
    case 'month_to_month':
      return 'Month-to-month';
    case 'expiring':
      return 'Expiring';
    case 'ending':
      return 'Ending';
    case 'holdover':
      return 'Holdover';
    case 'offline':
      return 'Offline';
    default:
      return 'Vacant';
  }
}

function rowAction(m: Pick<UnitModel, 'state' | 'stage'>): RowAction | null {
  const s = m.state;
  if (s.kind === 'offline') return null;
  if (!s.current && !s.next) return 'new_lease';
  if (s.current && s.movingOut) return s.next ? null : 'pre_lease';
  if (s.kind === 'holdover') return 'resolve_holdover';
  switch (m.stage) {
    case 'not_started':
      return 'send_offer';
    case 'offer_expired':
      return 'resend_offer';
    case 'offer_sent':
      return 'record_response';
    case 'accepted':
      return 'record_renewal';
    default:
      return null;
  }
}

function endSortKey(s: UnitState): number {
  if (s.kind === 'holdover') return -99_999 + (s.daysUntil ?? 0);
  if (s.daysUntil !== null) return s.daysUntil;
  if (s.kind === 'month_to_month') return 99_999;
  return 999_999;
}

/**
 * The leases whose renewal offers the roster can show: current or upcoming on
 * `today`. In v3 a renewed or moved-out lease keeps status `active`, so
 * "every active lease" grows with each renewal cycle; this stays at about two
 * per unit.
 */
export function liveLeaseIds(leases: RosterLease[], today: string): number[] {
  const byUnit = new Map<number, RosterLease[]>();
  for (const l of leases) byUnit.set(l.unitId, [...(byUnit.get(l.unitId) ?? []), l]);
  return leases
    .filter((l) => {
      const phase = leasePhase(l, byUnit.get(l.unitId) ?? [], today);
      return phase === 'current' || phase === 'upcoming';
    })
    .map((l) => l.id)
    .sort((a, b) => a - b);
}

export function groupKeyFor(unit: RosterUnit): string {
  const floor = unit.floor != null ? `Floor ${unit.floor}` : 'No floor';
  return unit.building ? `${unit.building} · ${floor}` : floor;
}

export function buildRoster(input: {
  units: RosterUnit[];
  leases: RosterLease[];
  offers: RosterOffer[];
  directory: PersonDirectory;
  today: string;
  alertWindows: number[];
}): UnitModel[] {
  const outer = Math.max(...input.alertWindows, 1);
  const byUnit = new Map<number, RosterLease[]>();
  for (const l of input.leases) byUnit.set(l.unitId, [...(byUnit.get(l.unitId) ?? []), l]);
  const offersByLease = new Map<number, RosterOffer[]>();
  for (const o of input.offers) offersByLease.set(o.leaseId, [...(offersByLease.get(o.leaseId) ?? []), o]);

  return input.units.map((unit) => {
    const leases = byUnit.get(unit.id) ?? [];
    const state = deriveUnitState(unit.id, leases, { offlineSince: unit.offlineSince ?? null }, input.today, outer);
    const current = (state.current as RosterLease | null) ?? null;
    const next = (state.next as RosterLease | null) ?? null;
    const offers = current ? (offersByLease.get(current.id) ?? []) : [];
    const offer =
      offers.find((o) => o.stage === 'offer_sent' || o.stage === 'accepted') ??
      [...offers].sort((a, b) => (a.sentOn < b.sentOn ? 1 : -1))[0] ??
      null;
    const stage = renewalStage(state, offer, input.today);
    const status = statusLabel(state);
    const m: UnitModel = {
      unit,
      state,
      current,
      next,
      past: state.past as RosterLease[],
      offer,
      stage,
      status,
      statusIsCalm: status === 'Leased' || status === 'Month-to-month' || status === 'Pre-leased',
      people: peopleOn(current ?? next, input.directory),
      action: null,
      endSortKey: endSortKey(state),
      groupKey: groupKeyFor(unit),
    };
    m.action = rowAction(m);
    return m;
  });
}

// ── Tiles ────────────────────────────────────────────────────────────────────

export interface RosterTiles {
  all: { units: number; occupied: number; offline: number; occupancyPct: number };
  renewalsDue: { count: number; holdovers: number; withoutOffer: number; window: number };
  vacant: { count: number; empty: number; preLeased: number; movingOut: number; offline: number; avgDaysEmpty: number };
  monthToMonth: { count: number };
}

export function isRenewalDue(m: UnitModel): boolean {
  return (
    (m.state.kind === 'expiring' || m.state.kind === 'holdover') &&
    (m.stage === 'not_started' || m.stage === 'offer_sent' || m.stage === 'offer_expired' || m.stage === 'accepted')
  );
}

export function buildTiles(models: UnitModel[], today: string, alertWindows: number[]): RosterTiles {
  const offline = models.filter((m) => m.state.kind === 'offline').length;
  const occupied = models.filter((m) => m.state.current).length;
  const rentable = models.length - offline;
  const due = models.filter(isRenewalDue);
  const vacant = models.filter((m) => !m.state.current && m.state.kind !== 'offline');
  const empty = vacant.filter((m) => !m.state.next);
  const daysEmpty = empty.map((m) => (m.state.vacantSince ? Math.max(0, daysBetween(m.state.vacantSince, today)) : 0));
  return {
    all: {
      units: models.length,
      occupied,
      offline,
      // Offline units are not rentable, so they leave the denominator.
      occupancyPct: rentable > 0 ? (occupied / rentable) * 100 : 0,
    },
    renewalsDue: {
      count: due.length,
      holdovers: due.filter((m) => m.state.kind === 'holdover').length,
      withoutOffer: due.filter((m) => m.stage === 'not_started').length,
      window: Math.max(...alertWindows, 1),
    },
    vacant: {
      count: vacant.length,
      empty: empty.length,
      preLeased: vacant.length - empty.length,
      movingOut: models.filter((m) => m.state.movingOut).length,
      offline,
      avgDaysEmpty: daysEmpty.length ? Math.round(daysEmpty.reduce((a, b) => a + b, 0) / daysEmpty.length) : 0,
    },
    monthToMonth: { count: models.filter((m) => m.state.kind === 'month_to_month').length },
  };
}

// ── Filter, search, sort, group ──────────────────────────────────────────────

export function matchesSearch(m: UnitModel, query: string): boolean {
  const q = fold(query.trim());
  if (!q) return true;
  if (fold(m.unit.unitNumber).includes(q)) return true;
  return m.people.some((p) => fold(p.name).includes(q) || (p.email ?? '').toLowerCase().includes(q));
}

const byUnitNumber = (a: UnitModel, b: UnitModel) =>
  a.unit.unitNumber.localeCompare(b.unit.unitNumber, undefined, { numeric: true });

export interface RosterGroup {
  key: string;
  title: string | null;
  meta: string | null;
  rows: UnitModel[];
}

export function filterAndGroup(
  models: UnitModel[],
  opts: { filter: Exclude<RosterFilter, 'past'>; sort: RosterSort; query: string },
): { groups: RosterGroup[]; total: number } {
  let list = models.filter((m) => {
    switch (opts.filter) {
      case 'expiring':
        return isRenewalDue(m);
      case 'vacant':
        return !m.state.current || m.state.movingOut;
      case 'm2m':
        return m.state.kind === 'month_to_month';
      default:
        return true;
    }
  });
  list = list.filter((m) => matchesSearch(m, opts.query));
  list.sort((a, b) => (opts.sort === 'unit' ? byUnitNumber(a, b) : a.endSortKey - b.endSortKey || byUnitNumber(a, b)));

  let groups: RosterGroup[];
  if (opts.filter === 'vacant') {
    const empty = list.filter((m) => !m.state.current && m.state.kind !== 'offline');
    const leaving = list.filter((m) => m.state.current);
    const offline = list.filter((m) => m.state.kind === 'offline');
    groups = [
      { key: 'vacant', title: 'Vacant', meta: `${empty.length} ${empty.length === 1 ? 'unit' : 'units'}`, rows: empty },
      { key: 'moving_out', title: 'Moving out', meta: 'Pre-lease these before they empty', rows: leaving },
      { key: 'offline', title: 'Offline', meta: 'Not rentable, so not counted as vacant', rows: offline },
    ].filter((g) => g.rows.length > 0);
  } else if (opts.sort === 'unit' && opts.filter === 'all' && !opts.query.trim()) {
    const keys = [...new Set(list.map((m) => m.groupKey))];
    groups = keys.map((key) => {
      const rows = list.filter((m) => m.groupKey === key);
      return { key, title: key, meta: `${rows.filter((m) => m.state.current).length} of ${rows.length} occupied`, rows };
    });
  } else {
    groups = [{ key: 'flat', title: null, meta: null, rows: list }];
  }
  return { groups, total: list.length };
}

/** Past leases (ended, renewed, transferred, cancelled), newest first or by unit. */
export function pastLeases(
  models: UnitModel[],
  opts: { sort: RosterSort; query: string },
  dir: PersonDirectory,
): Array<{ model: UnitModel; lease: RosterLease; people: PersonRef[]; lastDay: string }> {
  const rows = models.flatMap((m) =>
    m.past.map((lease) => ({
      model: m,
      lease,
      people: peopleOn(lease, dir),
      lastDay: lease.status === 'cancelled' ? lease.startDate : (lease.moveOutOn ?? lease.endDate ?? lease.startDate),
    })),
  );
  const q = fold(opts.query.trim());
  const filtered = q
    ? rows.filter(
        (r) =>
          fold(r.model.unit.unitNumber).includes(q) ||
          r.people.some((p) => fold(p.name).includes(q) || (p.email ?? '').toLowerCase().includes(q)),
      )
    : rows;
  return filtered.sort((a, b) =>
    opts.sort === 'unit'
      ? byUnitNumber(a.model, b.model) || (a.lease.startDate < b.lease.startDate ? 1 : -1)
      : a.lastDay < b.lastDay
        ? 1
        : -1,
  );
}

// ── Copy helpers ─────────────────────────────────────────────────────────────

export function span(days: number): string {
  const n = Math.abs(days);
  if (n >= 60) return `${Math.round(n / 30.4)} months`;
  return `${n} ${n === 1 ? 'day' : 'days'}`;
}

export function inDays(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  return days > 0 ? `in ${span(days)}` : `${span(days)} ago`;
}

export const ACTION_LABEL: Record<RowAction, string> = {
  new_lease: 'New lease',
  pre_lease: 'Pre-lease',
  send_offer: 'Send offer',
  resend_offer: 'Resend offer',
  record_response: 'Record response',
  record_renewal: 'Record renewal',
  resolve_holdover: 'Resolve holdover',
};

export function tierOf(m: UnitModel): UrgencyTier {
  if (m.state.kind === 'holdover') return 'critical';
  if (m.stage === 'signed' || m.state.movingOut) return 'calm';
  return m.state.tier ?? 'calm';
}

/** First of next month from `today` — where a new lease starts by default (decisions D8). */
export function firstOfNextMonth(today: string): string {
  const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

/** Earliest allowed start for a new lease on this unit, snapped to the 1st (D8). */
export function defaultStartFor(m: UnitModel, today: string): string {
  const from = m.state.availableFrom && m.state.availableFrom > today ? m.state.availableFrom : today;
  return from.endsWith('-01') ? from : firstOfNextMonth(from);
}

export { addDays };
