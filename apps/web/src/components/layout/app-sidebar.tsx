'use client';

/**
 * AppSidebar — Wraps NavRail with app-specific navigation, routing, and brand header.
 *
 * Renders the dark collapsible sidebar matching the PropertyProRedesign.jsx mockup.
 * Navigation items are filtered by role and community features.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building } from 'lucide-react';
import { NavRail, type NavRailItem } from '@propertypro/ui';
import { toInitials, type CommunityRole, type CommunityFeatures, type CommunityType } from '@propertypro/shared';
import {
  NAV_ITEMS,
  PM_NAV_ITEMS,
  getVisibleItems,
  getActiveItemId,
  type NavItemConfig,
} from './nav-config';
import { useSidebar } from './sidebar-context';

interface AppSidebarProps {
  communityId: number | null;
  communityName: string | null;
  communityType: CommunityType | null;
  role: CommunityRole | null;
  features: CommunityFeatures | null;
  userName: string | null;
}

export function AppSidebar({
  communityId,
  communityName,
  role,
  features,
  userName,
}: AppSidebarProps) {
  const pathname = usePathname();
  const { expanded, toggleExpanded } = useSidebar();

  const isPmContext = pathname.startsWith('/pm/');
  const sourceItems: readonly NavItemConfig[] = isPmContext ? PM_NAV_ITEMS : NAV_ITEMS;
  const visibleItems = isPmContext
    ? [...PM_NAV_ITEMS]
    : getVisibleItems(sourceItems, role, features);

  // Find where main group ends and admin group starts
  const mainItems = visibleItems.filter((i) => i.group === 'main');
  const adminItems = visibleItems.filter((i) => i.group === 'admin');

  // Map to NavRailItem format with hrefs
  const allVisible = [...mainItems, ...adminItems];
  const navRailItems: NavRailItem[] = allVisible.map((item) => ({
    id: item.id,
    label: item.label,
    icon: item.icon,
    href: communityId ? item.href(communityId) : undefined,
  }));

  const activeId = getActiveItemId(allVisible, pathname) ?? '';

  // Group separator between main and admin sections
  const groupSeparatorIndex = mainItems.length;
  const showGroupSeparator = adminItems.length > 0 && mainItems.length > 0;

  const groupSeparator = showGroupSeparator ? (
    <div className="my-1 px-3">
      <div className="border-t border-white/10 dark:border-gray-800" />
      <span
        className={`mt-2 block text-[11px] font-semibold uppercase tracking-wider text-white/40 transition-opacity duration-150 dark:text-gray-500 ${expanded ? 'opacity-100' : 'opacity-0'}`}
      >
        Admin
      </span>
    </div>
  ) : undefined;

  // Brand header
  const header = (
    <div className="flex h-16 shrink-0 items-center gap-3 border-b border-white/10 px-3 dark:border-gray-800">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-[var(--interactive-primary,#2563EB)]">
        <Building size={18} color="white" />
      </div>
      <div
        className={`flex flex-col overflow-hidden whitespace-nowrap transition-opacity duration-150 ${expanded ? 'opacity-100' : 'opacity-0'}`}
      >
        <span className="text-sm font-medium text-white">PropertyPro</span>
        {communityName && (
          <span className="truncate text-[11px] text-white/50">{communityName}</span>
        )}
      </div>
    </div>
  );

  // User profile footer
  const footer = userName ? (
    <div className="border-t border-white/10 px-3 py-3 dark:border-gray-800">
      <div className="flex items-center gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-medium text-white">
          {toInitials(userName)}
        </div>
        <div
          className={`flex flex-col overflow-hidden whitespace-nowrap transition-opacity duration-150 ${expanded ? 'opacity-100' : 'opacity-0'}`}
        >
          <span className="truncate text-[11px] font-medium text-white">{userName}</span>
          {role && (
            <span className="truncate text-[11px] text-white/50">
              {role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </span>
          )}
        </div>
      </div>
    </div>
  ) : null;

  return (
    <NavRail
      items={navRailItems}
      activeView={activeId}
      onViewChange={() => {
        /* navigation handled by Link hrefs */
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
  );
}
