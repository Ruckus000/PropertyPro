import { describe, it, expect, vi } from 'vitest';
import { LAYOUT_IDS } from '@/components/public-site/layouts/types';
import { getLayout, layoutRegistry } from '@/components/public-site/layouts/registry';
import { LOOK_STYLES } from '@/components/public-site/layouts/look-styles';
import { Bayfront } from '@/components/public-site/layouts/Bayfront';
import { Heritage } from '@/components/public-site/layouts/Heritage';
import { PalmGrove } from '@/components/public-site/layouts/PalmGrove';
import { PlainSimple } from '@/components/public-site/layouts/PlainSimple';

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

  it('is complete for the three legacy layouts and the four looks', () => {
    expect(Object.keys(layoutRegistry).sort()).toEqual([
      'bayfront',
      'boulevard',
      'heritage',
      'palm-grove',
      'plain-simple',
      'sable',
      'tidewater',
    ]);
  });

  it("renders each look with its own layout, under the look's id (D2)", () => {
    expect(getLayout('bayfront')).toBe(Bayfront);
    expect(getLayout('heritage')).toBe(Heritage);
    expect(getLayout('palm-grove')).toBe(PalmGrove);
    expect(getLayout('plain-simple')).toBe(PlainSimple);
  });

  it('gives every look a layout id, and every look a LOOK_STYLES entry', () => {
    const lookIds = Object.keys(LOOK_STYLES).sort();
    expect(lookIds).toEqual(['bayfront', 'heritage', 'palm-grove', 'plain-simple']);
    for (const id of lookIds) {
      expect(LAYOUT_IDS as readonly string[]).toContain(id);
    }
  });
});
