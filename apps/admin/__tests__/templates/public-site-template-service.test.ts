import { describe, it, expect } from 'vitest';
import {
  deriveTemplateLifecycleState,
  normalizeEditorInput,
  normalizeThumbnailDescriptor,
  generateTemplateSlug,
  hashTemplatePayload,
  filterPublicSiteTemplates,
  toPublicSiteTemplateListItem,
} from '../../src/lib/templates/public-site-template-service';
import type { PublicSiteTemplateRow } from '../../src/lib/templates/types';

function makeRow(overrides: Partial<PublicSiteTemplateRow> = {}): PublicSiteTemplateRow {
  return {
    id: 1,
    slug: 'test-template-abc123',
    community_type: 'condo_718',
    sort_order: 0,
    name: 'Test Template',
    summary: 'A test template',
    tags: ['test'],
    thumbnail_descriptor: { gradient: ['#1d4ed8', '#0f172a'], layout: 'hero-grid' },
    draft_jsx_source: 'function App() { return <div>Hello</div>; }',
    published_snapshot: null,
    version: 0,
    published_payload_hash: null,
    published_at: null,
    published_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    archived_at: null,
    ...overrides,
  };
}

describe('deriveTemplateLifecycleState', () => {
  it('returns draft_only when never published', () => {
    const row = makeRow({ published_at: null });
    expect(deriveTemplateLifecycleState(row)).toBe('draft_only');
  });

  it('returns published_current when hash matches', () => {
    const row = makeRow({ published_at: '2026-01-01T00:00:00Z' });
    // Compute the matching hash
    const hash = hashTemplatePayload({
      name: row.name,
      summary: row.summary,
      tags: row.tags,
      thumbnailDescriptor: row.thumbnail_descriptor,
      communityType: row.community_type,
      draftJsxSource: row.draft_jsx_source,
    });
    row.published_payload_hash = hash;
    expect(deriveTemplateLifecycleState(row)).toBe('published_current');
  });

  it('returns published_with_unpublished_changes when hash differs', () => {
    const row = makeRow({
      published_at: '2026-01-01T00:00:00Z',
      published_payload_hash: 'stale-hash-that-does-not-match',
    });
    expect(deriveTemplateLifecycleState(row)).toBe('published_with_unpublished_changes');
  });
});

describe('normalizeThumbnailDescriptor', () => {
  it('returns fallback for null input', () => {
    const result = normalizeThumbnailDescriptor(null);
    expect(result.layout).toBe('hero-grid');
    expect(result.gradient).toEqual(['#1d4ed8', '#0f172a']);
  });

  it('trims whitespace from fields', () => {
    const result = normalizeThumbnailDescriptor({
      layout: '  hero-grid  ',
      gradient: ['  #abc  ', '  #def  '],
    });
    expect(result.layout).toBe('hero-grid');
    expect(result.gradient).toEqual(['#abc', '#def']);
  });
});

describe('normalizeEditorInput', () => {
  it('trims name and summary, deduplicates tags', () => {
    const result = normalizeEditorInput({
      name: '  My Template  ',
      summary: '  Summary  ',
      tags: ['a', 'b', 'a', '  c  ', ''],
      thumbnailDescriptor: { gradient: ['#000', '#fff'], layout: 'basic' },
      communityType: 'condo_718',
      draftJsxSource: 'code',
    });
    expect(result.name).toBe('My Template');
    expect(result.summary).toBe('Summary');
    expect(result.tags).toEqual(['a', 'b', 'c']);
  });
});

describe('generateTemplateSlug', () => {
  it('produces a slug with a hex suffix', () => {
    const slug = generateTemplateSlug('My Cool Template');
    expect(slug).toMatch(/^my-cool-template-[0-9a-f]{6}$/);
  });

  it('handles special characters', () => {
    const slug = generateTemplateSlug('Hello World!!!');
    expect(slug).toMatch(/^hello-world-[0-9a-f]{6}$/);
  });

  it('truncates long names', () => {
    const slug = generateTemplateSlug('A'.repeat(100));
    // slug base is max 48 chars + dash + 6 hex = max 55
    expect(slug.length).toBeLessThanOrEqual(55);
  });

  it('falls back to "template" for empty string', () => {
    const slug = generateTemplateSlug('');
    expect(slug).toMatch(/^template-[0-9a-f]{6}$/);
  });
});

describe('filterPublicSiteTemplates', () => {
  const items = [
    toPublicSiteTemplateListItem(makeRow({ id: 1, name: 'Alpha Condo', community_type: 'condo_718' }), 0),
    toPublicSiteTemplateListItem(makeRow({ id: 2, name: 'Beta HOA', community_type: 'hoa_720' }), 5),
    toPublicSiteTemplateListItem(makeRow({
      id: 3,
      name: 'Gamma Apartment',
      community_type: 'apartment',
      published_at: '2026-01-01T00:00:00Z',
      published_payload_hash: 'stale',
    }), 2),
  ];

  it('filters by communityType', () => {
    const result = filterPublicSiteTemplates(items, { communityType: 'hoa_720' });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Beta HOA');
  });

  it('filters by search query (case-insensitive)', () => {
    const result = filterPublicSiteTemplates(items, { q: 'alpha' });
    expect(result).toHaveLength(1);
  });

  it('filters by lifecycle = live', () => {
    const result = filterPublicSiteTemplates(items, { lifecycle: 'live' });
    // None are published_current in our test data
    expect(result).toHaveLength(0);
  });

  it('filters by lifecycle = needs_publish', () => {
    const result = filterPublicSiteTemplates(items, { lifecycle: 'needs_publish' });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Gamma Apartment');
  });

  it('returns all with no filters', () => {
    const result = filterPublicSiteTemplates(items, {});
    expect(result).toHaveLength(3);
  });
});
