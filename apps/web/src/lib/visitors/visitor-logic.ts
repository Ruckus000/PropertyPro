export type VisitorStatus =
  | 'expected'
  | 'checked_in'
  | 'checked_out'
  | 'expired'
  | 'overstayed'
  | 'revoked'
  | 'revoked_on_site';

export interface VisitorStatusInput {
  checkedInAt: Date | null;
  checkedOutAt: Date | null;
  validUntil: Date | null;
  revokedAt: Date | null;
}

export function deriveVisitorStatus(visitor: VisitorStatusInput): VisitorStatus {
  if (visitor.revokedAt && !visitor.checkedOutAt) return 'revoked_on_site';
  if (visitor.revokedAt) return 'revoked';
  if (visitor.checkedOutAt) return 'checked_out';
  if (visitor.checkedInAt && visitor.validUntil && visitor.validUntil < new Date()) return 'overstayed';
  if (visitor.checkedInAt) return 'checked_in';
  if (visitor.validUntil && visitor.validUntil < new Date()) return 'expired';
  return 'expected';
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
