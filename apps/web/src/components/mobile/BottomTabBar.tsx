'use client';

/**
 * P3-49: Fixed bottom tab bar for /mobile/* routes.
 *
 * Tabs:
 *   Home, Documents, Meetings (condo/HOA only), Announcements, More
 *
 * Active tab is derived from the current pathname via usePathname().
 * Meetings tab is hidden when features.hasMeetings is false (apartment communities).
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  FileText,
  Calendar,
  Megaphone,
  MoreHorizontal,
} from 'lucide-react';
import type { CommunityFeatures } from '@propertypro/shared';

interface Tab {
  label: string;
  href: string;
  icon: React.ElementType;
  /** If true, tab is only shown when the feature is enabled */
  featureKey?: keyof CommunityFeatures;
}

const TABS: Tab[] = [
  { label: 'Home', href: '/mobile', icon: Home },
  { label: 'Documents', href: '/mobile/documents', icon: FileText },
  { label: 'Meetings', href: '/mobile/meetings', icon: Calendar, featureKey: 'hasMeetings' },
  { label: 'Announcements', href: '/mobile/announcements', icon: Megaphone },
  { label: 'More', href: '/mobile/more', icon: MoreHorizontal },
];

interface BottomTabBarProps {
  features: CommunityFeatures;
  communityId: number;
}

export function BottomTabBar({ features, communityId }: BottomTabBarProps) {
  const pathname = usePathname();

  const visibleTabs = TABS.filter((tab) => {
    if (tab.featureKey) {
      return features[tab.featureKey] === true;
    }
    return true;
  });

  function buildHref(baseHref: string) {
    return `${baseHref}?communityId=${communityId}`;
  }

  function isActive(tab: Tab): boolean {
    const base = tab.href;
    if (base === '/mobile') {
      // Exact match for home to avoid matching all /mobile/* routes
      return pathname === '/mobile' || pathname === '/mobile/';
    }
    return pathname.startsWith(base);
  }

  return (
    <nav className="mobile-tab-bar" aria-label="Mobile navigation">
      {visibleTabs.map((tab) => {
        const Icon = tab.icon;
        const active = isActive(tab);

        return (
          <Link
            key={tab.label}
            href={buildHref(tab.href)}
            className="mobile-tab-item"
            data-active={active ? 'true' : 'false'}
            aria-current={active ? 'page' : undefined}
            aria-label={tab.label}
          >
            <Icon size={24} strokeWidth={active ? 2.5 : 1.8} aria-hidden="true" />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
