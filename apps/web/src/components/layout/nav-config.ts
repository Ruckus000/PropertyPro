/**
 * Navigation item configuration for the authenticated app shell.
 *
 * Items are the canonical source of truth for routing, gating, and
 * active-state matching. NAV_SECTIONS defines the visual grouping
 * (null/Community/Management/Admin) consumed by AppSidebar → NavRail.
 */
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  FileText,
  Calendar,
  Megaphone,
  Vote,
  BriefcaseBusiness,
  Shield,
  History,
  Building2,
  Paintbrush,
  CreditCard,
  BarChart3,
  AlertTriangle,
  Package,
  Users,
  ClipboardCheck,
  FileSignature,
  LayoutTemplate,
} from 'lucide-react';
import {
  ADMIN_ROLES,
  isAdminRole,
  isCommunityRole,
  getFeaturesForCommunity,
  PLAN_FEATURES,
  findCheapestPlanForFeature,
  getLockedFeatureBehavior,
  type AnyCommunityRole,
  type CommunityRole,
  type CommunityFeatures,
  type CommunityType,
  type PlanId,
  type TransitionRole,
} from '@propertypro/shared';

const FINANCE_READ_NAV_ROLES: readonly CommunityRole[] = [
  'owner',
  'board_member',
  'board_president',
  'cam',
  'site_manager',
  'property_manager_admin',
];

/** Essentials slim-nav placement. Ignored outside slim-nav mode. */
export type NavTier = 'default' | 'more';

export interface NavItemConfig {
  id: string;
  label: string;
  icon: LucideIcon;
  href: (communityId: number) => string;
  /** Essentials slim-nav tier for founding root_manager. Defaults to `default`. */
  navTier?: NavTier;
  /** Optional child item IDs for nested sidebar disclosure groups. */
  children?: readonly string[];
  /** Restrict to these roles. Omit = visible to all roles. */
  roles?: readonly CommunityRole[];
  /** Only show when this community feature is enabled. */
  featureKey?: keyof CommunityFeatures;
  /** Visible when ANY of these features is enabled (any-of semantics). Evaluated alongside featureKey. */
  featureKeys?: readonly (keyof CommunityFeatures)[];
  /** Pathname prefixes used for active-state matching. */
  matchPrefixes: readonly string[];
}

export interface NavSection {
  label: string | null;
  items: readonly NavItemConfig[];
}

/**
 * Resolve the dashboard destination for a community in ONE hop.
 *
 * /dashboard server-redirects lease-tracking (apartment) communities to
 * /dashboard/apartment on every visit — a permanent extra round-trip through
 * the middleware for every apartment-community click. Nav surfaces that
 * already know the community's features should link straight to the final
 * destination. (The onboarding-wizard redirects are deliberately kept
 * server-side: they depend on a DB read and only affect pre-onboarding
 * users.)
 */
export function resolveDashboardHref(
  communityId: number,
  features: CommunityFeatures | null,
): string {
  return features?.hasLeaseTracking
    ? `/dashboard/apartment?communityId=${communityId}`
    : `/dashboard?communityId=${communityId}`;
}

