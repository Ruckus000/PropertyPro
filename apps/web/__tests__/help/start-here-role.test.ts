import { describe, expect, it } from 'vitest';
import {
  getStartHereContentForRole,
  resolveStartHereArticles,
} from '@/lib/help/start-here';
import { getAllArticles } from '@/lib/services/help-article-service';

const ROLES_TO_VERIFY = [
  'owner',
  'tenant',
  'board_member',
  'board_president',
  'cam',
  'site_manager',
  'property_manager_admin',
  'pm_admin',
] as const;

describe('Start Here hero — role coverage', () => {
  const allArticles = getAllArticles();

  it.each(ROLES_TO_VERIFY)(
    '%s gets at least 3 resolvable articles plus a CTA',
    (role) => {
      const content = getStartHereContentForRole(role);
      const resolved = resolveStartHereArticles(content, allArticles);
      expect(
        resolved.length,
        `role ${role}: only resolved ${resolved.length} of ${content.slugs.length} slug(s) — verify the slug list against the live corpus`,
      ).toBeGreaterThanOrEqual(3);
      expect(content.cta).toBeTruthy();
      expect(content.headline.length).toBeGreaterThan(0);
    },
  );

  it('falls back to a generic set for unknown roles', () => {
    const content = getStartHereContentForRole('not-a-real-role');
    const resolved = resolveStartHereArticles(content, allArticles);
    expect(resolved.length).toBeGreaterThanOrEqual(2);
    expect(content.headline).toBe('Start here');
  });

  it('preserves the configured order in the resolved articles', () => {
    const content = getStartHereContentForRole('cam');
    const resolved = resolveStartHereArticles(content, allArticles);
    const resolvedSlugs = resolved.map((a) => a.slug);
    const configured = content.slugs.filter((slug) =>
      resolvedSlugs.includes(slug),
    );
    expect(resolvedSlugs).toEqual(configured);
  });
});
