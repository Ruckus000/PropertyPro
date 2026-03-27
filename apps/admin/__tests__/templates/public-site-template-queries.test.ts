import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Supabase admin client before importing the module
const mockFrom = vi.fn();

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: () => ({
    from: mockFrom,
  }),
}));

import { getPublicSiteTemplateUsageCount } from '../../src/lib/db/public-site-template-queries';

describe('getPublicSiteTemplateUsageCount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries demo_instances filtered by the specific template id', async () => {
    // Set up a chain where calling .eq('public_template_id', 42) resolves with count
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.is = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockImplementation((col: string, val: unknown) => {
      if (col === 'public_template_id') {
        return Promise.resolve({ count: 3, error: null });
      }
      return chain;
    });
    mockFrom.mockReturnValue(chain);

    const result = await getPublicSiteTemplateUsageCount(42);

    // Verify it queries demo_instances (not fetching all)
    expect(mockFrom).toHaveBeenCalledWith('demo_instances');
    expect(result.count).toBe(3);
    expect(result.error).toBeNull();
  });

  it('returns count 0 on null count result', async () => {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.is = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockImplementation((col: string) => {
      if (col === 'public_template_id') {
        return Promise.resolve({ count: null, error: null });
      }
      return chain;
    });
    mockFrom.mockReturnValue(chain);

    const result = await getPublicSiteTemplateUsageCount(99);
    expect(result.count).toBe(0);
  });
});
