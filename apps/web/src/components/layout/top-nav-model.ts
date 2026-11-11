/**
 * Top-tab navigation model — a PURE projection of nav-config's visibility rules.
 *
 * The rail (`AppSidebar`) and the top tabs must never disagree about what a
 * member can reach, so this file decides nothing of its own: visibility comes
 * from `getVisibleItemsWithPlanGate`, the tab / More split from
 * `buildSlimNavSections` (the `navTier` edit that moves an item for Essentials'
 * slim rail moves it here too), and the active item from `getActiveItemId`.
 *
 * Pure: no React, no hooks, no data reads. Badge counts arrive as input.
 */
import {
  NAV_ITEMS,
  NAV_SECTIONS,
  buildSlimNavSections,
  getActiveItemId,
  getVisibleItemsWithPlanGate,
  isPmPortfolioPath,
  resolveDashboardHref,
  resolveNavItemHref,
  type NavItemConfig,
  type NavItemWithGateStatus,
} from './nav-config';
import type {
  CommunityFeatures,
  CommunityRole,
  CommunityType,
  PlanId,
} from '@propertypro/shared';

export interface TopNavLink {
  id: string;
  label: string;
  href: string;
  active: boolean;
  /** Live count, or null when there is nothing to show (a zero count is null). */
  badge: number | null;
  /**
   * The community TYPE supports this surface but the PLAN does not. The link
   * stays in the model: the renderer opens `UpgradeDialog` from the fields below
   * instead of navigating (parity with the rail).
   */
  planLocked: boolean;
  upgradePlanName: string | null;
  upgradePlanId: PlanId | null;
  upgradeFeatureKey: keyof CommunityFeatures | null;
}

export interface TopNavMoreGroup {
  label: string;
  links: TopNavLink[];
}

export interface TopNavModel {
  tabs: TopNavLink[];
  moreGroups: TopNavMoreGroup[];
  moreHasActive: boolean;
  moreHasBadge: boolean;
}

export interface TopNavInput {
  pathname: string;
  /** Query string, with or without the leading `?` (resolves finance sub-tabs). */
  search?: string | null;
  communityId: number | null;
  /** Null before a community loads; `getVisibleItemsWithPlanGate` hides role-gated items then. */
  role: CommunityRole | null;
  isUnitOwner: boolean;
  features: CommunityFeatures | null;
  communityType: CommunityType | null;
  planId: PlanId | null;
  /** Already combined with `isAdminRole` by the caller — see AppSidebar. */
  lapsedAdmin: boolean;
  badges: { pendingJoinRequests: number; missingRecords: number };
}

const EMPTY_MODEL: TopNavModel = {
  tabs: [],
  moreGroups: [],
  moreHasActive: false,
  moreHasBadge: false,
};

/** Label for a More item whose section has no label (cannot happen today). */
const FALLBACK_MORE_LABEL = 'More';

function badgeFor(
  item: Pick<NavItemConfig, 'badgeSignal'>,
  planLocked: boolean,
  badges: TopNavInput['badges'],
): number | null {
  // A locked item opens a dialog rather than navigating, so it carries no count
  // (the rail does the same).
  if (planLocked) return null;
  const count =
    item.badgeSignal === 'pendingJoinRequests'
      ? badges.pendingJoinRequests
      : item.badgeSignal === 'missingRecords'
        ? badges.missingRecords
        : 0;
  return count > 0 ? count : null;
}

export function buildTopNavModel(input: TopNavInput): TopNavModel {
  const { pathname, search, communityId, badges } = input;

  // The PM portfolio pages (Communities, Reports, Templates) have no navigation:
  // the Communities toolbar links to Reports and Templates, and a community's own
  // tabs appear once one is chosen. Checked before the community is, because a
  // community can still be in scope here (the page opened on a community's own
  // host) and its tabs must not show.
  if (isPmPortfolioPath(pathname)) return EMPTY_MODEL;

  // No community (e.g. /select-community): that page IS the picker, so no tabs.
  if (communityId === null) return EMPTY_MODEL;

  const visible = getVisibleItemsWithPlanGate(
    NAV_ITEMS,
    input.role,
    input.features,
    input.communityType,
    input.planId,
    input.isUnitOwner,
    input.lapsedAdmin,
  );
  const visibleById = new Map(visible.map((item) => [item.id, item] as const));
  const activeId = getActiveItemId(visible, pathname, search);

  const toLink = (item: NavItemWithGateStatus): TopNavLink => ({
    id: item.id,
    label: item.label,
    // One-hop dashboard destination, as the rail does (skips the
    // /dashboard -> /dashboard/apartment redirect); everything else goes
    // through resolveNavItemHref.
    href:
      item.id === 'dashboard'
        ? resolveDashboardHref(communityId, input.features)
        : resolveNavItemHref(item, communityId, false),
    active: item.id === activeId,
    badge: badgeFor(item, item.planLocked, badges),
    planLocked: item.planLocked,
    upgradePlanName: item.upgradePlanName,
    upgradePlanId: item.upgradePlanId,
    upgradeFeatureKey: item.upgradeFeatureKey,
  });

  // The tab / More split is nav-config's own. Tabs are every non-"More" section
  // flattened in SECTION order (the order the rail shows); "More" is the
  // trailing section buildSlimNavSections appends.
  const split = buildSlimNavSections(visibleById, NAV_SECTIONS);
  const seen = new Set<string>();
  const unseen = (item: NavItemConfig): NavItemWithGateStatus | null => {
    if (seen.has(item.id)) return null;
    const visibleItem = visibleById.get(item.id);
    if (!visibleItem) return null;
    seen.add(item.id);
    return visibleItem;
  };

  const tabs: TopNavLink[] = [];
  const moreIds = new Set<string>();
  for (const section of split) {
    if (section.label === 'More') {
      for (const item of section.items) moreIds.add(item.id);
      continue;
    }
    for (const item of section.items) {
      const visibleItem = unseen(item);
      if (visibleItem) tabs.push(toLink(visibleItem));
    }
  }

  // Regroup More under the NAV_SECTIONS label that contains each id, keeping
  // the NAV_SECTIONS order and dropping empty groups.
  const moreGroups: TopNavMoreGroup[] = [];
  for (const section of NAV_SECTIONS) {
    const links: TopNavLink[] = [];
    for (const item of section.items) {
      if (!moreIds.has(item.id)) continue;
      const visibleItem = unseen(item);
      if (visibleItem) links.push(toLink(visibleItem));
    }
    if (links.length > 0) {
      moreGroups.push({ label: section.label ?? FALLBACK_MORE_LABEL, links });
    }
  }

  const moreLinks = moreGroups.flatMap((group) => group.links);
  return {
    tabs,
    moreGroups,
    moreHasActive: moreLinks.some((link) => link.active),
    moreHasBadge: moreLinks.some((link) => link.badge !== null),
  };
}
