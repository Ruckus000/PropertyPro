import type { CommunityRole } from '@propertypro/shared';

export type ViolationReportMode = 'resident' | 'resident_no_unit' | 'staff';

/**
 * Chooses which report UI to render based on actor role and unit associations.
 * - Residents with at least one unit → resident form, which picks ANY unit in
 *   the community (D1: a neighbour complaint is filed against the neighbour's
 *   unit). Their own units only decide whether they may file at all.
 * - Residents with zero units → guard state (cannot report, missing unit link).
 * - Non-residents (property_manager / root_manager — `CommunityRole` admits no
 *   others) → staff form with unit picker. Board designation does not qualify:
 *   a board member is `role === 'resident'` and gets the resident form.
 */
export function resolveReportMode(
  role: CommunityRole,
  residentUnitIds: number[],
): ViolationReportMode {
  if (role !== 'resident') return 'staff';
  return residentUnitIds.length === 0 ? 'resident_no_unit' : 'resident';
}
