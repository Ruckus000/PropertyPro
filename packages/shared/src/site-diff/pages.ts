/**
 * Page-level validation for the multi-page public site (Phase 11b).
 *
 * The block-level counterpart lives in `validate.ts`; this file answers the
 * questions that only make sense across a SET of pages — two pages claiming one
 * address, a page claiming an address a redirect still owns, a site with no home.
 *
 * Same posture as `siteIssues`: the editor runs this to render the review sheet,
 * and the server runs the same function so the check is a gate rather than a
 * suggestion. Nothing here reads the database — callers pass the rows in.
 */
import type { Issue } from './types';

/** Shape a non-home page slug must match. Mirrors the DB CHECK on `site_pages`. */
export const SITE_PAGE_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/** The home page's slug: it is pinned at the site root. */
export const HOME_PAGE_SLUG = '';

export interface PageForValidation {
  /** `site_pages.id`, stringified by the caller so ids stay opaque here. */
  pageId: string;
  name: string;
  slug: string;
  isHome: boolean;
  /** True while the page has never been published. */
  isDraft?: boolean;
  /** True when a publish will remove this page. */
  deleteStaged?: boolean;
}

export interface PageIssuesInput {
  pages: readonly PageForValidation[];
  /**
   * Addresses held by `site_page_redirects` — retired slugs that still forward
   * visitors. A page may not claim one that belongs to a DIFFERENT page.
   *
   * The owning page id is part of the entry because a page renaming BACK to its
   * own former address is legitimate (and the service deletes the redirect when it
   * does). Comparing slugs alone would make that undo permanently invalid, and
   * would then block every publish for a community already in that state.
   */
  retiredSlugs?: readonly { slug: string; pageId: string }[];
  /**
   * Whether a slug is reserved by an application route.
   *
   * INJECTED, not imported. The authoritative list is
   * `PROTECTED_FIRST_SEGMENTS` in
   * `apps/web/src/lib/middleware/public-host-routes.ts`, and it has to stay
   * there: it is derived from the app's own routing table, and a copy in this
   * package would be a second list that drifts the first time a protected route
   * is added. Callers pass `isReservedPublicSlug`. Omitted (the editor before it
   * has the list, say) the check is skipped — the server-side gate still runs it,
   * which is the one that matters.
   */
  isReserved?: (slug: string) => boolean;
}

function issue(
  pageId: string,
  field: string,
  message: string,
  severity: Issue['severity'] = 'error',
): Issue {
  return { field: `page:${pageId}.${field}`, message, severity, pageId };
}

/**
 * Cross-page issues. Errors block a publish; warnings are surfaced only.
 *
 * A page staged for removal is skipped: it is about to stop existing, so holding
 * the publish on its name or address would make a broken page impossible to
 * delete.
 */
export function pageIssues({
  pages,
  retiredSlugs = [],
  isReserved,
}: PageIssuesInput): Issue[] {
  const issues: Issue[] = [];
  const live = pages.filter((page) => !page.deleteStaged);

  const homes = live.filter((page) => page.isHome);
  if (homes.length === 0) {
    issues.push({
      field: 'pages.home',
      message: 'This site has no home page, so visitors landing on the root have nothing to see.',
      severity: 'error',
    });
  } else if (homes.length > 1) {
    issues.push({
      field: 'pages.home',
      message: 'This site has more than one home page. Only one page can live at the root.',
      severity: 'error',
    });
  }

  const retiredOwners = new Map(retiredSlugs.map((entry) => [entry.slug, entry.pageId]));
  const seenSlugs = new Map<string, string>();
  const seenNames = new Map<string, string>();

  for (const page of live) {
    const trimmedName = page.name.trim();
    if (trimmedName.length === 0) {
      issues.push(issue(page.pageId, 'name', 'Give this page a name.'));
    }

    // Names are the nav labels, so two identical ones are indistinguishable to a
    // visitor even though the addresses differ. Compared case-insensitively for
    // the same reason.
    const nameKey = trimmedName.toLowerCase();
    if (nameKey.length > 0) {
      const clash = seenNames.get(nameKey);
      if (clash !== undefined && clash !== page.pageId) {
        issues.push(
          issue(page.pageId, 'name', `Another page is also called "${trimmedName}".`),
        );
      } else {
        seenNames.set(nameKey, page.pageId);
      }
    }

    if (page.isHome) {
      if (page.slug !== HOME_PAGE_SLUG) {
        issues.push(
          issue(page.pageId, 'slug', 'The home page must live at the site root.'),
        );
      }
      // The root address cannot clash, be reserved, or be retired — skip the
      // rest of the slug rules for it rather than reporting nonsense.
      continue;
    }

    if (page.slug.length === 0) {
      issues.push(issue(page.pageId, 'slug', 'Give this page a web address.'));
      continue;
    }
    if (!SITE_PAGE_SLUG_PATTERN.test(page.slug)) {
      issues.push(
        issue(
          page.pageId,
          'slug',
          'Web addresses use lowercase letters, numbers and hyphens only, starting with a letter or number.',
        ),
      );
      continue;
    }
    if (isReserved?.(page.slug)) {
      issues.push(
        issue(
          page.pageId,
          'slug',
          `"/${page.slug}" is used by the resident portal, so a public page cannot live there.`,
        ),
      );
    }
    const retiredOwner = retiredOwners.get(page.slug);
    if (retiredOwner !== undefined && retiredOwner !== page.pageId) {
      issues.push(
        issue(
          page.pageId,
          'slug',
          `Another page used to live at "/${page.slug}", and it still forwards visitors to its replacement.`,
        ),
      );
    }
    const slugClash = seenSlugs.get(page.slug);
    if (slugClash !== undefined && slugClash !== page.pageId) {
      issues.push(
        issue(page.pageId, 'slug', `Another page already uses "/${page.slug}".`),
      );
    } else {
      seenSlugs.set(page.slug, page.pageId);
    }
  }

  return issues;
}
