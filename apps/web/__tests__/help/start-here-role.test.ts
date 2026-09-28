import { describe, expect, it } from 'vitest';
import {
  getStartHereContentForRole,
  resolveStartHereArticles,
} from '@/lib/help/start-here';
import { getAllArticles } from '@/lib/services/help-article-service';

// Keyed by base audience; a board designation does not change the hero.
const VIEWERS_TO_VERIFY: ReadonlyArray<{ viewer: readonly string[] }> = [
  { viewer: ['owner'] },
  { viewer: ['tenant'] },
  { viewer: ['manager'] },
  { viewer: ['owner', 'board_member'] },
];

describe('Start Here hero — role coverage', () => {
  const allArticles = getAllArticles();

  it.each(VIEWERS_TO_VERIFY)(
    '$viewer gets at least 3 resolvable articles plus a CTA',
    ({ viewer }) => {
      const content = getStartHereContentForRole(viewer);
      const resolved = resolveStartHereArticles(content, allArticles);
      expect(
        resolved.length,
        `viewer ${viewer.join('+')}: only resolved ${resolved.length} of ${content.slugs.length} slug(s) — verify the slug list against the live corpus`,
      ).toBeGreaterThanOrEqual(3);
      expect(content.cta).toBeTruthy();
      expect(content.headline.length).toBeGreaterThan(0);
    },
  );

  it('falls back to a generic set for unknown roles', () => {
    const content = getStartHereContentForRole([]);
    const resolved = resolveStartHereArticles(content, allArticles);
    expect(resolved.length).toBeGreaterThanOrEqual(2);
    expect(content.headline).toBe('Start here');
  });

  it('preserves the configured order in the resolved articles', () => {
    const content = getStartHereContentForRole(['manager']);
    const resolved = resolveStartHereArticles(content, allArticles);
    const resolvedSlugs = resolved.map((a) => a.slug);
    const configured = content.slugs.filter((slug) =>
      resolvedSlugs.includes(slug),
    );
    expect(resolvedSlugs).toEqual(configured);
  });
});
