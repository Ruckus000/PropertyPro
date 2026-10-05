/**
 * Leases v3 — derived lease and unit state. Pure: no I/O, no clock.
 *
 * Status is DERIVED from dates, never stored. The stored `leases.status` only
 * records how a lease left the roster (`renewed`, `terminated`, `expired`,
 * `cancelled`); `active` covers upcoming, current and moving-out alike. That is
 * what fixes the prototype audit's P0s: ending a lease early no longer vacates
 * the unit on the spot, a recorded renewal does not take over before its start
 * date, and a lease that starts in the future does not count as occupied.
 *
 * `today` is a YYYY-MM-DD date in the COMMUNITY's timezone (AGENTS #16-17); the
 * caller resolves it. Dates are compared as strings, which is correct for
 * ISO dates and avoids the local-time pitfalls lease-expiration-service
 * documents.
 *
 * Mirrors the Leases Roster v3 prototype's `phase()` / `model()` so the API and
 * the page cannot disagree about what a unit is.
 */

export type StoredLeaseStatus = 'active' | 'expired' | 'renewed' | 'terminated' | 'cancelled';
export type LeaseEndVia = 'notice' | 'declined' | 'early' | 'transfer' | 'expiry';

export interface LeaseStateInput {
  id: number;
  unitId: number;
  status: StoredLeaseStatus | string;
  startDate: string;
  /** Null = month-to-month. */
  endDate: string | null;
  previousLeaseId: number | null;
  moveOutOn: string | null;
  endVia: LeaseEndVia | string | null;
}

export type LeasePhase = 'upcoming' | 'current' | 'ended' | 'cancelled';

export type UnitKind =
  | 'vacant'
  | 'offline'
  | 'leased'
  | 'expiring'
  | 'holdover'
  | 'month_to_month'
  | 'ending';

/** Urgency of a date-bound unit: past due, ≤ 7 days, ≤ 30 days, later. */
export type UrgencyTier = 'critical' | 'urgent' | 'aware' | 'calm';

export interface UnitState {
  unitId: number;
  kind: UnitKind;
  current: LeaseStateInput | null;
  /** The next upcoming lease (a signed renewal or a pre-lease). */
  next: LeaseStateInput | null;
  past: LeaseStateInput[];
  /** Days until the relevant date (end, or move-out when ending); null when none. */
  daysUntil: number | null;
  tier: UrgencyTier | null;
  /** The current lease's last day in the unit, when one is scheduled. */
  stopDate: string | null;
  /** The upcoming lease renews the current one (same chain). */
  renewalSigned: boolean;
  /** The current resident is leaving (notice, declined offer, early end, transfer). */
  movingOut: boolean;
  /** A new lease can be added now (vacant, or pre-leasing a unit being vacated). */
  canLease: boolean;
  /** Earliest start date for a new lease, when `canLease`. */
  availableFrom: string | null;
  vacantSince: string | null;
  preLeased: boolean;
}

export interface UnitOfflineInput {
  offlineSince: string | null;
}

const DAY_MS = 86_400_000;

function toDayNumber(isoDate: string): number {
  return Math.round(Date.parse(`${isoDate}T00:00:00Z`) / DAY_MS);
}

export function addDays(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return toDayNumber(toIso) - toDayNumber(fromIso);
}

/**
 * The last day of a `termMonths`-month lease starting on `startDate`: the day
 * before the same date n months later. When that date does not exist
 * (Aug 31 + 6 months → "Feb 31"), the term ends on the last day of that month —
 * Feb 28/29, not Mar 2.
 */
export function termEndDate(startDate: string, termMonths: number): string {
  const y = Number(startDate.slice(0, 4));
  const m0 = Number(startDate.slice(5, 7)) - 1 + termMonths;
  const day = Number(startDate.slice(8, 10));
  const targetYear = y + Math.floor(m0 / 12);
  const targetMonth = ((m0 % 12) + 12) % 12;
  const lastDayOfTarget = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  if (day > lastDayOfTarget) {
    return new Date(Date.UTC(targetYear, targetMonth, lastDayOfTarget)).toISOString().slice(0, 10);
  }
  return addDays(new Date(Date.UTC(targetYear, targetMonth, day)).toISOString().slice(0, 10), -1);
}

/** Whole-month term that produces exactly this end date, or null (custom / month-to-month). */
export function termMonthsFor(startDate: string, endDate: string | null): number | null {
  if (!endDate) return null;
  for (let k = 1; k <= 36; k += 1) {
    if (termEndDate(startDate, k) === endDate) return k;
  }
  return null;
}

/** The lease's last day in the unit, when a move-out is scheduled. */
export function leaseStopDate(lease: LeaseStateInput): string | null {
  return lease.moveOutOn ?? null;
}

function activeSuccessor(lease: LeaseStateInput, siblings: LeaseStateInput[]): LeaseStateInput | undefined {
  return siblings.find((l) => l.previousLeaseId === lease.id && l.status === 'active');
}

export function leasePhase(
  lease: LeaseStateInput,
  siblings: LeaseStateInput[],
  today: string,
): LeasePhase {
  if (lease.status === 'cancelled') return 'cancelled';
  if (lease.status !== 'active') return 'ended';
  if (lease.startDate > today) return 'upcoming';
  const stop = leaseStopDate(lease);
  if (stop && stop < today) return 'ended';
  if (lease.endDate && lease.endDate < today && activeSuccessor(lease, siblings)) return 'ended';
  return 'current';
}

