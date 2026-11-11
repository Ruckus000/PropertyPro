'use client';

/**
 * The shell's two other top-nav slots: the top-bar brand (a phone's only
 * identification of the community; the rail's header does it at `lg`) and, with
 * the top-nav flag on, the desktop rail's place. Both read the pathname, which is
 * why they live here and not in the shell.
 */
import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PlanBadge } from '@propertypro/ui';
import { PLAN_FEATURES, resolvePlanId } from '@propertypro/shared';
import { PropertyProTile } from '@/components/brand/property-pro-mark';
import { isPmPortfolioPath, tabsInScope } from './nav-config';

/**
 * The desktop rail's place in the shell with the flag on: empty while the tab
 * row is in scope, the rail (`children`) when it is not (R24).
 */
export function DesktopNavSlot({ hasCommunity, children }: { hasCommunity: boolean; children: ReactNode }) {
  const pathname = usePathname();
  return tabsInScope(hasCommunity, pathname) ? null : <>{children}</>;
}

/**
 * Top-bar brand (D29): the rail header's tile, the community name and, from `lg`,
 * the plan. On the PM portfolio pages, which have no rail, it is the PropertyPro
 * mark linking home to Communities, at every width. Not a switcher — switching stays in ProfileMenu's "Switch Community".
 * Absent whenever the drawer or rail stands in for the tabs (R24), since it has its
 * own. AppTopBar decides at which widths this is shown.
 */
export function ShellBrandSlot({
  hasCommunity,
  communityName,
  plan,
}: {
  hasCommunity: boolean;
  communityName: string | null;
  plan: string | null;
}) {
  const pathname = usePathname();
  if (!tabsInScope(hasCommunity, pathname)) return null;
  // The portfolio pages have no rail header, so the brand is the way home.
  if (isPmPortfolioPath(pathname ?? '')) {
    return (
      <Link
        href="/pm/dashboard/communities"
        aria-label="PropertyPro, all communities"
        className="flex min-h-11 min-w-0 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus md:min-h-0 md:gap-3"
      >
        <PropertyProTile />
        {/* Smaller on a phone: beside search, help, alerts and the avatar there
            is ~139px at 375px wide; the wordmark at text-base needs 152. */}
        <span className="min-w-0 truncate text-sm font-semibold text-content md:text-base">PropertyPro</span>
      </Link>
    );
  }
  const planId = plan ? resolvePlanId(plan) : null;
  return (
    <div className="flex min-w-0 items-center gap-3">
      <PropertyProTile />
      <span
        className="min-w-0 max-w-[16rem] line-clamp-2 break-words text-sm font-semibold leading-tight text-content lg:line-clamp-1"
        title={communityName ?? undefined}
      >
        {communityName ?? 'PropertyPro'}
      </span>
      {planId ? (
        <span className="hidden lg:inline-flex">
          <PlanBadge label={PLAN_FEATURES[planId].displayName} />
        </span>
      ) : null}
    </div>
  );
}
