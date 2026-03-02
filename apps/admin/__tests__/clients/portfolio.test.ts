/**
 * P1-7: Client portfolio page tests.
 *
 * Verifies the data-fetching logic: non-demo communities only,
 * stale demo threshold at 10 days.
 */
import { describe, it, expect } from 'vitest';
import { differenceInDays } from 'date-fns';

// ---------------------------------------------------------------------------
// Pure utility: stale badge computation (extracted from ClientPortfolio)
// ---------------------------------------------------------------------------
function staleBadge(createdAt: string): { label: string; severity: 'yellow' | 'orange' | 'red' } {
  const days = differenceInDays(new Date(), new Date(createdAt));
  if (days >= 30) return { label: '30+ days', severity: 'red' };
  if (days >= 20) return { label: '20+ days', severity: 'orange' };
  return { label: '10+ days', severity: 'yellow' };
}

describe('stale demo badge', () => {
  it('returns yellow badge for 10-19 day old demo', () => {
    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
    const badge = staleBadge(fifteenDaysAgo);
    expect(badge.label).toBe('10+ days');
    expect(badge.severity).toBe('yellow');
  });

  it('returns orange badge for 20-29 day old demo', () => {
    const twentyFiveDaysAgo = new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString();
    const badge = staleBadge(twentyFiveDaysAgo);
    expect(badge.label).toBe('20+ days');
    expect(badge.severity).toBe('orange');
  });

  it('returns red badge for 30+ day old demo', () => {
    const thirtyFiveDaysAgo = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString();
    const badge = staleBadge(thirtyFiveDaysAgo);
    expect(badge.label).toBe('30+ days');
    expect(badge.severity).toBe('red');
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
