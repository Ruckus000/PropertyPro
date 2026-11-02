/**
 * Which audit entries count as routine, and which belong to each "Show" choice
 * on the audit trail page.
 *
 * Pure data, no database import: the service turns these rules into a SQL
 * `where` (`apps/web/src/lib/services/audit-trail-service.ts`) and the client
 * reads the same rules, so the page and the query can never disagree about
 * what "Important" means.
 *
 * A rule matches on `action`, optionally narrowed to one `resourceType`.
 */

export interface AuditRule {
  action: string;
  resourceType?: string;
}

/** The "Show" choices, in the order the page lists them. */
export const AUDIT_VIEWS = ['important', 'all', 'deleted', 'downloads', 'access', 'notices'] as const;
export type AuditView = (typeof AUDIT_VIEWS)[number];

export const AUDIT_VIEW_LABELS: Record<AuditView, string> = {
  important: 'Important',
  all: 'Everything',
  deleted: 'Deleted',
  downloads: 'Downloads',
  access: 'Access changes',
  notices: 'Notices',
};

/** How the printed record describes each choice: "Showing: all activity, last 30 days." */
export const AUDIT_VIEW_PHRASES: Record<AuditView, string> = {
  important: 'important activity',
  all: 'all activity',
  deleted: 'deletions',
  downloads: 'downloads',
  access: 'access changes',
  notices: 'notices',
};

export function isAuditView(value: string | null | undefined): value is AuditView {
  return value !== null && value !== undefined && (AUDIT_VIEWS as readonly string[]).includes(value);
}

/**
 * Entries that happen many times a day as a side effect of normal use. They
 * stay in the log and in "Everything"; "Important" hides them and says how many
 * it hid. Measured on production (2026-11-01): the first four rules alone were
 * ~70% of all rows.
 */
export const ROUTINE_RULES: readonly AuditRule[] = [
  { action: 'update', resourceType: 'onboarding_wizard' }, // setup-wizard autosave
  { action: 'create', resourceType: 'ledger_entry' }, // automatic charges and payments
  { action: 'create', resourceType: 'assessment_line_item_batch' },
  { action: 'document_accessed' }, // someone opened or downloaded a document
  { action: 'site_design_draft_saved' },
  { action: 'create', resourceType: 'document_draft' },
  { action: 'delete', resourceType: 'community_site_drafts' },
  { action: 'update', resourceType: 'site_block' }, // draft edits; publishing is its own entry
  { action: 'create', resourceType: 'site_image' },
  { action: 'update', resourceType: 'visitor_log' }, // check-in / automatic check-out
  { action: 'create', resourceType: 'visitor_log' },
  { action: 'update', resourceType: 'package_log' },
  { action: 'update', resourceType: 'community_export_job' },
  { action: 'esign_reminder_sent' },
  { action: 'notification_delivery_partial' },
  { action: 'validation_failed' },
  { action: 'faq.reordered' },
];

/** Removals. `community_purged` is the irreversible end of community deletion. */
const DELETED_RULES: readonly AuditRule[] = [
  { action: 'delete' },
  { action: 'document_deleted' },
  { action: 'faq.deleted' },
  { action: 'community_purged' },
  { action: 'community_canceled' },
  { action: 'esign_template_archived' },
  { action: 'portfolio_template_deleted' },
  { action: 'custom_domain_removed' },
];

/** Data leaving the system in a file. Opening a single document is routine, not here. */
const DOWNLOAD_RULES: readonly AuditRule[] = [
  { action: 'directory_exported' },
  { action: 'community_export_downloaded' },
  { action: 'create', resourceType: 'community_export_job' },
  { action: 'audit_evidence_generated' },
];

/** Who can get in, and with what powers. Support-session writes are matched separately. */
export const ACCESS_RULES: readonly AuditRule[] = [
  { action: 'role_assigned' },
  { action: 'role_revoked' },
  { action: 'designation_set' },
  { action: 'designation_cleared' },
  { action: 'root_claimed' },
  { action: 'root_claim_disputed' },
  { action: 'root_reassigned' },
  { action: 'root_transferred' },
  { action: 'root_pending_deletion' },
  { action: 'root_pending_deletion_no_successor' },
  { action: 'user_invited' },
  { action: 'update', resourceType: 'invitation' },
  { action: 'join_request.approved' },
  { action: 'join_request.denied' },
  { action: 'access_request.approved' },
  { action: 'access_request.denied' },
  { action: 'support_consent_granted' },
  { action: 'support_consent_revoked' },
  { action: 'support_session_started' },
  { action: 'support_session_ended' },
  { action: 'create', resourceType: 'resident' },
  { action: 'update', resourceType: 'resident' },
  { action: 'delete', resourceType: 'resident' },
];

/** Things sent to or posted for owners. */
const NOTICE_RULES: readonly AuditRule[] = [
  { action: 'meeting_notice_posted' },
  { action: 'announcement_email_sent' },
  { action: 'emergency_broadcast_sent' },
  { action: 'emergency_broadcast_canceled' },
  { action: 'notification_sent' },
  { action: 'urgent_notice_set' },
  { action: 'urgent_notice_cleared' },
  { action: 'create', resourceType: 'announcement' },
];

/**
 * Rules for each narrowing view. `important` and `all` are absent on purpose:
 * `important` is "everything except ROUTINE_RULES", `all` has no filter.
 */
export const VIEW_RULES: Record<Exclude<AuditView, 'important' | 'all'>, readonly AuditRule[]> = {
  deleted: DELETED_RULES,
  downloads: DOWNLOAD_RULES,
  access: ACCESS_RULES,
  notices: NOTICE_RULES,
};

export function matchesRule(entry: { action: string; resourceType: string }, rule: AuditRule): boolean {
  return entry.action === rule.action && (rule.resourceType === undefined || entry.resourceType === rule.resourceType);
}

export function isRoutineEntry(entry: { action: string; resourceType: string }): boolean {
  return ROUTINE_RULES.some((rule) => matchesRule(entry, rule));
}

/** Entries made while PropertyPro support was signed in as someone carry this metadata key. */
export const SUPPORT_METADATA_KEY = 'support';

/**
 * Which `resource_type` values one searchable item is recorded under. The
 * command-palette search returns an `entityType`; narrowing the audit trail to
 * that item matches any of these types with the same id.
 */
export const SCOPE_RESOURCE_TYPES: Record<string, readonly string[]> = {
  document: ['document'],
  announcement: ['announcement'],
  meeting: ['meeting', 'meeting_document'],
  maintenance: ['maintenance_request', 'maintenance_comment'],
  violation: ['violation', 'violation_fine'],
};

/** Time choices for the "When" menu, in days. `null` means no lower bound. */
export const AUDIT_PERIODS = [
  { value: '7', label: 'Last 7 days', days: 7 },
  { value: '30', label: 'Last 30 days', days: 30 },
  { value: '90', label: 'Last 90 days', days: 90 },
  { value: '365', label: 'Last 12 months', days: 365 },
  { value: 'all', label: 'All time', days: null },
] as const;
export type AuditPeriod = (typeof AUDIT_PERIODS)[number]['value'];
export const DEFAULT_AUDIT_PERIOD: AuditPeriod = '30';

export function isAuditPeriod(value: string | null | undefined): value is AuditPeriod {
  return AUDIT_PERIODS.some((period) => period.value === value);
}

export function periodLabel(period: AuditPeriod): string {
  return AUDIT_PERIODS.find((p) => p.value === period)?.label ?? 'Last 30 days';
}
