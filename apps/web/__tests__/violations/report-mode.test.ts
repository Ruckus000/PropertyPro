import { describe, expect, it } from 'vitest';
import { resolveReportMode } from '@/lib/violations/report-mode';

describe('resolveReportMode', () => {
  it('returns "resident" when resident has one or more units', () => {
    expect(resolveReportMode('resident', [5])).toBe('resident');
    expect(resolveReportMode('resident', [5, 9])).toBe('resident');
  });

  it('returns "resident_no_unit" when resident has zero units', () => {
    expect(resolveReportMode('resident', [])).toBe('resident_no_unit');
  });

  it('returns "staff" for manager regardless of unit ids', () => {
    expect(resolveReportMode('manager', [])).toBe('staff');
    expect(resolveReportMode('manager', [5])).toBe('staff');
  });

  it('returns "staff" for pm_admin regardless of unit ids', () => {
    expect(resolveReportMode('pm_admin', [])).toBe('staff');
    expect(resolveReportMode('pm_admin', [1, 2])).toBe('staff');
  });
});
