'use client';

/**
 * ShellTopNav — the top tab row as the app shell mounts it: how a phone navigates
 * (below `lg`), and at `lg` and up too when the top-nav flag replaces the rail
 * (`atDesktop`).
 *
 * Feeds `buildTopNavModel` the same inputs `AppSidebar` derives for the rail:
 * pathname + search, `lapsedAdmin`, the plan, and the shared nav badges. Loaded
 * with `next/dynamic` by the shell.
 */
import { usePathname, useSearchParams } from 'next/navigation';
import {
  resolvePlanId,
  type CommunityFeatures,
  type CommunityRole,
  type CommunityType,
} from '@propertypro/shared';
import { isPmPortfolioPath, resolveLapsedAdmin } from './nav-config';
import { buildTopNavModel } from './top-nav-model';
import { TopNav } from './top-nav';
import { useNavBadges } from './use-nav-badges';

export interface ShellTopNavProps {
  /** The top-nav flag is on: show the row at `lg` and up as well (the rail is not rendered). */
  atDesktop?: boolean;
  communityId: number | null;
  communityType: CommunityType | null;
  role: CommunityRole | null;
  isUnitOwner: boolean;
  features: CommunityFeatures | null;
  isLapsed: boolean;
  plan: string | null;
}

export function ShellTopNav({
  atDesktop = false,
  communityId,
  communityType,
  role,
  isUnitOwner,
  features,
  isLapsed,
  plan,
}: ShellTopNavProps) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const isPmContext = isPmPortfolioPath(pathname);
  const lapsedAdmin = resolveLapsedAdmin(isLapsed, role);
  const planId = plan ? resolvePlanId(plan) : null;

  const badges = useNavBadges({ communityId, role, communityType, features, isPmContext, lapsedAdmin });
  const model = buildTopNavModel({
    pathname,
    search,
    communityId,
    role,
    isUnitOwner,
    features,
    communityType,
    planId,
    lapsedAdmin,
    badges,
  });

  // No tabs (no community in scope): draw no empty bordered band.
  if (model.tabs.length === 0) return null;

  return (
    <div className={atDesktop ? 'bg-surface-card px-2 lg:px-3' : 'bg-surface-card px-2 lg:hidden'}>
      <TopNav
        model={model}
        communityId={communityId}
        upgrade={{ currentPlanId: planId, currentPlanRaw: plan, role, communityType, isUnitOwner }}
      />
    </div>
  );
}
