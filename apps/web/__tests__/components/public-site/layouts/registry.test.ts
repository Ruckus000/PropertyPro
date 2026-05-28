import { describe, it, expect, vi } from 'vitest';
import { LAYOUT_IDS } from '@/components/public-site/layouts/types';
import { getLayout, layoutRegistry } from '@/components/public-site/layouts/registry';

vi.mock('@/components/public-site/blocks/registry', () => ({
  blockRendererRegistry: {},
  hasRenderer: () => false,
}));

describe('layoutRegistry', () => {
  it('registers every seeded layout id', () => {
    for (const id of LAYOUT_IDS) {
      expect(getLayout(id)).toBeTypeOf('function');
    }
  });

  it('is complete for tidewater, boulevard, and sable', () => {
    expect(Object.keys(layoutRegistry).sort()).toEqual(['boulevard', 'sable', 'tidewater']);
  });
});
