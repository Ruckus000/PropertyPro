'use client';

/**
 * AppSidebar — Wraps NavRail with app-specific navigation, routing, and brand header.
 *
 * Renders the dark collapsible sidebar matching the PropertyProRedesign.jsx mockup.
 * Navigation items are filtered by role and community features.
 * Plan-locked items are shown with a lock indicator and upgrade prompt.
 */
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building, Lock } from 'lucide-react';
import { NavRail, type NavRailItem, type NavRailSection } from '@propertypro/ui';
import { toInitials, resolvePlanId, type AnyCommunityRole, type CommunityFeatures, type CommunityType } from '@propertypro/shared';
import {
  NAV_ITEMS,
  NAV_SECTIONS,
  PM_NAV_ITEMS,
  getVisibleItemsWithPlanGate,
  getActiveItemId,
  type NavSection,
  type NavItemWithGateStatus,
} from './nav-config';
import { useSidebar } from './sidebar-context';
import { UpgradePrompt } from '../shared/upgrade-prompt';

interface AppSidebarProps {
  communityId: number | null;
  communityName: string | null;
  communityType: CommunityType | null;
  role: AnyCommunityRole | null;
  features: CommunityFeatures | null;
  userName: string | null;
  plan: string | null;
  collapsible?: boolean;
  onNavigate?: () => void;
}

/** Wraps an icon component with a small lock badge overlay for plan-locked items. */
function LockedIcon({ Icon }: { Icon: React.ComponentType<{ size?: number }> }) {
  return (
    <span className="relative opacity-50">
      <Icon size={20} />
      <Lock size={10} className="absolute -bottom-0.5 -right-0.5 text-white/70" aria-hidden="true" />
    </span>
  );
}

export function AppSidebar({
  communityId,
  communityName,
  communityType,
  role,
  features,
  userName,
  plan,
  collapsible = true,
  onNavigate,
}: AppSidebarProps) {
  const pathname = usePathname();
  const { expanded, toggleExpanded } = useSidebar();
  const [upgradePrompt, setUpgradePrompt] = useState<{ planName: string } | null>(null);
  const resolvedExpanded = collapsible ? expanded : true;

  const isPmContext = pathname.startsWith('/pm/');
  const resolvedPlanId = plan ? resolvePlanId(plan) : null;

  const allVisible: NavItemWithGateStatus[] = isPmContext
    ? PM_NAV_ITEMS.map((i) => ({ ...i, planLocked: false, upgradePlanName: null }))
    : getVisibleItemsWithPlanGate(NAV_ITEMS, role, features, communityType, resolvedPlanId);

  const visibleById = new Map(allVisible.map((item) => [item.id, item] as const));
  const baseSections: readonly NavSection[] = isPmContext
    ? [{ label: null, items: PM_NAV_ITEMS }]
    : NAV_SECTIONS;
  const childParentById = new Map<string, string>();

  for (const section of baseSections) {
    for (const item of section.items) {
      for (const childId of item.children ?? []) {
        childParentById.set(childId, item.id);
      }
    }
  }

  const toNavRailItem = (item: NavItemWithGateStatus): NavRailItem => ({
    id: item.id,
    label: item.planLocked ? `${item.label} (Upgrade)` : item.label,
    icon: item.planLocked
      ? (props: { size?: number }) => <LockedIcon Icon={item.icon} />
      : item.icon,
    href: item.planLocked ? undefined : (communityId ? item.href(communityId) : undefined),
    ariaHasPopup: item.planLocked ? 'dialog' : undefined,
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

  const activeId = getActiveItemId(allVisible, pathname) ?? '';

  // Brand header
  const header = (
    <div className="flex h-16 shrink-0 items-center gap-3 border-b border-white/10 px-3 dark:border-surface-inverse">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[var(--interactive-primary,#2563EB)]">
        <Building size={20} color="white" />
      </div>
      <div
        className={`flex flex-col overflow-hidden whitespace-nowrap transition-opacity duration-quick ${resolvedExpanded ? 'opacity-100' : 'opacity-0'}`}
      >
        <span className="text-[15px] font-semibold text-white">PropertyPro</span>
        {communityName && (
          <span className="truncate text-xs text-white/70">{communityName}</span>
        )}
      </div>
    </div>
  );

  // User profile footer
  const footer = userName ? (
    <div className="border-t border-white/10 px-3 py-3 dark:border-surface-inverse">
      <div className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-card/10 text-xs font-medium text-white">
          {toInitials(userName)}
        </div>
        <div
          className={`flex flex-col overflow-hidden whitespace-nowrap transition-opacity duration-quick ${resolvedExpanded ? 'opacity-100' : 'opacity-0'}`}
        >
          <span className="truncate text-xs font-medium text-white">{userName}</span>
          {role && (
            <span className="truncate text-xs text-white/65">
              {role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </span>
          )}
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <NavRail
        sections={navRailSections}
        activeView={activeId}
        onViewChange={(id) => {
          const clickedItem = visibleById.get(id);
          if (clickedItem?.planLocked && clickedItem.upgradePlanName) {
            setUpgradePrompt({ planName: clickedItem.upgradePlanName });
            onNavigate?.();
          }
        }}
        expanded={resolvedExpanded}
        onToggle={collapsible ? toggleExpanded : undefined}
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
            {...props}
          >
            {children}
          </Link>
        )}
      />
      {upgradePrompt && (
        <div className="fixed inset-0 z-50" onClick={() => setUpgradePrompt(null)}>
          <div
            className="absolute left-[var(--sidebar-width,64px)] top-1/3 ml-2"
            onClick={(e) => e.stopPropagation()}
          >
            <UpgradePrompt planName={upgradePrompt.planName} />
          </div>
        </div>
      )}
    </>
  );
}
