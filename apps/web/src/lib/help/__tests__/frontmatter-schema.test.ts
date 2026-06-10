import { describe, expect, it } from 'vitest';
import { validateFrontmatter } from '@/lib/help/frontmatter-schema';

const base = {
  title: 'T',
  description: 'D',
  category: 'compliance',
  slug: 'test-article',
  updatedAt: '2026-06-10',
};

describe('heroMedia / upNext frontmatter', () => {
  it('accepts a complete heroMedia object', () => {
    const r = validateFrontmatter({
      ...base,
      heroMedia: { src: '/help/compliance/test-article/hero.mp4', alt: 'A', width: 1440, height: 900 },
      upNext: 'fixing-compliance-gaps',
    });
    expect(r.ok).toBe(true);
  });

  it('rejects heroMedia src outside /help/', () => {
    const r = validateFrontmatter({
      ...base,
      heroMedia: { src: '/images/x.webp', alt: 'A', width: 1, height: 1 },
    });
    expect(r.ok).toBe(false);
  });

  it('rejects non-slug upNext', () => {
    const r = validateFrontmatter({ ...base, upNext: 'Not A Slug' });
    expect(r.ok).toBe(false);
  });
});
