import { describe, expect, it, vi } from 'vitest';

const mockDb = vi.hoisted(() => ({ select: vi.fn() }));

vi.mock('../src/drizzle', () => ({
  db: mockDb,
}));

const rootExports = await import('../src/index');
const unsafeExports = await import('../src/unsafe');
const filtersExports = await import('../src/filters');

describe('db export boundaries', () => {
  it('keeps unscoped helpers out of root exports', () => {
    expect(rootExports).not.toHaveProperty('findCommunityBySlugUnscoped');
    expect(rootExports).not.toHaveProperty('findCandidateDigestCommunityIds');
    expect(rootExports).not.toHaveProperty('claimDigestQueueRows');
    expect(rootExports).not.toHaveProperty('hasMoreDigestRows');
  });

  it('keeps document access helpers on root exports', () => {
    expect(rootExports).toHaveProperty('buildDocumentAccessFilter');
    expect(rootExports).toHaveProperty('getAccessibleDocuments');
    expect(rootExports).toHaveProperty('isDocumentAccessible');
    expect(rootExports).toHaveProperty('getDocumentWithAccessCheck');
  });

  it('exposes expected unsafe escape-hatch exports', () => {
    expect(unsafeExports).toHaveProperty('createUnscopedClient');
    expect(unsafeExports).toHaveProperty('findCommunityBySlugUnscoped');
    expect(unsafeExports).toHaveProperty('findCandidateDigestCommunityIds');
    expect(unsafeExports).toHaveProperty('claimDigestQueueRows');
    expect(unsafeExports).toHaveProperty('hasMoreDigestRows');
  });

  it('exposes only approved runtime filter helpers', () => {
    const exportedNames = Object.keys(filtersExports).sort();
    expect(exportedNames).toEqual(['and', 'asc', 'desc', 'eq', 'gt', 'gte', 'inArray', 'isNull', 'lte', 'notInArray', 'or', 'sql']);
  });
});
