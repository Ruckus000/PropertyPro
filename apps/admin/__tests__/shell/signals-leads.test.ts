import { beforeEach, describe, expect, it, vi } from 'vitest';

const limitMock = vi.fn();

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminTypedClient: () => ({
    from: (table: string) => {
      if (table !== 'marketing_leads') throw new Error(`Unexpected table: ${table}`);
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: (...args: unknown[]) => limitMock(...args),
            }),
          }),
        }),
      };
    },
  }),
}));

import { leadsSignals } from '@/lib/server/signals/leads';

// The ICP band (25-149 units) describes a SINGLE self-managed association.
// A pm_inquiry's unit_count is a portfolio total across many communities, so
// it must never surface in the tray even when the number falls in-band —
// see apps/admin/src/lib/server/leads.ts's isInIcp docblock, which this
// provider now reuses instead of re-deriving the band inline.
describe('leadsSignals', () => {
  beforeEach(() => {
    limitMock.mockReset();
  });

  it('surfaces a compliance_checker lead inside the 25-149 unit ICP band', async () => {
    limitMock.mockResolvedValue({
      data: [
        {
          id: 1,
          association_name: 'Sunset Condos',
          unit_count: 80,
          created_at: '2026-09-08T10:00:00Z',
          source: 'compliance_checker',
        },
      ],
      count: 1,
      error: null,
    });

    const result = await leadsSignals.load();

    expect(result.count).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe('lead-1');
    expect(result.items[0]?.title).toBe('New lead in ICP: Sunset Condos (80 units)');
  });

  it('does NOT surface a pm_inquiry lead whose portfolio-total unit_count sits in the same band', async () => {
    limitMock.mockResolvedValue({
      data: [
        {
          id: 2,
          association_name: 'Acme Management Co',
          unit_count: 120,
          created_at: '2026-09-08T10:00:00Z',
          source: 'pm_inquiry',
        },
      ],
      count: 1,
      error: null,
    });

    const result = await leadsSignals.load();

    // Badge count (status = 'new') is unaffected — this is purely about the
    // ICP tray items, which is where the false positive would have shown up
    // as "New lead in ICP: Acme Management Co (120 units)".
    expect(result.count).toBe(1);
    expect(result.items).toEqual([]);
  });
});
