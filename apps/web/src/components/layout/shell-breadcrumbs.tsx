'use client';

/**
 * ShellBreadcrumbs — the app's single, global breadcrumb trail.
 *
 * Rendered once at the top of the authenticated shell (below AppTopBar) for
 * every user. Replaces the old PM-only "‹ Portfolio / <community>" strip.
 *
 * The trail is built entirely client-side, with no per-page wiring:
 *   • Parent crumbs come from the URL (build-auto-trail.ts) — this is what
 *     tracks "how deep you are" and lets you click back to any ancestor.
 *   • A role-aware Home crumb is prepended so users can jump to their real
 *     home (resident → dashboard, PM → portfolio).
 *   • The current (leaf) label prefers the page's <h1> — the design system
 *     already requires the h1 to name the page, so this yields real entity
 *     names ("Q3 Board Minutes") instead of raw ids, with the URL-derived
 *     label as a server-render-safe fallback.
 *
 * Reading the <h1> happens after mount (never during render) so server and
 * client initial output match — no hydration mismatch. It then updates on
 * every navigation.
 */

import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import type { CommunityRole, CommunityFeatures } from '@propertypro/shared';
import { PM_SCOPE_DB_ROLES } from '@propertypro/shared';
import type { BreadcrumbLink } from '@/lib/breadcrumbs/types';
import { isPmPortfolioPath, resolveDashboardHref } from './nav-config';
import { resolveHomeDestination } from '@/lib/utils/home-destination';
import { buildAutoTrail } from '@/lib/breadcrumbs/build-auto-trail';
import { useUserCommunities } from '@/hooks/use-user-communities';

interface ShellBreadcrumbsCommunity {
  id: number;
  name: string;
}

interface ShellBreadcrumbsProps {
  role: CommunityRole | null;
  community: ShellBreadcrumbsCommunity | null;
  features: CommunityFeatures | null;
}

/** Orientation/picker pages with no ancestor — never show a trail. */
const HIDE_PATHS = new Set(['/select-community', '/welcome']);

/**
 * Resolve the page-title text to use as the leaf label. Prefer the canonical
 * PageHeader title (`[data-page-header] h1`) — that is unambiguously the page
 * name and never an overlay or MDX content heading. Fall back to the first
 * <h1> that isn't inside a portaled overlay (dialog / aria-hidden), for pages
 * that render a custom header without PageHeader (e.g. help articles).
 */
function readPageTitle(): string | undefined {
  const pageHeaderTitle = document.querySelector('[data-page-header] h1')?.textContent?.trim();
  if (pageHeaderTitle) return pageHeaderTitle;

  for (const h of Array.from(document.querySelectorAll('h1'))) {
    if (!h.closest('[role="dialog"], [aria-hidden="true"]')) {
      const text = h.textContent?.trim();
      if (text) return text;
    }
  }
  return undefined;
}

