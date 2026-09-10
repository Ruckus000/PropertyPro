import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DemoListClient } from '@/components/demo/DemoListClient';

const DEMO: Parameters<typeof DemoListClient>[0]['initialDemos'][number] = {
  id: 7,
  template_type: 'hoa_720',
  prospect_name: 'Harbor Point HOA',
  slug: 'demo-harbor-point',
  theme: {},
  seeded_community_id: 11,
  demo_resident_user_id: 'resident-1',
  demo_board_user_id: 'board-1',
  demo_resident_email: 'resident@example.com',
  demo_board_email: 'board@example.com',
  auth_token_secret: 'secret',
  external_crm_url: 'https://example.com/crm',
  prospect_notes: 'Interested in onboarding next quarter',
  created_at: '2026-03-20T00:00:00.000Z',
  customized_at: null,
  is_converted: false,
};

describe('demo list client', () => {
  // "stale" is derived from the current date, so pin the clock — 5 days
  // after DEMO's created_at, below the 10-day stale threshold.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-25T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders initial demos without waiting for a mount-time fetch', () => {
    const html = renderToStaticMarkup(
      createElement(DemoListClient, { initialDemos: [DEMO] }),
    );

    expect(html).toContain('Harbor Point HOA');
    expect(html).toContain('1 demo instances · 0 stale');
    expect(html).toContain('href="/demo/7/preview"');
    expect(html).not.toContain('animate-spin');
  });

  it('shows the true below-threshold age on the row, matching the "0 stale" header — not "10+ days"', () => {
    // DEMO is 5 days old under the pinned clock. `staleBadge()` used to have
    // no branch below the 10-day threshold and fell through to the 10+
    // badge unconditionally, so every row said "10+ days" beside a header
    // that correctly said "0 stale".
    const html = renderToStaticMarkup(
      createElement(DemoListClient, { initialDemos: [DEMO] }),
    );

    expect(html).toContain('5d');
    expect(html).not.toContain('10+ days');
  });

  it('counts a not-yet-converted demo past the 10-day threshold as stale', () => {
    const staleDemo = { ...DEMO, created_at: '2026-01-01T00:00:00.000Z' };
    const html = renderToStaticMarkup(
      createElement(DemoListClient, { initialDemos: [staleDemo] }),
    );

    expect(html).toContain('1 demo instances · 1 stale');
  });

  it('never counts a converted demo as stale, no matter how old', () => {
    const convertedDemo = { ...DEMO, created_at: '2020-01-01T00:00:00.000Z', is_converted: true };
    const html = renderToStaticMarkup(
      createElement(DemoListClient, { initialDemos: [convertedDemo] }),
    );

    expect(html).toContain('1 demo instances · 0 stale');
  });
});
