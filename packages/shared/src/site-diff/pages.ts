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
  /**
   * Whether a page STAGED for removal still holds its web address.
   *
   * There are two different questions here, and the answer differs:
   *
   *  - **"Is the set of pages about to go live valid?"** — the publish gate.
   *    A staged page is leaving, so it neither needs validating nor holds
   *    anything. **`false`** (the default), which is what makes a page with a
   *    broken address still deletable.
   *
   *  - **"Can this page take this address right now?"** — an editor form.
   *    A staged page is still a live row until the publish lands, and
   *    `site_pages_community_slug_partial` is unique on
   *    `(community_id, slug) WHERE deleted_at IS NULL`, so it still owns its
   *    address. **`true`**, or the form tells the PM an address is free that
   *    the server will refuse — with a raw unique-violation rather than a
   *    clean error, if the service-layer check were ever relaxed to match.
   *
   * NAMES are unaffected either way: they are nav labels with no unique index,
   * so a staged page's name is genuinely free (see `assertNameAvailable`).
   * That asymmetry is deliberate, not an oversight.
   */
  reserveStagedSlugs?: boolean;
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
 * A page staged for removal is never VALIDATED: it is about to stop existing,
 * so holding the publish on its name or address would make a broken page
 * impossible to delete.
 *
 * Whether it still OCCUPIES its address is a separate question with a separate
 * answer, and the caller has to say which one it is asking — see
 * `reserveStagedSlugs`. The publish gate says no (the page is leaving); an
 * editor form says yes (the row is still live in the unique slug index, so the
 * server will refuse the address). Its NAME is free either way.
 */
export function pageIssues({
  pages,
  retiredSlugs = [],
  isReserved,
  reserveStagedSlugs = false,
}: PageIssuesInput): Issue[] {
  const issues: Issue[] = [];
  const live = pages.filter((page) => !page.deleteStaged);

  // A staged page is never VALIDATED — it is about to stop existing, and
  // holding the publish on its name or address would make a broken page
  // impossible to delete. But it may still OCCUPY its address, because until
  // the publish lands its row is still live in the unique slug index. The two
  // are separate concerns and only the second is optional; see
  // `reserveStagedSlugs`.
  const stagedSlugOwners = new Map<string, string>();
  if (reserveStagedSlugs) {
    for (const page of pages) {
      if (page.deleteStaged === true && page.slug.length > 0) {
        stagedSlugOwners.set(page.slug, page.pageId);
      }
    }
  }

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
    // Named as the staged page rather than reported as a generic clash: the
    // colliding row is invisible in the list's normal reading (it is marked for
    // removal, so a PM reads it as already gone), and the two ways out —
    // publish the removal, or "Cancel removal" — are not guessable from
    // "another page already uses this".
    // No `&& stagedOwner !== page.pageId` here, unlike the two clashes below.
    // It cannot fire: `stagedSlugOwners` is built ONLY from pages with
    // `deleteStaged === true`, and this loop iterates `live`, which is the
    // complement of that set — so the owner is never this page. It was
    // unreachable-true, which made `pages.test.ts`'s "does not accuse the
    // staged page of clashing with itself" pass for a reason unrelated to what
    // it claimed (the staged page is filtered out of `live` and is never a loop
    // SUBJECT at all). Deleting the conjunct is behaviour-preserving; keeping
    // it invited exactly that misreading.
    const stagedOwner = stagedSlugOwners.get(page.slug);
    if (stagedOwner !== undefined) {
      issues.push(
        issue(
          page.pageId,
          'slug',
          `A page you have staged for removal still uses "/${page.slug}" until you publish. Publish the removal first, or cancel it and pick another address.`,
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
