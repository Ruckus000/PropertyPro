import { describe, expect, it } from 'vitest';
import { getComplianceObligation } from '../../../src/lib/marketing/compliance-obligation';

describe('getComplianceObligation', () => {
  it('condo 150+ units is required now', () => {
    const r = getComplianceObligation({ type: 'condo', count: 150 });
    expect(r.status).toBe('required-now');
    expect(r.required).toBe(true);
    expect(r.deadline).toBeNull();
  });

  it('condo 25–149 units is required now (deadline now in the past)', () => {
    const r = getComplianceObligation({ type: 'condo', count: 84 });
    expect(r.status).toBe('required-2026');
    expect(r.required).toBe(true);
    expect(r.headline).toBe('Required now');
    expect(r.detail).toBe(
      'Condominium associations of 25–149 units are required — as of January 1, 2026 — to maintain a compliant website with document posting, meeting notices, and an owner portal.',
    );
    expect(r.deadline).toBe('January 1, 2026');
  });

  it('condo boundary: 25 is required-2026, 24 is exempt', () => {
    expect(getComplianceObligation({ type: 'condo', count: 25 }).status).toBe('required-2026');
    expect(getComplianceObligation({ type: 'condo', count: 24 }).status).toBe('exempt');
  });

  it('condo under 25 is exempt', () => {
    const r = getComplianceObligation({ type: 'condo', count: 10 });
    expect(r.status).toBe('exempt');
    expect(r.required).toBe(false);
  });

  it('hoa 100+ parcels is required now; 99 is exempt', () => {
    expect(getComplianceObligation({ type: 'hoa', count: 100 }).status).toBe('required-now');
    expect(getComplianceObligation({ type: 'hoa', count: 99 }).status).toBe('exempt');
  });

  it('every result carries a headline and detail string', () => {
    const r = getComplianceObligation({ type: 'condo', count: 84 });
    expect(r.headline.length).toBeGreaterThan(0);
    expect(r.detail.length).toBeGreaterThan(0);
  });

  it('throws on a non-positive or non-integer count', () => {
    expect(() => getComplianceObligation({ type: 'condo', count: 0 })).toThrow();
    expect(() => getComplianceObligation({ type: 'condo', count: -5 })).toThrow();
    expect(() => getComplianceObligation({ type: 'condo', count: 1.5 })).toThrow();
  });
});
