'use client';

/**
 * Top tab bar — renders the pure `TopNavModel` (see top-nav-model.ts).
 *
 * Links, not ARIA tabs: each tab is a real navigation. A plan-locked item opens
 * `UpgradeDialog` instead of navigating, with the same props the rail passes.
 */
import { useState } from 'react';
import Link from 'next/link';
import { PlanBadge } from '@propertypro/ui';
import type { CommunityRole, CommunityType, PlanId } from '@propertypro/shared';
import { UpgradeDialog } from '../billing/upgrade-dialog';
import { cn } from '@/lib/utils';
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

const TAB_CLASS = 'inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium';

export function TopNav({ model, communityId, upgrade }: TopNavProps) {
  const [upgradeFor, setUpgradeFor] = useState<TopNavLink | null>(null);
  if (model.tabs.length === 0) return null;

  return (
    <>
      <nav aria-label="Main navigation" className="flex items-center gap-1 border-b border-edge">
        {model.tabs.map((tab) =>
          tab.planLocked ? (
            <button
              key={tab.id}
              type="button"
              aria-haspopup="dialog"
              className={cn(TAB_CLASS, 'border-transparent text-content-secondary hover:text-content')}
              onClick={() => setUpgradeFor(tab)}
            >
              {tab.label}
              <PlanBadge variant="pro" />
            </button>
          ) : (
            <Link
              key={tab.id}
              href={tab.href}
              aria-current={tab.active ? 'page' : undefined}
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
        <TopNavMoreMenu
          groups={model.moreGroups}
          hasActive={model.moreHasActive}
          hasBadge={model.moreHasBadge}
          communityId={communityId}
          onLockedSelect={setUpgradeFor}
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
      />
    </>
  );
}
