/**
 * P1-7: Client portfolio page tests.
 *
 * Verifies the data-fetching logic: non-demo communities only,
 * stale demo threshold at 10 days.
 *
 * Task 15 (spec D9) removed the Stale Demos card and its delete-confirm
 * dialog from `ClientPortfolio` — that surface moves onto the Demos page in
 * Task 18 (`components/demo/StaleDemosBanner.tsx`), which owns its own
 * tests. The `stale demo removal` describe block that used to live below
 * (a local `removeStaleDemoById` reimplementation) is removed with it;
 * `staleBadge` itself is untouched and still covered here since Task 18
 * reuses it. The quick-filter / search / type composition that replaced
 * `ClientPortfolio`'s old filter dropdowns is covered separately in
 * `client-filters.test.ts` (`applyClientFilter`, exported for testing).
 */
import { describe, it, expect } from 'vitest';
import { staleBadge } from '@/lib/utils/stale-badge';

describe('stale demo badge', () => {
  // Asserted on the SEMANTIC role, not the colour name: after the P3-6 token
  // migration the palette is an implementation detail (yellow became
  // status-warning/amber, red became status-danger), and a test that pins hues
  // breaks on every re-theme while proving nothing about the escalation.
  const days = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

  it('returns a warning badge for a 10-19 day old demo', () => {
    const badge = staleBadge(days(15));
    expect(badge.label).toBe('10+ days');
    expect(badge.className).toContain('status-warning');
  });

  it('returns the middle escalation badge for a 20-29 day old demo', () => {
    const badge = staleBadge(days(25));
    expect(badge.label).toBe('20+ days');
    // Still raw orange: the token layer has no tier BETWEEN warning and danger.
    // See the design-tokens:exempt note in stale-badge.ts.
    expect(badge.className).toContain('orange');
  });

  it('returns a danger badge for a 30+ day old demo', () => {
    const badge = staleBadge(days(35));
    expect(badge.label).toBe('30+ days');
    expect(badge.className).toContain('status-danger');
  });

  it('keeps all three escalation tiers visually distinct', () => {
    // The point of the exemption in stale-badge.ts. Collapsing the middle tier
    // onto `status-warning` would make 10+ and 20+ render identically, which no
    // per-tier assertion above would catch on its own.
    const tiers = [days(15), days(25), days(35)].map((d) => staleBadge(d).className);
    expect(new Set(tiers).size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Portfolio filtering logic (extracted for unit testing)
// ---------------------------------------------------------------------------
interface Community {
  id: number;
  name: string;
  community_type: string;
  created_at: string;
}

function filterCommunities(
  communities: Community[],
  search: string,
  typeFilter: string,
): Community[] {
  let result = communities;
  if (search.trim()) {
    const q = search.toLowerCase();
    result = result.filter((c) => c.name.toLowerCase().includes(q));
  }
  if (typeFilter !== 'all') {
    result = result.filter((c) => c.community_type === typeFilter);
  }
  return result;
}

function paginateCommunities(
  communities: Community[],
  page: number,
  pageSize: number,
): Community[] {
  const start = (page - 1) * pageSize;
  return communities.slice(start, start + pageSize);
}

describe('portfolio filtering', () => {
  const communities: Community[] = [
    { id: 1, name: 'Sunset Condos', community_type: 'condo_718', created_at: '2025-01-01T00:00:00Z' },
    { id: 2, name: 'Palm Shores HOA', community_type: 'hoa_720', created_at: '2025-02-01T00:00:00Z' },
    { id: 3, name: 'Sunset Ridge Apts', community_type: 'apartment', created_at: '2025-03-01T00:00:00Z' },
  ];

  it('returns all communities when search and filter are empty', () => {
    expect(filterCommunities(communities, '', 'all')).toHaveLength(3);
  });

  it('filters by name search (case-insensitive)', () => {
    const result = filterCommunities(communities, 'sunset', 'all');
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.id)).toEqual([1, 3]);
  });

  it('filters by community type', () => {
    const result = filterCommunities(communities, '', 'hoa_720');
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(2);
  });

  it('combines search and type filter', () => {
    const result = filterCommunities(communities, 'sunset', 'apartment');
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(3);
  });

  it('returns empty array when nothing matches', () => {
    const result = filterCommunities(communities, 'nonexistent', 'all');
    expect(result).toHaveLength(0);
  });
});

describe('portfolio pagination', () => {
  const communities: Community[] = [
    { id: 1, name: 'One', community_type: 'condo_718', created_at: '2025-01-01T00:00:00Z' },
    { id: 2, name: 'Two', community_type: 'hoa_720', created_at: '2025-02-01T00:00:00Z' },
    { id: 3, name: 'Three', community_type: 'apartment', created_at: '2025-03-01T00:00:00Z' },
    { id: 4, name: 'Four', community_type: 'condo_718', created_at: '2025-04-01T00:00:00Z' },
    { id: 5, name: 'Five', community_type: 'hoa_720', created_at: '2025-05-01T00:00:00Z' },
  ];

  it('returns first page items', () => {
    const result = paginateCommunities(communities, 1, 2);
    expect(result.map((community) => community.id)).toEqual([1, 2]);
  });

  it('returns second page items', () => {
    const result = paginateCommunities(communities, 2, 2);
    expect(result.map((community) => community.id)).toEqual([3, 4]);
  });

  it('returns remaining items on last partial page', () => {
    const result = paginateCommunities(communities, 3, 2);
    expect(result.map((community) => community.id)).toEqual([5]);
  });
});
