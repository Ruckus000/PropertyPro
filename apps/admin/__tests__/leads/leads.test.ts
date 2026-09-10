import { beforeEach, describe, expect, it, vi } from 'vitest';

const orderMock = vi.fn();

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminTypedClient: () => ({
    from: (table: string) => {
      if (table !== 'marketing_leads') throw new Error(`Unexpected table: ${table}`);
      return {
        select: () => ({
          order: (...args: unknown[]) => orderMock(...args),
        }),
      };
    },
  }),
}));

import { getLeadsData, isInIcp } from '@/lib/server/leads';

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    email: 'a@b.com',
    email_normalized: 'a@b.com',
    association_name: 'Sunset Condos',
    contact_name: null,
    association_type: null,
    unit_count: 80,
    community_count: null,
    message: null,
    obligation_required: null,
    source: 'compliance_checker',
    status: 'new',
    notes: null,
    created_at: '2026-09-08T10:00:00Z',
    updated_at: '2026-09-08T10:00:00Z',
    ...overrides,
  };
}

describe('isInIcp', () => {
  it('accepts a compliance_checker lead inside the 25-149 unit ICP band', () => {
    expect(isInIcp({ source: 'compliance_checker', unit_count: 80 })).toBe(true);
  });

  it('rejects a pm_inquiry lead with the same unit_count — it is a portfolio total, not a single association', () => {
    expect(isInIcp({ source: 'pm_inquiry', unit_count: 80 })).toBe(false);
  });

  it('rejects a null unit_count regardless of source', () => {
    expect(isInIcp({ source: 'compliance_checker', unit_count: null })).toBe(false);
  });
});

// isInIcp's parameter type was widened from MarketingLeadRow to
// Pick<MarketingLeadRow, 'source' | 'unit_count'> so the signals provider
// (apps/admin/src/lib/server/signals/leads.ts) could reuse it without
// selecting every column. This suite proves the ORIGINAL caller — mapLead,
// invoked from getLeadsData, which still passes a full MarketingLeadRow —
// keeps behaving exactly as before the widening.
describe('getLeadsData — original isInIcp caller (mapLead) still behaves', () => {
  beforeEach(() => {
    orderMock.mockReset();
  });

  it('flags inIcp on a full row for a compliance_checker lead in-band, and counts it in stats.inIcp', async () => {
    orderMock.mockResolvedValue({
      data: [row({ id: 1, source: 'compliance_checker', unit_count: 80 })],
      error: null,
    });

    const { leads, stats } = await getLeadsData();

    expect(leads[0]?.inIcp).toBe(true);
    expect(stats.inIcp).toBe(1);
  });

  it('does not flag inIcp for a pm_inquiry lead in the same band', async () => {
    orderMock.mockResolvedValue({
      data: [row({ id: 2, source: 'pm_inquiry', unit_count: 80 })],
      error: null,
    });

    const { leads, stats } = await getLeadsData();

    expect(leads[0]?.inIcp).toBe(false);
    expect(stats.inIcp).toBe(0);
  });
});
