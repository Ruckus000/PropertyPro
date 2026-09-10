import { describe, expect, it } from 'vitest';
import { applyClientFilter } from '@/components/clients/ClientPortfolio';

const row = (over: Partial<any>) => ({ id: 1, name: 'A', slug: 'a', community_type: 'condo_718', city: null, state: null, subscription_status: 'active', subscription_plan: 'professional', created_at: '2026-01-01', complianceScore: 90, memberCount: 3, rootless: false, disputeOpen: false, ...over });

describe('applyClientFilter', () => {
  const rows = [row({ id: 1, name: 'Bayview', subscription_status: 'past_due' }), row({ id: 2, name: 'Marina', complianceScore: 55 }), row({ id: 3, name: 'Pelican', subscription_status: 'trialing', rootless: true }), row({ id: 4, name: 'Sunset Ridge', community_type: 'apartment', complianceScore: null })];
  it('past_due / at_risk / trialing / rootless select the right rows', () => {
    expect(applyClientFilter(rows, 'past_due', '', 'all').map((r) => r.id)).toEqual([1]);
    expect(applyClientFilter(rows, 'at_risk', '', 'all').map((r) => r.id)).toEqual([2]);
    expect(applyClientFilter(rows, 'trialing', '', 'all').map((r) => r.id)).toEqual([3]);
    expect(applyClientFilter(rows, 'rootless', '', 'all').map((r) => r.id)).toEqual([3]);
  });
  it('a null compliance score is never "at risk"', () => {
    expect(applyClientFilter(rows, 'at_risk', '', 'all').some((r) => r.id === 4)).toBe(false);
  });
  it('search and type compose with the filter', () => {
    expect(applyClientFilter(rows, 'all', 'sun', 'apartment').map((r) => r.id)).toEqual([4]);
  });
});
