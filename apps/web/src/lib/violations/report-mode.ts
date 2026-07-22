import type { CommunityRole } from '@propertypro/shared';

export type ViolationReportMode = 'resident' | 'resident_no_unit' | 'staff';

/**
 * Chooses which report UI to render based on actor role and unit associations.
 * - Residents with at least one unit → standard self-report form.
 * - Residents with zero units → guard state (cannot report, missing unit link).
 * - Non-residents (manager/pm_admin and v3 property_manager/root_manager) →
 *   staff form with unit picker.
 */
export function resolveReportMode(
  role: CommunityRole,
  residentUnitIds: number[],
): ViolationReportMode {
  if (role !== 'resident') return 'staff';
  return residentUnitIds.length === 0 ? 'resident_no_unit' : 'resident';
}
