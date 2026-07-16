'use client';

/**
 * AppSidebar — Wraps NavRail with app-specific navigation, routing, and brand header.
 *
 * Renders the dark collapsible sidebar matching the PropertyProRedesign.jsx mockup.
 * Navigation items are filtered by role and community features.
 * Plan-locked items are shown with a "Pro" pill (via NavRail.trailingBadge) and
 * open an UpgradeDialog when clicked.
 */
import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { prefetchNavData } from './nav-prefetch';
import { NavRail, PlanBadge, type NavRailItem, type NavRailSection } from '@propertypro/ui';
import {
  inferCanonicalRoleFromMembership,
  toInitials,
  resolvePlanId,
  PLAN_FEATURES,
  type AnyCommunityRole,
  type CommunityFeatures,
  type CommunityType,
  type PlanId,
} from '@propertypro/shared';
import {
  NAV_ITEMS,
  NAV_SECTIONS,
  PM_NAV_ITEMS,
  getVisibleItemsWithPlanGate,
  getActiveItemId,
  shouldUseSlimNav,
  buildSlimNavSections,
  type NavSection,
  type NavItemWithGateStatus,
} from './nav-config';
import { useSidebar } from './sidebar-context';
import { SidebarTenantSwitcher } from './sidebar-tenant-switcher';
import { UpgradeDialog } from '../billing/upgrade-dialog';

interface AppSidebarProps {
  communityId: number | null;
  communityName: string | null;
  communityType: CommunityType | null;
  role: AnyCommunityRole | null;
  /** True when the current user is a unit owner — used to distinguish owner vs tenant within `resident`. */
  isUnitOwner?: boolean;
  /** Board designation (BoardDesignation value); null when not on the board. */
  designation?: string | null;
  features: CommunityFeatures | null;
  userName: string | null;
  plan: string | null;
  collapsible?: boolean;
  /** When provided, forces expanded state regardless of sidebar context. */
  expandedOverride?: boolean;
  /** When false, hides the collapse toggle button independently of collapsible. */
  showCollapseToggle?: boolean;
  onNavigate?: () => void;
}

