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
import type { AnyCommunityRole, CommunityFeatures } from '@propertypro/shared';
import { PM_SCOPE_DB_ROLES } from '@propertypro/shared';
import type { BreadcrumbLink } from '@/components/shared/breadcrumbs';
import { resolveDashboardHref } from './nav-config';
import { resolveHomeDestination } from '@/lib/utils/home-destination';
import { buildAutoTrail } from '@/lib/breadcrumbs/build-auto-trail';

interface ShellBreadcrumbsCommunity {
  id: number;
  name: string;
}

interface ShellBreadcrumbsProps {
  role: AnyCommunityRole | null;
  community: ShellBreadcrumbsCommunity | null;
  features: CommunityFeatures | null;
}

/** Orientation/picker pages with no ancestor — never show a trail. */
const HIDE_PATHS = new Set(['/select-community', '/welcome']);

export function ShellBreadcrumbs({ role, community, features }: ShellBreadcrumbsProps) {
  const pathname = usePathname();

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
  // matches the server and there is no hydration mismatch. The authenticated
  // shell renders no <h1> of its own, so the page's title is the only <h1>.
  // A MutationObserver catches h1s that stream in late (Suspense boundaries).
  const [h1, setH1] = useState<{ path: string; label: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const read = () => {
      if (cancelled) return;
      const label = document.querySelector('h1')?.textContent?.trim();
      if (label) setH1({ path: pathname, label });
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

  const homeItems = buildHomeCrumbs({ pathname, role, community, features, homeFallbackHref });
  const trail = buildAutoTrail(pathname);
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
  role,
  community,
  features,
  homeFallbackHref,
}: {
  pathname: string;
  role: AnyCommunityRole | null;
  community: ShellBreadcrumbsCommunity | null;
  features: CommunityFeatures | null;
  homeFallbackHref: string;
}): BreadcrumbLink[] {
  const isPm = role != null && (PM_SCOPE_DB_ROLES as readonly string[]).includes(role);

  // On the PM portal itself, the root is always the portfolio.
  if (pathname.startsWith('/pm')) {
    return [{ label: 'Portfolio', href: '/pm/dashboard/communities' }];
  }

  // PM viewing a specific community: portfolio → community dashboard.
  if (isPm && community) {
    return [
      { label: 'Portfolio', href: '/pm/dashboard/communities' },
      { label: community.name, href: resolveDashboardHref(community.id, features) },
    ];
  }

  // Resident / board / owner within a community.
  if (community) {
    return [{ label: 'Home', href: resolveDashboardHref(community.id, features) }];
  }

  // Tenant-less shell (rare).
  return [{ label: 'Home', href: homeFallbackHref }];
}
