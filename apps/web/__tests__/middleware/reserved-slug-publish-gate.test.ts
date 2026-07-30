/**
 * D24 — the one new risk 11b-2 introduces.
 *
 * The pages API has no feature flag, so a PM with an HTTP client has been able
 * to create and publish pages since 11b-1. S1 WIDENS the reserved set
 * (`/welcome` was protected but not reserved), which means a slug that was
 * legal when the page was created can become reserved afterwards.
 *
 * The guarantee this file pins: such a page is **publish-BLOCKED**, not
 * silently hijacked by the app route. `pageIssues` re-checks reserved status on
 * every publish (11b-1) using the SAME injected predicate the routing layer
 * uses — `isReservedPublicSlug` from `public-host-routes.ts`, which is exactly
 * how `site-blocks-service.ts` calls it (`isReserved: isReservedPublicSlug`).
 *
 * If this ever goes red because the issue is only a warning, the failure mode
 * is a resident typing `/welcome` on their community's subdomain and getting a
 * marketing page instead of the app.
 */
import { describe, it, expect } from 'vitest';
import { pageIssues } from '@propertypro/shared';
import {
  isReservedPublicSlug,
  PROTECTED_PATH_PREFIXES,
} from '@/lib/middleware/public-host-routes';

const HOME = {
  pageId: '1',
  name: 'Home',
  slug: '',
  isHome: true,
};

function issuesFor(slug: string) {
  return pageIssues({
    pages: [HOME, { pageId: '2', name: 'Welcome', slug, isHome: false }],
    isReserved: isReservedPublicSlug,
  });
}

describe('reserved slugs are a publish gate, not a routing accident', () => {
  it('blocks publishing a page slugged "welcome" (the newly-widened entry)', () => {
    const issues = issuesFor('welcome');
    const slugIssue = issues.find((i) => i.field === 'page:2.slug');
    expect(slugIssue, 'a page at /welcome must be flagged').toBeDefined();
    // Errors block a publish; a warning would not.
    expect(slugIssue?.severity).toBe('error');
    expect(slugIssue?.message).toContain('resident portal');
  });

  it('blocks a page for EVERY protected first segment, not just welcome', () => {
    for (const prefix of PROTECTED_PATH_PREFIXES) {
      const slug = prefix.split('/')[1] as string;
      const slugIssue = issuesFor(slug).find((i) => i.field === 'page:2.slug');
      expect(slugIssue?.severity, `/${slug} must block a publish`).toBe('error');
    }
  });

  it('still lets an ordinary slug publish', () => {
    expect(issuesFor('about').filter((i) => i.severity === 'error')).toEqual([]);
  });
});
