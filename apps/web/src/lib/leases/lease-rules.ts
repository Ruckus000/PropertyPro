/**
 * Leases — validation rules shared by the leases, offers and transfer routes.
 *
 * Moved verbatim out of `app/api/v1/leases/route.ts` (Leases v3) so creating a
 * lease from a signed renewal offer or a transfer runs the exact checks a
 * direct create does. Error messages are unchanged — tests assert them.
 */
import { ConflictError, ValidationError } from '@/lib/api/errors';
import { listUnpaidObligationsForLease, type LeaseResidentRow } from '@/lib/services/lease-service';

export type LeaseLikeRow = {
  id: number;
  unitId: number;
  residentId: string | null;
  startDate: string;
  endDate: string | null;
  status: string;
  previousLeaseId: number | null;
  moveOutOn?: string | null;
};

export function parseIsoDateOnly(value: string, fieldName: string): Date {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError(`${fieldName} must be a valid date in YYYY-MM-DD format`);
  }
  return parsed;
}

export function isFirstDayOfMonth(value: string): boolean {
  return value.endsWith('-01');
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function dateRangesOverlap(
  startA: Date,
  endA: Date | null,
  startB: Date,
  endB: Date | null,
): boolean {
  const aEnd = endA ?? new Date('9999-12-31T00:00:00.000Z');
  const bEnd = endB ?? new Date('9999-12-31T00:00:00.000Z');
  return startA <= bEnd && startB <= aEnd;
}

export function validateLeaseDateWindow(startDate: string, endDate: string | null): void {
  if (!isFirstDayOfMonth(startDate)) {
    throw new ValidationError('Lease startDate must be the first day of the month (YYYY-MM-01)');
  }
  const start = parseIsoDateOnly(startDate, 'startDate');
  if (endDate) {
    const end = parseIsoDateOnly(endDate, 'endDate');
    if (end <= start) {
      throw new ValidationError('endDate must be after startDate');
    }
  }
}

/** The last day a lease occupies its unit: a scheduled move-out when earlier than the end date. */
export function effectiveEndDate(lease: { endDate: string | null; moveOutOn?: string | null }): string | null {
  const moveOut = lease.moveOutOn ?? null;
  if (moveOut && (!lease.endDate || moveOut < lease.endDate)) return moveOut;
  return lease.endDate;
}

export function ensureNoUnitLeaseOverlap(
  candidate: { id?: number; unitId: number; startDate: string; endDate: string | null },
  existingLeases: LeaseLikeRow[],
): void {
  const candidateStart = parseIsoDateOnly(candidate.startDate, 'startDate');
  const candidateEnd = candidate.endDate ? parseIsoDateOnly(candidate.endDate, 'endDate') : null;
  const overlaps = existingLeases.some((existing) => {
    if (candidate.id !== undefined && existing.id === candidate.id) return false;
    if (existing.unitId !== candidate.unitId) return false;
    if (existing.status === 'terminated' || existing.status === 'cancelled') return false;
    const existingStart = parseIsoDateOnly(existing.startDate, 'startDate');
    const existingLastDay = effectiveEndDate(existing);
    const existingEnd = existingLastDay ? parseIsoDateOnly(existingLastDay, 'endDate') : null;
    return dateRangesOverlap(candidateStart, candidateEnd, existingStart, existingEnd);
  });
  if (overlaps) {
    throw new ValidationError('Lease period overlaps an existing lease for this unit');
  }
}

export function ensureRenewalContinuity(
  candidate: { unitId: number; residentUserIds: string[]; startDate: string; previousLeaseId: number },
  previousLease: LeaseLikeRow,
  previousResidentUserIds: string[],
): void {
  if (previousLease.unitId !== candidate.unitId) {
    throw new ValidationError('Renewal lease must use the same unit as the previous lease');
  }
  // Leases v3 (E3): residents may change at renewal, but at least one must
  // carry over — otherwise this is a new lease, not a renewal. With a single
  // resident on each side this is the pre-v3 "same resident" rule exactly.
  const carriesOver = candidate.residentUserIds.some((id) => previousResidentUserIds.includes(id));
  if (!carriesOver) {
    throw new ValidationError('Renewal lease must use the same resident as the previous lease');
  }
  if (!previousLease.endDate) {
    throw new ValidationError('Previous lease must have an endDate before creating a renewal');
  }

  const previousEndDate = parseIsoDateOnly(previousLease.endDate, 'previousLease.endDate');
  const expectedStartDate = addDays(previousEndDate, 1);
  const actualStartDate = parseIsoDateOnly(candidate.startDate, 'startDate');
  if (actualStartDate.getTime() !== expectedStartDate.getTime()) {
    throw new ValidationError('Renewal lease startDate must be the day after the previous lease endDate');
  }
}

/** User ids currently on a lease: lease_residents rows, falling back to the legacy column. */
export function residentUserIdsFor(
  lease: { id: number; residentId: string | null },
  residentRows: LeaseResidentRow[],
): string[] {
  const ids = residentRows
    .filter((r) => r.leaseId === lease.id && r.removedOn == null && r.userId)
    .map((r) => r.userId as string);
  if (lease.residentId && !ids.includes(lease.residentId)) ids.push(lease.residentId);
  return ids;
}

export function isZeroRent(amount: string | null | undefined): boolean {
  return amount != null && Number(amount) === 0;
}

export function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: unknown; cause?: { code?: unknown } } | null)?.code
    ?? (err as { cause?: { code?: unknown } } | null)?.cause?.code;
  return code === '23505';
}

export async function ensureNoUnpaidObligations(communityId: number, leaseId: number, action: string): Promise<void> {
  const unpaid = await listUnpaidObligationsForLease(communityId, leaseId);
  if (unpaid.length > 0) {
    throw new ConflictError(
      `This lease has ${unpaid.length} unpaid rent ${unpaid.length === 1 ? 'charge' : 'charges'}. Settle or waive ${unpaid.length === 1 ? 'it' : 'them'} before you ${action}.`,
      { unpaidObligations: unpaid },
    );
  }
}

