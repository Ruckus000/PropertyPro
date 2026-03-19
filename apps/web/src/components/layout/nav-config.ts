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
  CreditCard,
  DollarSign,
  BarChart3,
  AlertTriangle,
  Package,
  Users,
  ClipboardCheck,
} from 'lucide-react';
import { ADMIN_ROLES, isAdminRole, isCommunityRole, type AnyCommunityRole, type CommunityRole, type CommunityFeatures } from '@propertypro/shared';

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
    matchPrefixes: ['/documents'],
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
  {
    id: 'leases',
    label: 'Leases',
    icon: FileText,
    href: (cid) => `/dashboard/leases?communityId=${cid}`,
    featureKey: 'hasLeaseTracking',
    group: 'main',
    matchPrefixes: ['/dashboard/leases'],
  },
  {
    id: 'packages',
    label: 'Packages',
    icon: Package,
    href: (cid) => `/dashboard/packages?communityId=${cid}`,
    featureKey: 'hasPackageLogging',
    group: 'main',
    matchPrefixes: ['/dashboard/packages'],
  },
  {
    id: 'visitors',
    label: 'Visitors',
    icon: Users,
    href: (cid) => `/dashboard/visitors?communityId=${cid}`,
    featureKey: 'hasVisitorLogging',
    group: 'main',
    matchPrefixes: ['/dashboard/visitors'],
  },
  {
    id: 'payments',
    label: 'Payments',
    icon: CreditCard,
    href: (cid) => `/payments?communityId=${cid}`,
    featureKey: 'hasFinance',
    group: 'main',
    matchPrefixes: ['/payments'],
  },
  {
    id: 'violations-report',
    label: 'Report Violation',
    icon: AlertTriangle,
    href: (cid) => `/violations/report?communityId=${cid}`,
    featureKey: 'hasViolations',
    group: 'main',
    matchPrefixes: ['/violations/report'],
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
    id: 'violations-inbox',
    label: 'Violations Inbox',
    icon: AlertTriangle,
    href: (cid) => `/violations/inbox?communityId=${cid}`,
    roles: ADMIN_ROLES,
    featureKey: 'hasViolations',
    group: 'admin',
    matchPrefixes: ['/violations/inbox'],
  },
  {
    id: 'move-in-out',
    label: 'Move In/Out',
    icon: ClipboardCheck,
    href: (cid) => `/dashboard/move-in-out?communityId=${cid}`,
    featureKey: 'hasLeaseTracking',
    roles: ADMIN_ROLES,
    group: 'admin',
    matchPrefixes: ['/dashboard/move-in-out'],
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
  {
    id: 'assessments',
    label: 'Assessments',
    icon: DollarSign,
    href: (cid) => `/assessments?communityId=${cid}`,
    roles: ADMIN_ROLES,
    featureKey: 'hasFinance',
    group: 'admin',
    matchPrefixes: ['/assessments'],
  },
  {
    id: 'finance',
    label: 'Finance',
    icon: BarChart3,
    href: (cid) => `/finance?communityId=${cid}`,
    roles: ADMIN_ROLES,
    featureKey: 'hasFinance',
    group: 'admin',
    matchPrefixes: ['/finance'],
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
  {
    id: 'reports',
    label: 'Reports',
    icon: BarChart3,
    href: () => '/pm/reports',
    group: 'main',
    matchPrefixes: ['/pm/reports'],
  },
];

/**
 * Filter nav items by user role and community features.
 */
export function getVisibleItems(
  items: readonly NavItemConfig[],
  role: AnyCommunityRole | null,
  features: CommunityFeatures | null,
): NavItemConfig[] {
  return items.filter((item) => {
    if (item.roles && role) {
      if (isCommunityRole(role)) {
        if (!item.roles.includes(role)) return false;
      } else {
        // New roles: all role-gated nav items are currently admin-gated
        if (!isAdminRole(role)) return false;
      }
    }
    if (item.featureKey && features && !features[item.featureKey]) return false;
    return true;
  });
}

/**
 * Determine the active nav item ID based on the current pathname.
 * Uses segment-aware matching: a prefix matches if the pathname starts
 * with it OR contains it as a path segment (e.g. '/compliance' matches
 * '/communities/1/compliance'). The longest matching prefix wins.
 */
export function getActiveItemId(
  items: readonly NavItemConfig[],
  pathname: string,
): string | null {
  let bestMatch: { id: string; prefixLength: number } | null = null;

  for (const item of items) {
    for (const prefix of item.matchPrefixes) {
      const matches =
        pathname.startsWith(prefix) ||
        pathname.includes(prefix + '/') ||
        pathname.endsWith(prefix);
      if (matches) {
        if (!bestMatch || prefix.length > bestMatch.prefixLength) {
          bestMatch = { id: item.id, prefixLength: prefix.length };
        }
      }
    }
  }

  return bestMatch?.id ?? null;
}

/** Page title/subtitle mapping for the top bar */
export const PAGE_TITLES: Record<string, { title: string; subtitle: string }> = {
  dashboard: { title: 'Dashboard', subtitle: '' },
  documents: { title: 'Documents', subtitle: 'Upload & manage files' },
  meetings: { title: 'Meetings', subtitle: 'Schedule & notices' },
  announcements: { title: 'Announcements', subtitle: 'Community updates' },
  maintenance: { title: 'Maintenance', subtitle: 'Submit & track requests' },
  compliance: { title: 'Compliance', subtitle: 'Statutory requirements' },
  'maintenance-inbox': { title: 'Maintenance Inbox', subtitle: 'Review requests' },
  contracts: { title: 'Contracts', subtitle: 'Vendor tracking' },
  'violations-report': { title: 'Report Violation', subtitle: 'Submit a community violation' },
  'violations-inbox': { title: 'Violations Inbox', subtitle: 'Review & manage violations' },
  'audit-trail': { title: 'Audit Trail', subtitle: 'Activity log' },
  payments: { title: 'Payments', subtitle: 'View balance & pay assessments' },
  assessments: { title: 'Assessments', subtitle: 'Manage dues & schedules' },
  finance: { title: 'Finance', subtitle: 'Payment dashboard & reports' },
  communities: { title: 'Communities', subtitle: 'Managed portfolio' },
  branding: { title: 'Branding', subtitle: 'White-label settings' },
  leases: { title: 'Leases', subtitle: 'Manage unit leases' },
  packages: { title: 'Packages', subtitle: 'Track package deliveries' },
  visitors: { title: 'Visitors', subtitle: 'Manage visitor access' },
  'move-in-out': { title: 'Move In/Out', subtitle: 'Move-in & move-out checklists' },
  reports: { title: 'Reports', subtitle: 'Portfolio analytics & reports' },
};
