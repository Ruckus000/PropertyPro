'use client';

/**
 * The shell's two other top-nav slots: the top-bar brand (a phone's only
 * identification of the community; the rail's header does it at `lg`) and, with
 * the top-nav flag on, the desktop rail's place. Both read the pathname, which is
 * why they live here and not in the shell.
 */
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { PlanBadge } from '@propertypro/ui';
import { PLAN_FEATURES, resolvePlanId } from '@propertypro/shared';
import { PropertyProTile } from '@/components/brand/property-pro-mark';
import { tabsInScope } from './nav-config';

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
 * the plan. Not a switcher — switching stays in ProfileMenu's "Switch Community".
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
