'use client';

/**
 * Top tab bar — renders the pure `TopNavModel` (see top-nav-model.ts).
 *
 * Links, not ARIA tabs: each tab is a real navigation. A plan-locked item opens
 * `UpgradeDialog` instead of navigating, with the same props the rail passes.
 */
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { PlanBadge } from '@propertypro/ui';
import type { CommunityRole, CommunityType, PlanId } from '@propertypro/shared';
import { UpgradeDialog } from '../billing/upgrade-dialog';
import { cn } from '@/lib/utils';
import { prefetchNavData } from './nav-prefetch';
import { TopNavMoreMenu } from './top-nav-more-menu';
import { NavCount } from './top-nav-parts';
import type { TopNavLink, TopNavModel } from './top-nav-model';

export interface TopNavProps {
  model: TopNavModel;
  communityId: number | null;
  /** What `AppSidebar` hands `UpgradeDialog`. */
  upgrade: {
    currentPlanId: PlanId | null;
    currentPlanRaw: string | null;
    role: CommunityRole | null;
    communityType: CommunityType | null;
    isUnitOwner?: boolean;
  };
}

// Narrower padding below xl, so a manager's seven tabs, their count badges and
// More fit at lg's 1024px; the inset ring is not clipped by the tab scroller.
const TAB_CLASS =
  'inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus xl:px-3';

export function TopNav({ model, communityId, upgrade }: TopNavProps) {
  const [upgradeFor, setUpgradeFor] = useState<TopNavLink | null>(null);
  const moreTriggerRef = useRef<HTMLButtonElement>(null);
  // The control to refocus when the dialog closes. A ref, not state: closing
  // clears `upgradeFor` before Radix calls onCloseAutoFocus.
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const openUpgrade = (link: TopNavLink, returnFocusTo: HTMLElement | null) => {
    returnFocusRef.current = returnFocusTo;
    setUpgradeFor(link);
  };
  const queryClient = useQueryClient();
  if (model.tabs.length === 0) return null;

  // Same hover/focus data warm-up the rail's links do.
  const prefetch = (href: string) => prefetchNavData(queryClient, href, communityId);

  return (
    <>
      <nav aria-label="Main navigation" className="flex items-center border-b border-edge">
        {/* The tabs scroll sideways if they ever outgrow the row (a long label,
            large text); More sits outside the scroller so it is never cut off.
            `relative` makes the scroller the containing block of each count's
            `sr-only` sentence (position: absolute). Without it the nearest
            positioned ancestor is the root, so `overflow-x-auto` does not clip
            a sentence whose tab is scrolled off to the right, and it widens the
            whole page: 447px of scroll width at 375px on a manager's dashboard. */}
        <div className="relative flex min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] xl:gap-1 [&::-webkit-scrollbar]:hidden">
          {model.tabs.map((tab) =>
            tab.planLocked ? (
              <button
                key={tab.id}
                type="button"
                aria-haspopup="dialog"
                className={cn(TAB_CLASS, 'border-transparent text-content-secondary hover:text-content')}
                onClick={(event) => openUpgrade(tab, event.currentTarget)}
              >
                {tab.label}
                <PlanBadge variant="pro" />
              </button>
            ) : (
              <Link
                key={tab.id}
                href={tab.href}
                aria-current={tab.active ? 'page' : undefined}
                onPointerEnter={() => prefetch(tab.href)}
                onFocus={() => prefetch(tab.href)}
                className={cn(
                  TAB_CLASS,
                  tab.active
                    ? 'border-interactive text-content'
                    : 'border-transparent text-content-secondary hover:text-content',
                )}
              >
                {tab.label}
                <NavCount link={tab} />
              </Link>
            ),
          )}
        </div>
        <TopNavMoreMenu
          groups={model.moreGroups}
          hasActive={model.moreHasActive}
          hasBadge={model.moreHasBadge}
          triggerRef={moreTriggerRef}
          onPrefetch={prefetch}
          // The More item unmounts with its panel, so refocus the More button.
          onLockedSelect={(link) => openUpgrade(link, moreTriggerRef.current)}
        />
      </nav>
      <UpgradeDialog
        open={upgradeFor !== null}
        onOpenChange={(open) => {
          if (!open) setUpgradeFor(null);
        }}
        featureKey={upgradeFor?.upgradeFeatureKey ?? null}
        upgradePlanId={upgradeFor?.upgradePlanId ?? null}
        currentPlanId={upgrade.currentPlanId}
        currentPlanRaw={upgrade.currentPlanRaw}
        role={upgrade.role}
        communityType={upgrade.communityType}
        isUnitOwner={upgrade.isUnitOwner}
        communityId={communityId}
        onCloseAutoFocus={(event) => {
          // Radix refocuses a registered DialogTrigger, and this dialog has none,
          // so left alone focus falls to <body>. Put it back where it came from.
          const target = returnFocusRef.current;
          if (!target?.isConnected) return;
          event.preventDefault();
          target.focus();
        }}
      />
    </>
  );
}
