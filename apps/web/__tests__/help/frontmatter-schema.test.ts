import { describe, expect, it } from 'vitest';
import {
  COMMUNITY_FEATURE_KEYS,
  helpFrontmatterSchema,
  validateFrontmatter,
} from '@/lib/help/frontmatter-schema';

const validFixture = {
  title: 'Example',
  description: 'desc',
  category: 'compliance',
  slug: 'example-slug',
  roles: ['owner'],
  keywords: ['foo'],
  tags: ['florida'],
  relatedArticles: [],
  featured: false,
  updatedAt: '2026-04-19',
};

describe('helpFrontmatterSchema', () => {
  it('accepts a minimal valid record', () => {
    const result = validateFrontmatter(validFixture);
    expect(result.ok).toBe(true);
  });

  it('rejects a missing title', () => {
    const result = validateFrontmatter({ ...validFixture, title: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.path).toBe('title');
    }
  });

  it('rejects an upper-case slug', () => {
    const result = validateFrontmatter({ ...validFixture, slug: 'BadSlug' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.path).toBe('slug');
    }
  });

  it('rejects updatedAt that is not ISO date', () => {
    const result = validateFrontmatter({ ...validFixture, updatedAt: 'last week' });
    expect(result.ok).toBe(false);
  });

  it('accepts a §-prefixed statute reference', () => {
    const result = validateFrontmatter({
      ...validFixture,
      statutes: ['§718.111(12)(g)'],
    });
    expect(result.ok).toBe(true);
  });

  it('accepts an HB Florida bill reference', () => {
    const result = validateFrontmatter({ ...validFixture, statutes: ['HB 1203'] });
    expect(result.ok).toBe(true);
  });

  it('rejects a malformed statute string', () => {
    const result = validateFrontmatter({
      ...validFixture,
      statutes: ['Section 718, paragraph 12'],
    });
    expect(result.ok).toBe(false);
  });

  it('rejects featureGates entries not in CommunityFeatures', () => {
    const result = validateFrontmatter({
      ...validFixture,
      featureGates: ['hasCompliance', 'hasNotAFlag'],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((err) => err.path.startsWith('featureGates')),
      ).toBe(true);
    }
  });

  it('accepts every key in COMMUNITY_FEATURE_KEYS', () => {
    for (const key of COMMUNITY_FEATURE_KEYS) {
      const result = validateFrontmatter({
        ...validFixture,
        featureGates: [key],
      });
      expect(result.ok, `key ${key} should validate`).toBe(true);
    }
  });

  it('passes through unknown frontmatter fields without error', () => {
    const result = helpFrontmatterSchema.safeParse({
      ...validFixture,
      experimentalField: 'someday',
    });
    expect(result.success).toBe(true);
  });
});
