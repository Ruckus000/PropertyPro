import { describe, expect, it } from 'vitest';
import { validateFrontmatter } from '@/lib/help/frontmatter-schema';

const base = {
  title: 'T',
  description: 'D',
  category: 'compliance',
  slug: 'test-article',
  section: 'manager',
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

describe('section — one closed readership vocabulary', () => {
  it.each(['resident', 'manager'])('accepts %s', (section) => {
    expect(validateFrontmatter({ ...base, section }).ok).toBe(true);
  });

  it.each(['board', 'owner', 'board_member', 'Manager'])(
    'rejects %s — an unknown section would hide the article from everyone, silently',
    (section) => {
      expect(validateFrontmatter({ ...base, section }).ok).toBe(false);
    },
  );

  it('is required', () => {
    const { section: _omit, ...rest } = base;
    expect(validateFrontmatter(rest).ok).toBe(false);
  });
});

describe('communityTypes / boardOnly', () => {
  it('accepts known community types and defaults boardOnly to false', () => {
    const r = validateFrontmatter({ ...base, communityTypes: ['condo_718', 'hoa_720'] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.boardOnly).toBe(false);
  });

  it('rejects an unknown community type and an empty list', () => {
    expect(validateFrontmatter({ ...base, communityTypes: ['condo'] }).ok).toBe(false);
    expect(validateFrontmatter({ ...base, communityTypes: [] }).ok).toBe(false);
  });
});