export const NAV_ITEMS: readonly NavItemConfig[] = [
  // ── Main ──
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    href: (cid) => `/dashboard?communityId=${cid}`,
    matchPrefixes: ['/dashboard'],
  },
  {
    id: 'documents',
    label: 'Documents',
    icon: FileText,
    href: (cid) => `/communities/${cid}/documents`,
    matchPrefixes: ['/documents'],
  },
  {
    id: 'meetings',
    label: 'Meetings',
    icon: Calendar,
    href: (cid) => `/communities/${cid}/meetings`,
    featureKey: 'hasMeetings',
    matchPrefixes: ['/meetings'],
  },
  {
    id: 'announcements',
    label: 'Announcements',
    icon: Megaphone,
    href: (cid) => `/announcements?communityId=${cid}`,
    matchPrefixes: ['/announcements'],
  },
  {
    id: 'board',
    label: 'Board',
    icon: Vote,
    href: (cid) => `/communities/${cid}/board/polls`,
    featureKey: 'hasCommunityBoard',
    navTier: 'more',
    matchPrefixes: ['/board'],
  },
  {
    id: 'operations',
    label: 'Operations',
    icon: BriefcaseBusiness,
    href: (cid) => `/communities/${cid}/operations?tab=requests`,
    featureKeys: ['hasMaintenanceRequests', 'hasWorkOrders', 'hasAmenities'],
    navTier: 'more',
    matchPrefixes: ['/operations'],
  },
  {
    id: 'leases',
    label: 'Leases',
    icon: FileText,
    href: (cid) => `/dashboard/leases?communityId=${cid}`,
    children: ['move-in-out'],
    featureKey: 'hasLeaseTracking',
    navTier: 'more',
    matchPrefixes: ['/dashboard/leases'],
  },
  {
    id: 'packages',
    label: 'Packages',
    icon: Package,
    href: (cid) => `/dashboard/packages?communityId=${cid}`,
    featureKey: 'hasPackageLogging',
    navTier: 'more',
    matchPrefixes: ['/dashboard/packages'],
  },
  {
    id: 'visitors',
    label: 'Visitors',
    icon: Users,
    href: (cid) => `/dashboard/visitors?communityId=${cid}`,
    featureKey: 'hasVisitorLogging',
    navTier: 'more',
    matchPrefixes: ['/dashboard/visitors'],
  },
  {
    id: 'payments',
    label: 'Payments',
    icon: CreditCard,
    href: (cid) => `/communities/${cid}/payments`,
    roles: FINANCE_READ_NAV_ROLES,
    featureKey: 'hasFinance',
    navTier: 'more',
    matchPrefixes: ['/payments'],
  },
  {
    // Launcher into the public-site / landing-page editor (which lives under
    // /pm/settings/website). Surfaced in the community sidebar so single-
    // community admins (cam) and PM admins can reach it without first going to
    // the PM portal. Gated to the same roles the editor route allows
    // (property_manager_admin + cam) so the link never lands on a redirect.
    id: 'website',
    label: 'Website',
    icon: Paintbrush,
    href: (cid) => `/pm/settings/website?communityId=${cid}`,
    roles: ['property_manager_admin', 'cam'],
    featureKey: 'hasSiteEditor',
    matchPrefixes: ['/pm/settings'],
  },
  {
    id: 'violations-report',
    label: 'Report Violation',
    icon: AlertTriangle,
    href: (cid) => `/violations/report?communityId=${cid}`,
    children: ['violations-inbox'],
    featureKey: 'hasViolations',
    navTier: 'more',
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
    matchPrefixes: ['/compliance'],
  },
  {
    id: 'residents',
    label: 'Residents',
    icon: Users,
    href: (cid) => `/dashboard/residents?communityId=${cid}`,
    roles: ADMIN_ROLES,
    matchPrefixes: ['/dashboard/residents'],
  },
  {
    id: 'units',
    label: 'Units',
    icon: Building2,
    href: (cid) => `/dashboard/units?communityId=${cid}`,
    roles: ADMIN_ROLES,
    matchPrefixes: ['/dashboard/units'],
  },
  {
    id: 'contracts',
    label: 'Contracts',
    icon: FileText,
    href: (cid) => `/contracts?communityId=${cid}`,
    roles: ADMIN_ROLES,
    featureKey: 'hasCompliance',
    navTier: 'more',
    matchPrefixes: ['/contracts'],
  },
  {
    id: 'esign',
    label: 'E-Sign',
    icon: FileSignature,
    href: (cid) => `/esign?communityId=${cid}`,
    roles: ADMIN_ROLES,
    featureKey: 'hasEsign',
    navTier: 'more',
    matchPrefixes: ['/esign'],
  },
  {
    id: 'violations-inbox',
    label: 'Violations',
    icon: AlertTriangle,
    href: (cid) => `/violations?communityId=${cid}`,
    roles: ADMIN_ROLES,
    featureKey: 'hasViolations',
    navTier: 'more',
    matchPrefixes: ['/violations'],
  },
  {
    id: 'arc-requests',
    label: 'ARC Requests',
    icon: ClipboardCheck,
    href: (cid) => `/arc-requests?communityId=${cid}`,
    roles: ADMIN_ROLES,
    featureKey: 'hasARC',
    navTier: 'more',
    matchPrefixes: ['/arc-requests'],
  },
  {
    id: 'move-in-out',
    label: 'Move In/Out',
    icon: ClipboardCheck,
    href: (cid) => `/dashboard/move-in-out?communityId=${cid}`,
    featureKey: 'hasLeaseTracking',
    roles: ADMIN_ROLES,
    navTier: 'more',
    matchPrefixes: ['/dashboard/move-in-out'],
  },
  {
    id: 'audit-trail',
    label: 'Audit Trail',
    icon: History,
    href: (cid) => `/audit-trail?communityId=${cid}`,
    roles: ADMIN_ROLES,
    navTier: 'more',
    matchPrefixes: ['/audit-trail'],
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
  // Parent `children` remain the source of truth for nested rendering. Child IDs
  // also live in a section so `AppSidebar` has a fallback top-level placement when
  // a parent is hidden for the current user but the child itself is still visible.
  navSection(null, ['dashboard']),
  navSection('Community', ['documents', 'meetings', 'announcements', 'board', 'operations']),
  navSection('Management', ['leases', 'packages', 'visitors', 'payments', 'website', 'violations-report']),
  navSection('Admin', [
    'compliance',
    'residents',
    'units',
    'contracts',
    'esign',
    'violations-inbox',
    'arc-requests',
    'move-in-out',
    'audit-trail',
  ]),
];

