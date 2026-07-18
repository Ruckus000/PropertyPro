/**
 * Static route-segment → human label registry for the auto-derived breadcrumb
 * trail (build-auto-trail.ts). Covers the app's known static path segments so
 * that routes which don't publish a per-page trail still get readable crumbs.
 *
 * Dynamic segments (`[id]`, `[slug]`, `[threadId]`, …) are NOT in here — they
 * are resolved either by a page publishing its real entity name, or by the
 * `humanize`/`#id` fallback in the builder.
 */
export const SEGMENT_LABELS: Record<string, string> = {
  // Top-level sections
  dashboard: 'Dashboard',
  overview: 'Overview',
  documents: 'Documents',
  meetings: 'Meetings',
  announcements: 'Announcements',
  board: 'Board',
  operations: 'Operations',
  compliance: 'Compliance',
  contracts: 'Contracts',
  insurance: 'Insurance',
  esign: 'E-Sign',
  finance: 'Finance',
  assessments: 'Assessments',
  payments: 'Payments',
  residents: 'Residents',
  units: 'Units',
  leases: 'Leases',
  packages: 'Packages',
  visitors: 'Visitors',
  maintenance: 'Maintenance',
  emergency: 'Emergency',
  violations: 'Violations',
  'arc-requests': 'ARC Requests',
  'audit-trail': 'Audit Trail',
  notifications: 'Notifications',
  settings: 'Settings',
  account: 'Account',
  billing: 'Billing',
  help: 'Help Center',
  'select-community': 'Communities',
  communities: 'Communities',

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

  // PM portal — the `/pm` and `/portfolio` roots are skipped structurally in
  // build-auto-trail; `pm` only surfaces as a crumb in non-portal contexts
  // (e.g. the `/help/pm` category), so keep it neutral.
  pm: 'PM',
  portfolio: 'Portfolio',
  'portfolio-templates': 'Portfolio Templates',
  reports: 'Reports',
  website: 'Website',
  branding: 'Website',
};

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
