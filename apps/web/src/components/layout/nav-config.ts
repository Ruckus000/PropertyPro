/**
 * Navigation item configuration for the authenticated app shell.
 *
 * Items remain the canonical source of truth for routing, gating, and
 * active-state matching. Section groupings are derived from this list so
 * the sidebar can render the new section model without duplicating config.
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
  FileSignature,
} from 'lucide-react';
import {
  ADMIN_ROLES,
  isAdminRole,
  isCommunityRole,
  getFeaturesForCommunity,
  PLAN_FEATURES,
  findCheapestPlanForFeature,
  type AnyCommunityRole,
  type CommunityRole,
  type CommunityFeatures,
  type CommunityType,
  type PlanId,
} from '@propertypro/shared';

export interface NavItemConfig {
  id: string;
  label: string;
  icon: LucideIcon;
  href: (communityId: number) => string;
  /** Optional child item IDs for nested sidebar disclosure groups. */
  children?: readonly string[];
  /** Restrict to these roles. Omit = visible to all roles. */
  roles?: readonly CommunityRole[];
  /** Only show when this community feature is enabled. */
  featureKey?: keyof CommunityFeatures;
  /** Navigation group for visual separation. */
  group: 'main' | 'admin';
  /** Pathname prefixes used for active-state matching. */
  matchPrefixes: readonly string[];
}

export interface NavSection {
  label: string | null;
  items: readonly NavItemConfig[];
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
    href: (cid) => `/communities/${cid}/documents`,
    group: 'main',
    matchPrefixes: ['/documents'],
  },
  {
    id: 'meetings',
    label: 'Meetings',
    icon: Calendar,
    href: (cid) => `/communities/${cid}/meetings`,
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
    children: ['maintenance-inbox'],
    featureKey: 'hasMaintenanceRequests',
    group: 'main',
    matchPrefixes: ['/maintenance/submit'],
  },
  {
    id: 'leases',
    label: 'Leases',
    icon: FileText,
    href: (cid) => `/dashboard/leases?communityId=${cid}`,
    children: ['move-in-out'],
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
    href: (cid) => `/communities/${cid}/payments`,
    children: ['assessments', 'finance'],
    featureKey: 'hasFinance',
    group: 'main',
    matchPrefixes: ['/payments'],
  },
  {
    id: 'violations-report',
    label: 'Report Violation',
    icon: AlertTriangle,
    href: (cid) => `/violations/report?communityId=${cid}`,
    children: ['violations-inbox'],
    featureKey: 'hasViolations',
    group: 'main',
    matchPrefixes: ['/violations/report'],
  },

  // ── Admin ──
  {
    id: 'compliance',
    label: 'Compliance',
    icon: Shield,
    href: (cid) => `/communities/${cid}/compliance`,
    roles: ADMIN_ROLES,
    featureKey: 'hasCompliance',
    group: 'admin',
    matchPrefixes: ['/compliance'],
  },
  {
    id: 'residents',
    label: 'Residents',
    icon: Users,
    href: (cid) => `/dashboard/residents?communityId=${cid}`,
    roles: ADMIN_ROLES,
    group: 'admin',
    matchPrefixes: ['/dashboard/residents'],
  },
  {
    id: 'maintenance-inbox',
    label: 'Inbox',
    icon: ClipboardList,
    href: (cid) => `/maintenance/inbox?communityId=${cid}`,
    roles: ADMIN_ROLES,
    featureKey: 'hasMaintenanceRequests',
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
    id: 'esign',
    label: 'E-Sign',
    icon: FileSignature,
    href: (cid) => `/esign?communityId=${cid}`,
    roles: ADMIN_ROLES,
    featureKey: 'hasEsign',
    group: 'admin',
    matchPrefixes: ['/esign'],
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
    href: (cid) => `/communities/${cid}/assessments`,
    roles: ADMIN_ROLES,
    featureKey: 'hasFinance',
    group: 'admin',
    matchPrefixes: ['/assessments'],
  },
  {
    id: 'finance',
    label: 'Finance',
    icon: BarChart3,
    href: (cid) => `/communities/${cid}/finance`,
    roles: ADMIN_ROLES,
    featureKey: 'hasFinance',
    group: 'admin',
    matchPrefixes: ['/finance'],
  },
];