/** PM-specific navigation items (shown when pathname starts with /pm/) */
export const PM_NAV_ITEMS: readonly NavItemConfig[] = [
  {
    id: 'communities',
    label: 'Communities',
    icon: Building2,
    href: () => '/pm/dashboard/communities',
    matchPrefixes: ['/pm/dashboard'],
  },
  {
    id: 'branding',
    label: 'Website',
    icon: Paintbrush,
    // PR #9c — branding settings moved into the site editor's Branding tab.
    // /pm/settings/branding is a permanent redirect to this destination.
    href: () => '/pm/settings/website',
    matchPrefixes: ['/pm/settings'],
  },
  {
    id: 'portfolio-templates',
    label: 'Templates',
    icon: LayoutTemplate,
    href: () => '/pm/portfolio/templates',
    matchPrefixes: ['/pm/portfolio'],
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: BarChart3,
    href: () => '/pm/reports',
    matchPrefixes: ['/pm/reports'],
  },
];

/**
 * Resolve a sidebar item's destination href.
 *
 * PM portfolio routes (PM_NAV_ITEMS) are cross-community — their href
 * builders ignore the communityId argument — so they must NEVER fall back to
 * /select-community just because the shell has no tenant context (the PM
 * portal routinely renders with community = null). Only community-scoped
 * items use the picker fallback, which exists so a tenant-less shell doesn't
 * render dead `href={undefined}` links (see the www-subdomain incident).
 */
export function resolveNavItemHref(
  item: Pick<NavItemConfig, 'href'>,
  communityId: number | null,
  isPmContext: boolean,
): string {
  if (isPmContext) {
    return item.href(communityId ?? 0);
  }
  return communityId ? item.href(communityId) : '/select-community';
}

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
    if (item.featureKeys && features) {
      const anyEnabled = item.featureKeys.some((key) => features[key]);
      if (!anyEnabled) return false;
    }
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
  upgradePlanId: PlanId | null;
  /**
   * The CommunityFeatures key that triggered the lock — used by the upgrade
   * dialog and locked-feature screen to render feature-specific copy.
   * Null when the lock was triggered by an `featureKeys` (any-of) gate and
   * we don't have a single canonical key to point at.
   */
  upgradeFeatureKey: keyof CommunityFeatures | null;
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
  // Tenants don't see plan-gated marketing surfaces — for them, plan-locked
  // items behave like type-gated ones: filtered out completely.
  const hideLockedEntirely = getLockedFeatureBehavior(role) === 'hidden';

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
      if (item.featureKeys && typeFeatures) {
        const anyTypeEnabled = item.featureKeys.some((key) => typeFeatures[key]);
        if (!anyTypeEnabled) return false;
      }
      return true;
    })
    .map((item) => {
      let planLocked = false;
      let upgradePlanName: string | null = null;
      let upgradePlanId: PlanId | null = null;
      let upgradeFeatureKey: keyof CommunityFeatures | null = null;

      // Plan gate: type allows but composed features don't → plan-locked
      if (item.featureKey && features && !features[item.featureKey] && planId) {
        const planConfig = PLAN_FEATURES[planId];
        if (planConfig && !planConfig.features[item.featureKey]) {
          planLocked = true;
          // Find cheapest plan that includes this feature
          const upgrade = findCheapestPlanForFeature(item.featureKey);
          upgradePlanName = upgrade?.displayName ?? null;
          upgradePlanId = upgrade
            ? ((Object.entries(PLAN_FEATURES).find(([, cfg]) => cfg === upgrade)?.[0] as PlanId | undefined) ?? null)
            : null;
          upgradeFeatureKey = item.featureKey;
        }
      }

      // featureKeys plan gate: locked only if ALL keys are plan-excluded
      if (item.featureKeys && features && planId) {
        const planConfig = PLAN_FEATURES[planId];
        if (planConfig) {
          const allPlanLocked = item.featureKeys.every(
            (key) => !features[key] && !planConfig.features[key],
          );
          if (allPlanLocked) {
            planLocked = true;
            const candidates = item.featureKeys
              .map((key) => findCheapestPlanForFeature(key))
              .filter((x): x is NonNullable<typeof x> => Boolean(x));
            const cheapest = candidates.sort((a, b) => a.monthlyPriceUsd - b.monthlyPriceUsd)[0];
            upgradePlanName = cheapest?.displayName ?? null;
            upgradePlanId = cheapest
              ? ((Object.entries(PLAN_FEATURES).find(([, cfg]) => cfg === cheapest)?.[0] as PlanId | undefined) ??
                null)
              : null;
            // For any-of gates we can't point at a single canonical feature
            // for marketing copy — leave it null and let the dialog fall back.
            upgradeFeatureKey = null;
          }
        }
      }

      return { ...item, planLocked, upgradePlanName, upgradePlanId, upgradeFeatureKey };
    })
    // Tenants: drop plan-locked items so they never see a "Pro" pill or upgrade prompt.
    .filter((item) => !(hideLockedEntirely && item.planLocked));
}