export function AppSidebar({
  communityId,
  communityName,
  communityType,
  role,
  isUnitOwner = false,
  designation = null,
  features,
  userName,
  plan,
  collapsible = true,
  expandedOverride,
  showCollapseToggle,
  onNavigate,
}: AppSidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { expanded, toggleExpanded, sectionOpen, toggleSection } = useSidebar();
  const [upgradeFor, setUpgradeFor] = useState<{
    featureKey: keyof CommunityFeatures | null;
    upgradePlanId: PlanId | null;
  } | null>(null);
  const resolvedExpanded = expandedOverride !== undefined ? expandedOverride : (collapsible ? expanded : true);
  const resolvedShowToggle = showCollapseToggle !== undefined ? showCollapseToggle : collapsible;

  const isPmContext = pathname.startsWith('/pm/');
  const resolvedPlanId = plan ? resolvePlanId(plan) : null;
  // The runtime role is on the v3 model (resident | property_manager | root_manager).
  // Plan-gate logic operates on the canonical role (owner, tenant, board_president, ...)
  // so we resolve once here using isUnitOwner + designation.
  const canonicalRole: AnyCommunityRole | null = role
    ? inferCanonicalRoleFromMembership({ role, isUnitOwner, designation: designation ?? null })
    : null;

  const allVisible: NavItemWithGateStatus[] = isPmContext
    ? PM_NAV_ITEMS.map((i) => ({
        ...i,
        planLocked: false,
        upgradePlanName: null,
        upgradePlanId: null,
        upgradeFeatureKey: null,
      }))
    : getVisibleItemsWithPlanGate(NAV_ITEMS, canonicalRole, features, communityType, resolvedPlanId);

  const visibleById = new Map(allVisible.map((item) => [item.id, item] as const));
  const useSlimNav = !isPmContext && shouldUseSlimNav(role, resolvedPlanId);
  const baseSections: readonly NavSection[] = isPmContext
    ? [{ label: null, items: PM_NAV_ITEMS }]
    : useSlimNav
      ? buildSlimNavSections(visibleById, NAV_SECTIONS)
      : NAV_SECTIONS;
  const childParentById = new Map<string, string>();

  for (const section of baseSections) {
    for (const item of section.items) {
      for (const childId of item.children ?? []) {
        childParentById.set(childId, item.id);
      }
    }
  }

  // Fall back to /select-community when communityId is null. Without this,
  // every nav item would render with href={undefined} and silently fail to
  // navigate, which masked the www-subdomain bug for some time. The middleware
  // now redirects authenticated users without tenant context, so this branch
  // should rarely be reached — but if it is, send the user somewhere useful
  // instead of producing a dead nav.
  const toNavRailItem = (item: NavItemWithGateStatus): NavRailItem => ({
    id: item.id,
    label: item.label,
    icon: item.icon,
    href: item.planLocked
      ? undefined
      : communityId
        ? item.href(communityId)
        : '/select-community',
    ariaHasPopup: item.planLocked ? 'dialog' : undefined,
    trailingBadge: item.planLocked ? <PlanBadge variant="pro" /> : undefined,
  });

  const navRailSections: NavRailSection[] = baseSections
    .map((section) => ({
      label: section.label,
      items: section.items.flatMap((item) => {
        const parentId = childParentById.get(item.id);
        if (parentId && visibleById.has(parentId)) {
          return [];
        }

        const visibleItem = visibleById.get(item.id);
        if (!visibleItem) {
          return [];
        }

        const childItems = (item.children ?? []).flatMap((childId) => {
          const childItem = visibleById.get(childId);
          if (!childItem || childItem.planLocked || !communityId) {
            return [];
          }

          return [
            {
              id: childItem.id,
              label: childItem.label,
              href: childItem.href(communityId),
            },
          ];
        });

        return [
          {
            ...toNavRailItem(visibleItem),
            ...(childItems.length > 0 ? { children: childItems } : {}),
          },
        ];
      }),
    }))
    .filter((section) => section.items.length > 0);

  const activeId = getActiveItemId(allVisible, pathname, searchParams.toString()) ?? '';

  // Brand header / community switcher. The switcher renders a flat searchable
  // community list for multi-community users; single-community users and the PM
  // portal (isPmContext) fall back to a static brand header inside the component.
  const header = (
    <SidebarTenantSwitcher
      communityId={communityId}
      communityName={communityName}
      expanded={resolvedExpanded}
      staticOnly={isPmContext}
    />
  );

  // User profile footer
  const footer = userName ? (
    <div className="border-t border-[var(--border-default)] px-3 py-3">
      <div className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-muted)] text-xs font-medium text-[var(--text-secondary)]">
          {toInitials(userName)}
        </div>
        <div
          className={`flex flex-col overflow-hidden whitespace-nowrap transition-opacity duration-quick ${resolvedExpanded ? 'opacity-100' : 'opacity-0'}`}
        >
          <span className="truncate text-sm font-medium text-[var(--text-primary)]">{userName}</span>
          {role && (
            <div className="flex items-center gap-1.5">
              <span className="truncate text-xs text-[var(--text-tertiary)]">
                {role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              </span>
              {resolvedPlanId ? (
                <PlanBadge label={PLAN_FEATURES[resolvedPlanId].displayName} />
              ) : (
                <span
                  className="inline-flex h-5 shrink-0 items-center rounded-full bg-[var(--surface-muted)] px-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)] ring-1 ring-inset ring-[var(--border-default)]"
                  aria-label="No plan"
                >
                  No plan
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <NavRail
        sections={navRailSections}
        collapsibleSections
        sectionOpen={sectionOpen}
        onSectionToggle={toggleSection}
        activeView={activeId}
        onViewChange={(id) => {
          const clickedItem = visibleById.get(id);
          if (clickedItem?.planLocked) {
            setUpgradeFor({
              featureKey: clickedItem.upgradeFeatureKey,
              upgradePlanId: clickedItem.upgradePlanId,
            });
            onNavigate?.();
          }
        }}
        expanded={resolvedExpanded}
        onToggle={resolvedShowToggle ? toggleExpanded : undefined}
        header={header}
        footer={footer}
        renderLink={({ href, className, children, onClick, ...props }) => (
          <Link
            key={href}
            href={href}
            className={className}
            onClick={() => {
              onClick?.();
              onNavigate?.();
            }}
            onPointerEnter={() => prefetchNavData(queryClient, href, communityId)}
            onFocus={() => prefetchNavData(queryClient, href, communityId)}
            {...props}
          >
            {children}
          </Link>
        )}
      />
      <UpgradeDialog
        open={upgradeFor !== null}
        onOpenChange={(open) => {
          if (!open) setUpgradeFor(null);
        }}
        featureKey={upgradeFor?.featureKey ?? null}
        upgradePlanId={upgradeFor?.upgradePlanId ?? null}
        currentPlanId={resolvedPlanId}
        currentPlanRaw={plan}
        role={canonicalRole}
        communityId={communityId}
      />
    </>
  );
}
