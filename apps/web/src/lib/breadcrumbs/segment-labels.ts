/**
 * Static route-segment → human label registry for the auto-derived breadcrumb
 * trail (build-auto-trail.ts). Covers the app's known static path segments so
 * that routes which don't publish a per-page trail still get readable crumbs.
 *
 * Dynamic segments (`[id]`, `[slug]`, `[threadId]`, …) are NOT in here — they
 * are resolved either by the page's <h1> or the `humanize`/`#id` fallback in
 * the builder.
 *
 * Label sources (single-source-of-truth, no drift):
 *   • NAV_LINKED_SEGMENTS — segments that map 1:1 to a sidebar nav item. Only
 *     the (stable) URL-segment → nav-item-id routing fact lives here; the label
 *     TEXT is pulled from nav-config, so a sidebar rename flows through to the
 *     breadcrumb automatically. The `nav-config` label parsing is unreliable
 *     (PM 'communities' matches `/pm/dashboard`, 'violations-report' ends in
 *     `report`), which is why we key by id, not by href/prefix.
 *   • SUB_SEGMENT_LABELS — breadcrumb-only segments with no nav entry, plus a
 *     few intentional divergences from the sidebar label (documented inline).
 */
import { NAV_ITEMS, PM_NAV_ITEMS } from '@/components/layout/nav-config';

/** URL segment → nav-config item id. Label text is derived from nav-config. */
const NAV_LINKED_SEGMENTS: Record<string, string> = {
  dashboard: 'dashboard',
  documents: 'documents',
  meetings: 'meetings',
  announcements: 'announcements',
  board: 'board',
  operations: 'operations',
  compliance: 'compliance',
  contracts: 'contracts',
  insurance: 'insurance',
  esign: 'esign',
  payments: 'payments',
  residents: 'residents',
  units: 'units',
  leases: 'leases',
  packages: 'packages',
  visitors: 'visitors',
  'move-in-out': 'move-in-out',
  violations: 'violations-inbox',
  'arc-requests': 'arc-requests',
  'audit-trail': 'audit-trail',
  communities: 'communities', // PM portfolio list
  reports: 'reports', // PM reports
};

/**
 * Segments with no sidebar nav entry, or where the breadcrumb label
 * intentionally differs from the sidebar label.
 */
const SUB_SEGMENT_LABELS: Record<string, string> = {
  // Top-level routes without a nav item (profile/settings family, etc.)
  overview: 'Overview',
  finance: 'Finance',
  assessments: 'Assessments',
  maintenance: 'Maintenance',
  emergency: 'Emergency',
  notifications: 'Notifications',
  settings: 'Settings',
  account: 'Account',
  billing: 'Billing',
  help: 'Help Center',
  'select-community': 'Communities',

  // Board sub-sections
  forum: 'Forum',
  elections: 'Elections',
  polls: 'Polls',

  // Documents / meetings sub-sections
  author: 'Author',
  minutes: 'Minutes',

  // E-Sign sub-sections
  templates: 'Templates',
  submissions: 'Submissions',

  // Insurance sub-sections
  'wind-mitigation': 'Wind Mitigation',

  // Settings sub-sections
  roles: 'Roles',
  transparency: 'Transparency',

  // Help sub-sections
  statutes: 'Statutes',
  contact: 'Contact',

  // Generic verbs / leaf segments
  new: 'New',
  edit: 'Edit',
  report: 'Report',
  submit: 'Submit',
  inbox: 'Inbox',
  export: 'Export',

  // PM portal roots + intentional divergences from the sidebar label.
  // `/pm` and `/portfolio` are skipped structurally in build-auto-trail; `pm`
  // only surfaces in non-portal contexts (e.g. the `/help/pm` category).
  // 'Portfolio Templates' reads clearer out of PM context than the sidebar's
  // 'Templates'; `branding`/`website` map to the sidebar 'Website'.
  pm: 'PM',
  portfolio: 'Portfolio',
  'portfolio-templates': 'Portfolio Templates',
  website: 'Website',
  branding: 'Website',
};

/** id → label for every sidebar nav item (community + PM portal). */
export const NAV_LABEL_BY_ID: ReadonlyMap<string, string> = new Map(
  [...NAV_ITEMS, ...PM_NAV_ITEMS].map((item) => [item.id, item.label] as const),
);

function deriveNavSectionLabels(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [segment, navId] of Object.entries(NAV_LINKED_SEGMENTS)) {
    const label = NAV_LABEL_BY_ID.get(navId);
    if (label) out[segment] = label;
  }
  return out;
}

/**
 * The merged registry the builder consumes. Nav-derived section labels first,
 * then breadcrumb-only/divergent overrides (which win on the rare key overlap).
 */
export const SEGMENT_LABELS: Record<string, string> = {
  ...deriveNavSectionLabels(),
  ...SUB_SEGMENT_LABELS,
};

/** Exported for the drift test — not used at runtime. */
export const __NAV_LINKED_SEGMENTS = NAV_LINKED_SEGMENTS;

/**
 * Fallback label for a segment not in SEGMENT_LABELS: turn `wind-mitigation`
 * into `Wind Mitigation`.
 */
export function humanize(segment: string): string {
  return segment
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
