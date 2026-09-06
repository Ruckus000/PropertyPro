import { describe, expect, it } from 'vitest';
import { resolveReportMode } from '@/lib/violations/report-mode';

/*
 * `CommunityRole` is the v3 vocabulary (resident / property_manager /
 * root_manager); the legacy names `manager` and `pm_admin` are retired and no
 * longer assignable to it. The two cases below still pin the non-resident
 * branch for those legacy strings, so they are routed through a signature that
 * admits them. Same function, same arguments — only the declared parameter
 * type is widened.
 */
const resolveReportModeWithLegacyRole = resolveReportMode as (
  role: Parameters<typeof resolveReportMode>[0] | 'manager' | 'pm_admin',
  residentUnitIds: Parameters<typeof resolveReportMode>[1],
) => ReturnType<typeof resolveReportMode>;

describe('resolveReportMode', () => {
  it('returns "resident" when resident has one or more units', () => {
    expect(resolveReportMode('resident', [5])).toBe('resident');
    expect(resolveReportMode('resident', [5, 9])).toBe('resident');
  });

  it('returns "resident_no_unit" when resident has zero units', () => {
    expect(resolveReportMode('resident', [])).toBe('resident_no_unit');
  });

  it('returns "staff" for manager regardless of unit ids', () => {
    expect(resolveReportModeWithLegacyRole('manager', [])).toBe('staff');
    expect(resolveReportModeWithLegacyRole('manager', [5])).toBe('staff');
  });

  it('returns "staff" for pm_admin regardless of unit ids', () => {
    expect(resolveReportModeWithLegacyRole('pm_admin', [])).toBe('staff');
    expect(resolveReportModeWithLegacyRole('pm_admin', [1, 2])).toBe('staff');
  });
});
