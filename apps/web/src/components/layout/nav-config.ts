/**
 * Navigation item configuration for the authenticated app shell.
 *
 * Items are grouped ('main' vs 'admin'), role-gated, and feature-gated.
 * The sidebar filters this list based on the current user's role and
 * the active community's feature flags.
 */
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  FileText,
  Calendar,
  Megaphone,
  Wrench,
  Shield,
  ClipboardList,
  History,
  Building2,
  Paintbrush,
} from 'lucide-react';
import type { CommunityRole, CommunityFeatures } from '@propertypro/shared';

export interface NavItemConfig {
  id: string;
  label: string;
  icon: LucideIcon;
  href: (communityId: number) => string;
  /** Restrict to these roles. Omit = visible to all roles. */
  roles?: readonly CommunityRole[];
  /** Only show when this community feature is enabled. */
  featureKey?: keyof CommunityFeatures;
  /** Navigation group for visual separation. */
  group: 'main' | 'admin';
  /** Pathname prefixes used for active-state matching. */
  matchPrefixes: readonly string[];
}

const ADMIN_ROLES: readonly CommunityRole[] = [
  'board_member',
  'board_president',
  'cam',
  'site_manager',
  'property_manager_admin',
];

export const NAV_ITEMS: readonly NavItemConfig[] = [
  // ── Main ──
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    href: (cid) => `/dashboard?communityId=${cid}`,
    group: 'main',
    matchPrefixes: ['/dashboard'],
  },
  {
    id: 'documents',
    label: 'Documents',
    icon: FileText,
    href: (cid) => `/communities/${cid}/documents?communityId=${cid}`,
    group: 'main',
    matchPrefixes: ['/communities/', '/documents'],
  },
  {
    id: 'meetings',
    label: 'Meetings',
    icon: Calendar,
    href: (cid) => `/communities/${cid}/meetings?communityId=${cid}`,
    featureKey: 'hasMeetings',
    group: 'main',
    matchPrefixes: ['/meetings'],
  },
  {
    id: 'announcements',
    label: 'Announcements',
    icon: Megaphone,
    href: (cid) => `/announcements?communityId=${cid}`,
    group: 'main',
    matchPrefixes: ['/announcements'],
  },
  {
    id: 'maintenance',
    label: 'Maintenance',
    icon: Wrench,
    href: (cid) => `/maintenance/submit?communityId=${cid}`,
    group: 'main',
    matchPrefixes: ['/maintenance/submit'],
  },

  // ── Admin ──
  {
    id: 'compliance',
    label: 'Compliance',
    icon: Shield,
    href: (cid) => `/communities/${cid}/compliance?communityId=${cid}`,
    roles: ADMIN_ROLES,
    featureKey: 'hasCompliance',
    group: 'admin',
    matchPrefixes: ['/compliance'],
  },
  {
    id: 'maintenance-inbox',
    label: 'Inbox',
    icon: ClipboardList,
    href: (cid) => `/maintenance/inbox?communityId=${cid}`,
    roles: ADMIN_ROLES,
    group: 'admin',
    matchPrefixes: ['/maintenance/inbox'],
  },
  {
    id: 'contracts',
    label: 'Contracts',
    icon: FileText,
    href: (cid) => `/contracts?communityId=${cid}`,
    roles: ADMIN_ROLES,
    featureKey: 'hasCompliance',
    group: 'admin',
    matchPrefixes: ['/contracts'],
  },
  {
    id: 'audit-trail',
    label: 'Audit Trail',
    icon: History,
    href: (cid) => `/audit-trail?communityId=${cid}`,
    roles: ADMIN_ROLES,
    group: 'admin',
    matchPrefixes: ['/audit-trail'],
  },
];

/** PM-specific navigation items (shown when pathname starts with /pm/) */
export const PM_NAV_ITEMS: readonly NavItemConfig[] = [
  {
    id: 'communities',
    label: 'Communities',
    icon: Building2,
    href: () => '/pm/dashboard/communities',
    group: 'main',
    matchPrefixes: ['/pm/dashboard'],
  },
  {
    id: 'branding',
    label: 'Branding',
    icon: Paintbrush,
    href: () => '/pm/settings/branding',
    group: 'main',
    matchPrefixes: ['/pm/settings'],
  },
];

/**
 * Filter nav items by user role and community features.
 */
export function getVisibleItems(
  items: readonly NavItemConfig[],
  role: CommunityRole | null,
  features: CommunityFeatures | null,
): NavItemConfig[] {
  return items.filter((item) => {
    if (item.roles && role && !item.roles.includes(role)) return false;
    if (item.featureKey && features && !features[item.featureKey]) return false;
    return true;
  });
}

/**
 * Determine the active nav item ID based on the current pathname.
 * Uses matchPrefixes for each item — first match wins, so more specific
 * items should have more specific prefixes.
 */
export function getActiveItemId(
  items: readonly NavItemConfig[],
  pathname: string,
): string | null {
  // Prefer more specific matches first (longer prefixes)
  for (const item of items) {
    for (const prefix of item.matchPrefixes) {
      if (pathname.startsWith(prefix)) {
        return item.id;
      }
    }
  }
  return null;
}

/** Page title/subtitle mapping for the top bar */
export const PAGE_TITLES: Record<string, { title: string; subtitle: string }> = {
  dashboard: { title: 'Dashboard', subtitle: '' },
  documents: { title: 'Documents', subtitle: 'Upload & manage files' },
  meetings: { title: 'Meetings', subtitle: 'Schedule & notices' },
  announcements: { title: 'Announcements', subtitle: 'Community updates' },
  maintenance: { title: 'Maintenance', subtitle: 'Submit & track requests' },
  compliance: { title: 'Compliance', subtitle: 'Florida Statute §718' },
  'maintenance-inbox': { title: 'Maintenance Inbox', subtitle: 'Review requests' },
  contracts: { title: 'Contracts', subtitle: 'Vendor tracking' },
  'audit-trail': { title: 'Audit Trail', subtitle: 'Activity log' },
  communities: { title: 'Communities', subtitle: 'Managed portfolio' },
  branding: { title: 'Branding', subtitle: 'White-label settings' },
};