export function ShellBreadcrumbs({ role, community, features }: ShellBreadcrumbsProps) {
  const pathname = usePathname();
  const isPm = role != null && (PM_SCOPE_DB_ROLES as readonly string[]).includes(role);

  // Communities sends someone who manages one community straight back to it,
  // so for them a "Communities" crumb is a link that goes nowhere. Shown only
  // once the list confirms more than one; the switcher already loads it.
  const { data: userCommunities } = useUserCommunities({ enabled: isPm && community != null });
  const managedCount = userCommunities
    ? new Set(
        userCommunities
          .filter((c) => (PM_SCOPE_DB_ROLES as readonly string[]).includes(c.role))
          .map((c) => c.id),
      ).size
    : undefined;
  const showPortfolioCrumb = managedCount !== undefined && managedCount > 1;

  // Hostname is only needed for the rare tenant-less Home fallback. Default to
  // '/dashboard' on first render (server + hydration) to avoid a mismatch,
  // then refine after mount.
  const [homeFallbackHref, setHomeFallbackHref] = useState('/dashboard');
  useEffect(() => {
    setHomeFallbackHref(
      resolveHomeDestination({ isLoggedIn: true, hostname: window.location.hostname }),
    );
  }, []);

  // The page's <h1> gives the real leaf label (entity name). Read it after
  // mount / on navigation — never during render — so the initial client render
  // matches the server and there is no hydration mismatch. A MutationObserver
  // catches h1s that stream in late (Suspense boundaries).
  const [h1, setH1] = useState<{ path: string; label: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const read = () => {
      if (cancelled) return;
      const label = readPageTitle();
      if (!label) return;
      // Only update when the resolved title actually changes — the observer
      // fires on every DOM mutation, so a new object each time would re-render
      // the trail on unrelated changes.
      setH1((prev) =>
        prev && prev.path === pathname && prev.label === label ? prev : { path: pathname, label },
      );
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.body, { childList: true, subtree: true });
    // Content has settled well before this; stop observing to avoid overhead.
    const stop = window.setTimeout(() => observer.disconnect(), 3000);
    return () => {
      cancelled = true;
      observer.disconnect();
      window.clearTimeout(stop);
    };
  }, [pathname]);

  if (HIDE_PATHS.has(pathname)) return null;

  const homeItems = buildHomeCrumbs({ pathname, isPm, community, features, homeFallbackHref, showPortfolioCrumb });
  const trail = buildAutoTrail(pathname, community?.id ?? null);
  const h1Label = h1 && h1.path === pathname ? h1.label : null;

  let items: BreadcrumbLink[];
  let currentLabel: string;

  if (trail) {
    items = [...homeItems, ...trail.items];
    // Prefer the page's <h1> only for dynamic/entity leaves (ids, article
    // slugs). Static section pages keep their clean URL-derived label.
    currentLabel = trail.leafIsDynamic && h1Label ? h1Label : trail.currentLabel;
  } else {
    // No URL trail: the deepest Home crumb becomes the current leaf.
    const leaf = homeItems[homeItems.length - 1];
    if (!leaf) return null;
    items = homeItems.slice(0, -1);
    currentLabel = leaf.label;
  }

  // A crumb that links to this very page repeats the leaf: on Communities the
  // home crumb is "Communities" and so is the page, which read as
  // "Communities › Communities". Drop it.
  const last = items[items.length - 1];
  if (last && last.href.split('?')[0] === pathname && last.label === currentLabel) {
    items = items.slice(0, -1);
  }

  // A lone crumb has nothing to navigate to (e.g. resident sitting on their
  // own dashboard) — hide the strip entirely.
  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className="border-b border-edge bg-surface-page px-6 py-2 lg:px-8"
    >
      <ol className="flex flex-wrap items-center gap-1.5 text-sm">
        {items.map((item) => (
          <Fragment key={item.href}>
            <li>
              <Link
                href={item.href}
                className="text-content-secondary hover:text-content transition-colors duration-quick focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus rounded-sm"
              >
                {item.label}
              </Link>
            </li>
            <li aria-hidden="true" className="text-content-tertiary">
              <ChevronRight size={14} />
            </li>
          </Fragment>
        ))}
        <li className="min-w-0">
          <span
            aria-current="page"
            className="font-medium text-content-secondary truncate block max-w-full sm:max-w-[40ch]"
          >
            {currentLabel}
          </span>
        </li>
      </ol>
    </nav>
  );
}

function buildHomeCrumbs({
  pathname,
  isPm,
  community,
  features,
  homeFallbackHref,
  showPortfolioCrumb,
}: {
  pathname: string;
  isPm: boolean;
  community: ShellBreadcrumbsCommunity | null;
  features: CommunityFeatures | null;
  homeFallbackHref: string;
  showPortfolioCrumb: boolean;
}): BreadcrumbLink[] {

  // On the PM portfolio itself, the root is always the communities list. Label
  // matches the PM sidebar entry for /pm/dashboard/communities ('Communities',
  // not 'Portfolio') per .claude/rules/design.md canonical mappings.
  // Community-scoped /pm pages (e.g. /pm/settings/website?communityId=…) are
  // deliberately excluded — they fall through to the normal community trail.
  if (isPmPortfolioPath(pathname)) {
    return [{ label: 'Communities', href: '/pm/dashboard/communities' }];
  }

  // PM viewing a specific community: communities list → community dashboard,
  // or just the dashboard for someone who manages only this one.
  if (isPm && community) {
    const dashboard = { label: community.name, href: resolveDashboardHref(community.id, features) };
    return showPortfolioCrumb
      ? [{ label: 'Communities', href: '/pm/dashboard/communities' }, dashboard]
      : [dashboard];
  }

  // Resident / board / owner within a community.
  if (community) {
    return [{ label: 'Home', href: resolveDashboardHref(community.id, features) }];
  }

  // Tenant-less shell (rare).
  return [{ label: 'Home', href: homeFallbackHref }];
}
