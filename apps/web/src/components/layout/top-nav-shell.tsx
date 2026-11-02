'use client';

/**
 * ShellTopNav — the top tab row as the app shell mounts it (flag on, `lg` and up).
 *
 * Feeds `buildTopNavModel` the same inputs `AppSidebar` derives for the rail:
 * pathname + search, `lapsedAdmin`, the plan, and the shared nav badges. Loaded
 * with `next/dynamic` by the shell behind an inline flag check, so a build with
 * the flag off never emits it.
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
  communityId: number | null;
  communityType: CommunityType | null;
  role: CommunityRole | null;
  isUnitOwner: boolean;
  features: CommunityFeatures | null;
  isLapsed: boolean;
  plan: string | null;
}

export function ShellTopNav({
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
    <div className="hidden bg-surface-card px-3 lg:block">
      <TopNav
        model={model}
        communityId={communityId}
        upgrade={{ currentPlanId: planId, currentPlanRaw: plan, role, communityType, isUnitOwner }}
      />
    </div>
  );
}