function tierFor(days: number | null): UrgencyTier | null {
  if (days === null) return null;
  if (days < 0) return 'critical';
  if (days <= 7) return 'urgent';
  if (days <= 30) return 'aware';
  return 'calm';
}

/**
 * Derive one unit's state from its leases.
 *
 * @param alertWindowOuter the widest expiry alert window (e.g. 90). A lease
 *   ending within it is `expiring`; past its end with no successor, `holdover`.
 */
export function deriveUnitState(
  unitId: number,
  unitLeases: LeaseStateInput[],
  unit: UnitOfflineInput,
  today: string,
  alertWindowOuter: number,
): UnitState {
  const leases = [...unitLeases].sort((a, b) =>
    a.startDate < b.startDate ? 1 : a.startDate > b.startDate ? -1 : b.id - a.id,
  );
  const phases = new Map(leases.map((l) => [l.id, leasePhase(l, leases, today)]));
  const current = leases.find((l) => phases.get(l.id) === 'current') ?? null;
  const next =
    leases
      .filter((l) => phases.get(l.id) === 'upcoming')
      .sort((a, b) => (a.startDate < b.startDate ? -1 : 1))[0] ?? null;
  const past = leases.filter((l) => {
    const p = phases.get(l.id);
    return p === 'ended' || p === 'cancelled';
  });
  const renewalSigned = !!(current && next && next.previousLeaseId === current.id);
  const offline = unit.offlineSince !== null;

  let kind: UnitKind;
  let daysUntil: number | null = null;
  let stopDate: string | null = null;

  if (!current) {
    kind = offline && !next ? 'offline' : 'vacant';
  } else {
    stopDate = leaseStopDate(current);
    if (stopDate && (current.endVia === 'early' || current.endVia === 'transfer')) {
      kind = 'ending';
      daysUntil = daysBetween(today, stopDate);
    } else if (renewalSigned) {
      kind = current.endDate ? 'leased' : 'month_to_month';
      daysUntil = current.endDate ? daysBetween(today, current.endDate) : null;
    } else if (!current.endDate) {
      kind = 'month_to_month';
    } else {
      daysUntil = daysBetween(today, current.endDate);
      kind = daysUntil < 0 ? 'holdover' : daysUntil <= alertWindowOuter ? 'expiring' : 'leased';
    }
  }

  const movingOut = !!current && !renewalSigned && stopDate !== null;
  const lastRealPast = past.find((l) => l.status !== 'cancelled');
  const lastDayOfPast = lastRealPast ? (leaseStopDate(lastRealPast) ?? lastRealPast.endDate) : null;
  const vacantSince = !current && lastDayOfPast ? addDays(lastDayOfPast, 1) : null;
  const canLease = !next && (!current || movingOut) && !(offline && !current);
  const availableFrom = !canLease ? null : current && stopDate ? addDays(stopDate, 1) : vacantSince;

  return {
    unitId,
    kind,
    current,
    next,
    past,
    daysUntil,
    tier: tierFor(daysUntil),
    stopDate,
    renewalSigned,
    movingOut,
    canLease,
    availableFrom,
    vacantSince,
    preLeased: !current && !!next,
  };
}

/**
 * Apartment occupancy, decided by leases (Directory shows this instead of a
 * manual value): a current lease → `rented`; none → `vacant`, unless the unit
 * is offline, which is neither (null) and stays out of vacancy counts. A
 * signed lease that has not started does not make a unit rented.
 */
export function occupancyFromLeases(
  unitLeases: LeaseStateInput[],
  unit: UnitOfflineInput,
  today: string,
): 'rented' | 'vacant' | null {
  if (unitLeases.some((l) => leasePhase(l, unitLeases, today) === 'current')) return 'rented';
  return unit.offlineSince !== null ? null : 'vacant';
}

/** Occupied for occupancy maths: a current lease exists. Offline units are excluded from the denominator. */
export function isOccupied(state: UnitState): boolean {
  return state.current !== null;
}

// ── Florida notice dates (Ch. 83 Part II) ────────────────────────────────────
// Citations are from search extracts of flsenate.gov and still need counsel
// sign-off (decisions doc §4). The arithmetic is what the design specifies.

/** §83.575: the last day the resident may give notice to leave at term end. */
export function nonRenewalNoticeDeadline(endDate: string | null, noticeDays: number | null): string | null {
  if (!endDate || !noticeDays) return null;
  return addDays(endDate, -noticeDays);
}

/** §83.49(2): written deposit notice due within 30 days of receipt. */
export function depositNoticeDue(receivedOn: string | null): string | null {
  return receivedOn ? addDays(receivedOn, 30) : null;
}

/** §83.49(2): whether a recorded notice was sent after the 30-day deadline. */
export function depositNoticeLate(receivedOn: string | null, noticeSentOn: string | null): boolean {
  const due = depositNoticeDue(receivedOn);
  return !!(due && noticeSentOn && noticeSentOn > due);
}

/** §83.49(3)(a): refund-in-full and claim-notice deadlines after move-out. */
export function depositDispositionDeadlines(moveOutOn: string): { refundBy: string; claimBy: string } {
  return { refundBy: addDays(moveOutOn, 15), claimBy: addDays(moveOutOn, 30) };
}

/**
 * §83.57: a month-to-month tenancy needs at least 30 days' written notice
 * before the end of a monthly period. Returns true when `moveOutOn` is too
 * soon after `noticeOn`. The page warns; it does not block — the manager may
 * be recording an agreed early departure.
 */
export function monthToMonthNoticeShort(noticeOn: string, moveOutOn: string): boolean {
  return daysBetween(noticeOn, moveOutOn) < 30;
}