/**
 * Essentials founding admin (`root_manager`) gets a slim default rail with
 * advanced tools collapsed under a "More" section.
 */
export function shouldUseSlimNav(
  role: TransitionRole | AnyCommunityRole | null,
  planId: PlanId | null,
): boolean {
  return role === 'root_manager' && planId === 'essentials';
}

/**
 * Rebuild NAV_SECTIONS for slim nav: default-tier items stay in their
 * original section groupings; more-tier items move to a trailing "More" section.
 */
export function buildSlimNavSections(
  visibleById: ReadonlyMap<string, NavItemWithGateStatus>,
  baseSections: readonly NavSection[],
): NavSection[] {
  const defaultSections: NavSection[] = [];
  const moreItems: NavItemConfig[] = [];

  for (const section of baseSections) {
    const defaultItems: NavItemConfig[] = [];
    for (const item of section.items) {
      if (!visibleById.has(item.id)) continue;
      if (item.navTier === 'more') {
        moreItems.push(item);
      } else {
        defaultItems.push(item);
      }
    }
    if (defaultItems.length > 0) {
      defaultSections.push({ label: section.label, items: defaultItems });
    }
  }

  if (moreItems.length > 0) {
    defaultSections.push({ label: 'More', items: moreItems });
  }

  return defaultSections;
}

/**
 * Determine the active nav item ID based on the current pathname.
 * Uses segment-aware matching: a prefix matches if the pathname starts
 * with it OR contains it as a path segment (e.g. '/compliance' matches
 * '/communities/1/compliance'). The longest matching prefix wins.
 *
 * Optional `search` (query string including leading `?` or without) resolves
 * the Payments submenu: Assessments vs Finance tabs on `/communities/[id]/finance`.
 */
export function getActiveItemId(
  items: readonly NavItemConfig[],
  pathname: string,
  search?: string | null,
): string | null {
  if (/\/communities\/\d+\/finance\/?$/.test(pathname)) {
    const trimmed = search?.trim() ?? '';
    const params =
      trimmed.length > 0
        ? new URLSearchParams(trimmed.startsWith('?') ? trimmed.slice(1) : trimmed)
        : null;
    const tab = params?.get('tab') ?? 'assessments';
    if (tab === 'assessments') return 'assessments';
    return 'finance';
  }

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
  board: { title: 'Board', subtitle: 'Polls, discussions, and elections' },
  operations: { title: 'Operations', subtitle: 'Requests, work orders, and reservations' },
  compliance: { title: 'Compliance', subtitle: 'Statutory requirements' },
  contracts: { title: 'Contracts', subtitle: 'Vendor tracking' },
  esign: { title: 'E-Sign', subtitle: 'Digital document signing' },
  'violations-report': { title: 'Report Violation', subtitle: 'Submit a community violation' },
  'violations-inbox': { title: 'Violations', subtitle: 'Review & manage violations' },
  'arc-requests': { title: 'ARC Requests', subtitle: 'Review architectural submissions' },
  'audit-trail': { title: 'Audit Trail', subtitle: 'Activity log' },
  payments: { title: 'Payments', subtitle: 'View balance & pay assessments' },
  residents: { title: 'Residents', subtitle: 'Manage community members' },
  units: { title: 'Units', subtitle: 'Manage community units' },
  communities: { title: 'Communities', subtitle: 'Managed portfolio' },
  branding: { title: 'Website', subtitle: 'Public site editor + branding' },
  website: { title: 'Website', subtitle: 'Public site editor + branding' },
  leases: { title: 'Leases', subtitle: 'Manage unit leases' },
  packages: { title: 'Packages', subtitle: 'Track package deliveries' },
  visitors: { title: 'Visitors', subtitle: 'Manage visitor access' },
  'move-in-out': { title: 'Move In/Out', subtitle: 'Move-in & move-out checklists' },
  'portfolio-templates': { title: 'Portfolio Templates', subtitle: 'Reusable site-branding templates' },
  reports: { title: 'Reports', subtitle: 'Portfolio analytics & reports' },
  help: { title: 'Help Center', subtitle: 'Guides, FAQs, and support' },
};
