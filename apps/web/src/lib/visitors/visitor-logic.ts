export type VisitorStatus =
  | 'expected'
  | 'checked_in'
  | 'checked_out'
  | 'expired'
  | 'overstayed'
  | 'revoked'
  | 'revoked_on_site';

export interface VisitorStatusInput {
  guestType: string;
  checkedInAt: Date | null;
  checkedOutAt: Date | null;
  validUntil: Date | null;
  revokedAt: Date | null;
}

/**
 * Recurring, permanent and vendor passes are good for every visit inside their
 * window; a `one_time` pass is finished once checked out. On a multi-use pass
 * `checkedInAt` / `checkedOutAt` describe the latest visit; each visit's times
 * are kept in `compliance_audit_log`.
 */
export const MULTI_USE_GUEST_TYPES = ['recurring', 'permanent', 'vendor'];

export function isMultiUsePass(guestType: string): boolean {
  return MULTI_USE_GUEST_TYPES.includes(guestType);
}

/**
 * Keep in step with the status filter SQL in `buildVisitorWhereClause`
 * (package-visitor-service.ts); the visitor integration test asserts the two agree.
 */
export function deriveVisitorStatus(visitor: VisitorStatusInput): VisitorStatus {
  const now = new Date();
  const onSite = visitor.checkedInAt !== null && visitor.checkedOutAt === null;
  if (visitor.revokedAt) return onSite ? 'revoked_on_site' : 'revoked';
  if (onSite) return visitor.validUntil && visitor.validUntil < now ? 'overstayed' : 'checked_in';
  if (visitor.checkedOutAt && !isMultiUsePass(visitor.guestType)) return 'checked_out';
  if (visitor.validUntil && visitor.validUntil < now) return 'expired';
  return 'expected';
}

const VISIT_DAYS: Record<string, { days: readonly string[]; label: string }> = {
  weekdays: { days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], label: 'weekdays' },
  weekends: { days: ['Sat', 'Sun'], label: 'weekends' },
  mon_wed_fri: { days: ['Mon', 'Wed', 'Fri'], label: 'Mon, Wed and Fri' },
  tue_thu: { days: ['Tue', 'Thu'], label: 'Tue and Thu' },
};

/**
 * The days a recurrence rule allows, for the check-in error message, or null
 * when the rule does not restrict days (`custom` is free text in the notes).
 */
export function visitDaysLabel(rule: string | null): string | null {
  return (rule && VISIT_DAYS[rule]?.label) ?? null;
}

/** Whether a pass with this recurrence rule may be used on `at`'s weekday in `timeZone`. */
export function isAllowedVisitDay(rule: string | null, at: Date, timeZone: string): boolean {
  const allowed = rule ? VISIT_DAYS[rule]?.days : undefined;
  if (!allowed) return true;
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(at);
  return allowed.includes(weekday);
}

export interface DeniedMatchInput {
  fullName: string;
  vehiclePlate: string | null;
  isActive?: boolean;
}

export function filterDeniedVisitorMatches<T extends DeniedMatchInput>(
  rows: T[],
  name: string | null,
  plate: string | null,
): T[] {
  const nameNorm = name?.toLowerCase().trim() ?? null;
  const plateNorm = plate?.toUpperCase().trim() ?? null;

  return rows.filter((row) => {
    if (row.isActive === false) return false;
    if (nameNorm && row.fullName.toLowerCase().trim() === nameNorm) return true;
    if (plateNorm && row.vehiclePlate?.toUpperCase().trim() === plateNorm) return true;
    return false;
  });
}
