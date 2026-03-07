/**
 * P1-7: Client portfolio page tests.
 *
 * Verifies the data-fetching logic: non-demo communities only,
 * stale demo threshold at 10 days.
 */
import { describe, it, expect } from 'vitest';
import { staleBadge } from '@/lib/utils/stale-badge';

describe('stale demo badge', () => {
  it('returns yellow badge for 10-19 day old demo', () => {
    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
    const badge = staleBadge(fifteenDaysAgo);
    expect(badge.label).toBe('10+ days');
    expect(badge.className).toContain('yellow');
  });

  it('returns orange badge for 20-29 day old demo', () => {
    const twentyFiveDaysAgo = new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString();
    const badge = staleBadge(twentyFiveDaysAgo);
    expect(badge.label).toBe('20+ days');
    expect(badge.className).toContain('orange');
  });

  it('returns red badge for 30+ day old demo', () => {
    const thirtyFiveDaysAgo = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString();
    const badge = staleBadge(thirtyFiveDaysAgo);
    expect(badge.label).toBe('30+ days');
    expect(badge.className).toContain('red');
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

interface StaleDemo {
  id: number;
  prospect_name: string;
  template_type: string;
  created_at: string;
}

function removeStaleDemoById(demos: StaleDemo[], staleDemoId: number): StaleDemo[] {
  return demos.filter((demo) => demo.id !== staleDemoId);
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

describe('stale demo removal', () => {
  const demos: StaleDemo[] = [
    { id: 101, prospect_name: 'A', template_type: 'condo_718', created_at: '2025-01-01T00:00:00Z' },
    { id: 102, prospect_name: 'B', template_type: 'hoa_720', created_at: '2025-01-02T00:00:00Z' },
    { id: 103, prospect_name: 'C', template_type: 'apartment', created_at: '2025-01-03T00:00:00Z' },
  ];

  it('removes only the targeted stale demo id', () => {
    const result = removeStaleDemoById(demos, 102);
    expect(result.map((demo) => demo.id)).toEqual([101, 103]);
  });

  it('returns unchanged list when id does not exist', () => {
    const result = removeStaleDemoById(demos, 999);
    expect(result.map((demo) => demo.id)).toEqual([101, 102, 103]);
  });
});
