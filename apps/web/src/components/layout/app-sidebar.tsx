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
import { NavRail, type NavRailItem } from '@propertypro/ui';
import { toInitials, resolvePlanId, type AnyCommunityRole, type CommunityFeatures, type CommunityType } from '@propertypro/shared';
import {
  NAV_ITEMS,
  PM_NAV_ITEMS,
  getVisibleItemsWithPlanGate,
  getActiveItemId,
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
}: AppSidebarProps) {
  const pathname = usePathname();
  const { expanded, toggleExpanded } = useSidebar();
  const [upgradePrompt, setUpgradePrompt] = useState<{ planName: string } | null>(null);

  const isPmContext = pathname.startsWith('/pm/');
  const resolvedPlanId = plan ? resolvePlanId(plan) : null;

  const allVisible: NavItemWithGateStatus[] = isPmContext
    ? PM_NAV_ITEMS.map((i) => ({ ...i, planLocked: false, upgradePlanName: null }))
    : getVisibleItemsWithPlanGate(NAV_ITEMS, role, features, communityType, resolvedPlanId);

  // Find where main group ends and admin group starts
  const mainItems = allVisible.filter((i) => i.group === 'main');
  const adminItems = allVisible.filter((i) => i.group === 'admin');

  // Map to NavRailItem format with hrefs
  const orderedItems = [...mainItems, ...adminItems];
  const navRailItems: NavRailItem[] = orderedItems.map((item) => ({
    id: item.id,
    label: item.planLocked ? `${item.label} (Upgrade)` : item.label,
    icon: item.planLocked
      ? (props: { size?: number }) => <LockedIcon Icon={item.icon} />
      : item.icon,
    href: item.planLocked ? undefined : (communityId ? item.href(communityId) : undefined),
  }));

  const activeId = getActiveItemId(orderedItems, pathname) ?? '';

  // Group separator between main and admin sections
  const groupSeparatorIndex = mainItems.length;
  const showGroupSeparator = adminItems.length > 0 && mainItems.length > 0;

  const groupSeparator = showGroupSeparator ? (
    <div className="my-1 px-3">
      <div className="border-t border-white/10 dark:border-surface-inverse" />
      <span
        className={`mt-2 block text-xs font-semibold uppercase tracking-wider text-white/60 transition-opacity duration-quick dark:text-content-tertiary ${expanded ? 'opacity-100' : 'opacity-0'}`}
      >
        Admin
      </span>
    </div>
  ) : undefined;

  // Brand header
  const header = (
    <div className="flex h-16 shrink-0 items-center gap-3 border-b border-white/10 px-3 dark:border-surface-inverse">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[var(--interactive-primary,#2563EB)]">
        <Building size={20} color="white" />
      </div>
      <div
        className={`flex flex-col overflow-hidden whitespace-nowrap transition-opacity duration-quick ${expanded ? 'opacity-100' : 'opacity-0'}`}
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
          className={`flex flex-col overflow-hidden whitespace-nowrap transition-opacity duration-quick ${expanded ? 'opacity-100' : 'opacity-0'}`}
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
        items={navRailItems}
        activeView={activeId}
        onViewChange={(id) => {
          const clickedItem = orderedItems.find((i) => i.id === id);
          if (clickedItem?.planLocked && clickedItem.upgradePlanName) {
            setUpgradePrompt({ planName: clickedItem.upgradePlanName });
          }
        }}
        expanded={expanded}
        onToggle={toggleExpanded}
        header={header}
        footer={footer}
        groupSeparator={groupSeparator}
        groupSeparatorAfterIndex={groupSeparatorIndex}
        renderLink={({ href, className, children, ...props }) => (
          <Link key={href} href={href} className={className} {...props}>
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
