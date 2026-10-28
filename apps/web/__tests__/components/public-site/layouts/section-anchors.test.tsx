/**
 * The public page renderer hands each section what Quick links needs.
 *
 * Every layout gives each section the page's sections in visitor order
 * (`pageSections`), and the first section of each data type its anchor id
 * (`anchorId`). The three layouts share no dispatch code, so each is checked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import type { BlockRendererProps } from '@/components/public-site/blocks/types';

const received = vi.hoisted(() => ({ props: [] as unknown[] }));

vi.mock('@/components/public-site/blocks/registry', () => {
  const Capture = (props: unknown) => {
    received.props.push(props);
    return null;
  };
  const types = ['hero', 'text', 'meetings', 'contact', 'quicklinks'];
  return {
    blockRendererRegistry: Object.fromEntries(types.map((type) => [type, Capture])),
    hasRenderer: (type: string) => types.includes(type),
  };
});

import { Tidewater } from '@/components/public-site/layouts/Tidewater';
import { Boulevard } from '@/components/public-site/layouts/Boulevard';
import { Sable } from '@/components/public-site/layouts/Sable';

const community = {
  id: 1,
  slug: 'sunset-condos',
  name: 'Sunset Condos',
  shortName: null,
  logoUrl: null,
  communityType: 'condo_718' as const,
  city: 'Miami',
  state: 'FL',
  unitCount: null,
  timezone: 'America/New_York',
};
const theme = {
  primaryColor: '#0e3338',
  secondaryColor: '#f6f1e6',
  accentColor: '#c66f49',
  headingFont: 'Fraunces',
  bodyFont: 'Manrope',
};

/** Deliberately out of order: the layouts sort by blockOrder. */
const BLOCKS = [
  { id: 15, blockType: 'meetings', blockOrder: 5, content: { timeWindowDays: 90 } },
  { id: 11, blockType: 'hero', blockOrder: 1, content: { headline: 'Welcome' } },
  { id: 16, blockType: 'contact', blockOrder: 6, content: {} },
  { id: 12, blockType: 'quicklinks', blockOrder: 2, content: {} },
  { id: 14, blockType: 'text', blockOrder: 4, content: { body: 'About us.' } },
  { id: 13, blockType: 'meetings', blockOrder: 3, content: { timeWindowDays: 7 } },
  { id: 17, blockType: 'unicorn', blockOrder: 7, content: {} },
];

const LAYOUTS = [
  ['Tidewater', Tidewater],
  ['Boulevard', Boulevard],
  ['Sable', Sable],
] as const;

beforeEach(() => {
  received.props = [];
});

describe.each(LAYOUTS)('%s', (_name, Layout) => {
  function renderedProps(): BlockRendererProps[] {
    render(<Layout community={community} theme={theme} blocks={BLOCKS} />);
    return received.props as BlockRendererProps[];
  }

  it('anchors the first section of each data type only', () => {
    const anchorById = Object.fromEntries(
      renderedProps().map((props) => [props.block.id, props.anchorId]),
    );
    expect(anchorById).toEqual({
      11: undefined,
      12: 'quicklinks',
      13: 'meetings',
      14: undefined,
      15: undefined,
      16: 'contact',
    });
  });

  it("hands every section the page's sections, in visitor order", () => {
    const props = renderedProps();
    expect(props).toHaveLength(6);
    for (const section of props) {
      expect(section.pageSections?.map((s) => s.id)).toEqual([11, 12, 13, 14, 15, 16, 17]);
    }
    // The content travels with it: Quick links reads the Meetings section's settings.
    const meetings = props[0]!.pageSections!.find((s) => s.id === 13);
    expect(meetings?.content).toEqual({ timeWindowDays: 7 });
  });
});