const NAV_ITEM_BY_ID = new Map(NAV_ITEMS.map((item) => [item.id, item] as const));

function navItem(id: string): NavItemConfig {
  const item = NAV_ITEM_BY_ID.get(id);
  if (!item) {
    throw new Error(`Unknown nav item ID: ${id}`);
  }

  return item;
}

function navSection(label: string | null, itemIds: readonly string[]): NavSection {
  return {
    label,
    items: itemIds.map(navItem),
  };
}

export const NAV_SECTIONS: readonly NavSection[] = [
  navSection(null, ['dashboard']),
  navSection('Community', ['documents', 'meetings', 'announcements', 'maintenance']),
  navSection('Management', ['leases', 'packages', 'visitors', 'payments', 'violations-report']),
  navSection('Admin', [
    'compliance',
    'residents',
    'maintenance-inbox',
    'contracts',
    'esign',
    'violations-inbox',
    'move-in-out',
    'audit-trail',
    'assessments',
    'finance',
  ]),
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
 * A nav item augmented with plan-gate status.
 *
 * `planLocked` is true when the community TYPE supports the feature
 * but the current PLAN does not — the item should be shown but locked.
 */
export interface NavItemWithGateStatus extends NavItemConfig {
  planLocked: boolean;
  upgradePlanName: string | null;
}

/**
 * Filter nav items by role/features and annotate plan-locked status.
 *
 * Items gated by community TYPE are hidden entirely. Items gated by
 * subscription PLAN are kept visible but marked as locked so the UI
 * can show an upgrade prompt.
 */
export function getVisibleItemsWithPlanGate(
  items: readonly NavItemConfig[],
  role: AnyCommunityRole | null,
  features: CommunityFeatures | null,
  communityType: CommunityType | null,
  planId: PlanId | null,
): NavItemWithGateStatus[] {
  // Raw type-level features (before plan intersection)
  const typeFeatures = communityType ? getFeaturesForCommunity(communityType) : null;

  return items
    .filter((item) => {
      // Role gate — same logic as getVisibleItems
      if (item.roles && role) {
        if (isCommunityRole(role)) {
          if (!item.roles.includes(role)) return false;
        } else {
          if (!isAdminRole(role)) return false;
        }
      }
      // Community-type gate: if the TYPE doesn't support it, hide entirely
      if (item.featureKey && typeFeatures && !typeFeatures[item.featureKey]) return false;
      return true;
    })
    .map((item) => {
      let planLocked = false;
      let upgradePlanName: string | null = null;

      // Plan gate: type allows but composed features don't → plan-locked
      if (item.featureKey && features && !features[item.featureKey] && planId) {
        const planConfig = PLAN_FEATURES[planId];
        if (planConfig && !planConfig.features[item.featureKey]) {
          planLocked = true;
          // Find cheapest plan that includes this feature
          const upgrade = findCheapestPlanForFeature(item.featureKey!);
          upgradePlanName = upgrade?.displayName ?? null;
        }
      }

      return { ...item, planLocked, upgradePlanName };
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
  esign: { title: 'E-Sign', subtitle: 'Digital document signing' },
  'violations-report': { title: 'Report Violation', subtitle: 'Submit a community violation' },
  'violations-inbox': { title: 'Violations Inbox', subtitle: 'Review & manage violations' },
  'audit-trail': { title: 'Audit Trail', subtitle: 'Activity log' },
  payments: { title: 'Payments', subtitle: 'View balance & pay assessments' },
  assessments: { title: 'Assessments', subtitle: 'Manage dues & schedules' },
  finance: { title: 'Finance', subtitle: 'Payment dashboard & reports' },
  residents: { title: 'Residents', subtitle: 'Manage community members' },
  communities: { title: 'Communities', subtitle: 'Managed portfolio' },
  branding: { title: 'Branding', subtitle: 'White-label settings' },
  leases: { title: 'Leases', subtitle: 'Manage unit leases' },
  packages: { title: 'Packages', subtitle: 'Track package deliveries' },
  visitors: { title: 'Visitors', subtitle: 'Manage visitor access' },
  'move-in-out': { title: 'Move In/Out', subtitle: 'Move-in & move-out checklists' },
  reports: { title: 'Reports', subtitle: 'Portfolio analytics & reports' },
};
