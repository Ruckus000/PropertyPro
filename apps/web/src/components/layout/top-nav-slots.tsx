'use client';

/**
 * The shell's two other top-nav-flag slots (flag on, `lg` and up): the top-bar
 * brand and the desktop rail's place. Both read the pathname, which is why they
 * live here and not in the shell: the shell loads this module with `next/dynamic`
 * behind an inline flag check, so a flag-off shell neither ships them nor calls a
 * navigation hook it did not call before the flag existed.
 */
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { PlanBadge } from '@propertypro/ui';
import { PLAN_FEATURES, resolvePlanId } from '@propertypro/shared';
import { PropertyProTile } from '@/components/brand/property-pro-mark';
import { isPmPortfolioPath } from './nav-config';

/**
 * Whether the tabs have anything to list: a community, or the cross-community PM
 * portfolio routes. With neither (e.g. /select-community) the tab model is empty
 * and the hamburger is lg:hidden, which would leave no navigation at lg+; the
 * rail handles that state on purpose (its community picker), so it stays (R24).
 */
function tabsInScope(hasCommunity: boolean, pathname: string | null): boolean {
  return hasCommunity || isPmPortfolioPath(pathname ?? '');
}

/**
 * The desktop rail's place in the shell with the flag on: empty while the tab
 * row is in scope, the rail (`children`) when it is not (R24).
 */
export function DesktopNavSlot({ hasCommunity, children }: { hasCommunity: boolean; children: ReactNode }) {
  const pathname = usePathname();
  return tabsInScope(hasCommunity, pathname) ? null : <>{children}</>;
}

/**
 * Top-bar brand (D29): the rail header's tile, the community name and the plan.
 * Not a switcher — switching stays in ProfileMenu's "Switch Community". Absent
 * whenever the rail stands in for the tabs (R24), since the rail has its own.
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
  const planId = plan ? resolvePlanId(plan) : null;
  return (
    <div className="flex min-w-0 items-center gap-3">
      <PropertyProTile />
      <span className="max-w-[16rem] truncate text-sm font-semibold text-content">
        {communityName ?? 'PropertyPro'}
      </span>
      {planId ? <PlanBadge label={PLAN_FEATURES[planId].displayName} /> : null}
    </div>
  );
}
