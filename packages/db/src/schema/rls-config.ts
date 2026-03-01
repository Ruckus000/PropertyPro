/**
 * P4-55 RLS inventory and policy-family config.
 *
 * This file is the source of truth for policy coverage tests so new tenant-scoped
 * tables do not silently miss RLS rollout.
 */

export type RlsPolicyFamily =
  | 'tenant_crud'              // All 4 ops gated on community membership
  | 'tenant_append_only'       // SELECT + INSERT only; UPDATE/DELETE blocked at RLS level
  | 'tenant_admin_write'       // SELECT on membership; INSERT/UPDATE/DELETE require admin-tier role
  | 'tenant_user_scoped'       // SELECT/UPDATE/DELETE scoped to auth.uid() for non-admins; admin-tier sees all; INSERT uses community-membership check (generic pp_tenant_insert) unless a bespoke insert policy replaces it
  | 'tenant_member_configurable' // SELECT on membership; INSERT/UPDATE/DELETE gated on community_settings JSONB (admin-tier always allowed; members allowed when setting is absent or 'all_members')
  | 'service_only'             // All ops require pp_rls_is_privileged()
  | 'audit_log_restricted';    // SELECT requires admin-tier role; INSERT requires privilege

export interface RlsTenantTableConfig {
  tableName: string;
  policyFamily: RlsPolicyFamily;
  notes?: string;
}

export interface RlsGlobalTableExclusion {
  tableName: string;
  reason: string;
}

export const RLS_TENANT_TABLES = [
  { tableName: 'announcement_delivery_log', policyFamily: 'service_only' },
  {
    tableName: 'announcements',
    policyFamily: 'tenant_member_configurable',
    notes: 'Writes configurable per-community via community_settings.announcementsWriteLevel. Default (absent or all_members): any community member may write. admin_only: only admin-tier roles may write. SELECT remains open to all community members.',
  },
  { tableName: 'compliance_audit_log', policyFamily: 'audit_log_restricted' },
  {
    tableName: 'compliance_checklist_items',
    policyFamily: 'tenant_admin_write',
    notes: 'Writes restricted to site_manager/property_manager_admin via requireMutationAuthorization in onboarding routes.',
  },
  {
    tableName: 'contract_bids',
    policyFamily: 'tenant_admin_write',
    notes: 'Writes restricted to ADMIN_ROLES (board_member/board_president/cam/site_manager/property_manager_admin) via requireAdminRole in contracts route.',
  },
  {
    tableName: 'contracts',
    policyFamily: 'tenant_admin_write',
    notes: 'Writes restricted to ADMIN_ROLES (board_member/board_president/cam/site_manager/property_manager_admin) via requireAdminRole in contracts route.',
  },
  { tableName: 'demo_seed_registry', policyFamily: 'service_only' },
  {
    tableName: 'document_categories',
    policyFamily: 'tenant_member_configurable',
    notes: 'Writes configurable via community_settings.documentCategoriesWriteLevel. No standalone write API endpoint exists today; writes occur only through onboarding. admin_only setting allows communities to prevent ad-hoc category creation.',
  },
  {
    tableName: 'documents',
    policyFamily: 'tenant_admin_write',
    notes: 'Writes restricted to ADMIN_ROLES (board_member/board_president/cam/site_manager/property_manager_admin) via requireAdminRole in document routes.',
  },
  {
    tableName: 'invitations',
    policyFamily: 'tenant_admin_write',
    notes: 'Writes restricted to ADMIN_ROLES via requireAdminRole in invitations route.',
  },
  {
    tableName: 'leases',
    policyFamily: 'tenant_member_configurable',
    notes: 'Writes configurable via community_settings.leasesWriteLevel. Apartment-only feature. Communities may restrict lease mutations to admin-tier roles for financial integrity.',
  },
  {
    tableName: 'maintenance_comments',
    policyFamily: 'tenant_append_only',
    notes: 'Append-only: UPDATE/DELETE dropped at RLS level, consistent with scoped-client APPEND_ONLY_TABLES. INSERT (pp_maintenance_comments_insert) requires the commenter to be authorized to view the associated request: admin-tier or the original submitter (submitted_by_id = auth.uid() on the parent maintenance_request).',
  },
  {
    tableName: 'maintenance_requests',
    policyFamily: 'tenant_user_scoped',
    notes: 'SELECT scoped to own rows for non-admin actors (submitted_by_id = auth.uid()); admin-tier roles see all community requests. UPDATE and DELETE (pp_maintenance_requests_update/delete) are also user-scoped: only the submitter or admin-tier may mutate a request. INSERT retains community-scoped pp_tenant_insert.',
  },
  {
    tableName: 'meeting_documents',
    policyFamily: 'tenant_member_configurable',
    notes: 'Writes configurable via community_settings.meetingDocumentsWriteLevel. Coupled with meetings write-level in practice.',
  },
  {
    tableName: 'meetings',
    policyFamily: 'tenant_member_configurable',
    notes: 'Writes configurable via community_settings.meetingsWriteLevel. Condo/HOA-only feature (apartments excluded by requireMeetingsEnabled()). Communities may restrict meeting management to admin-tier roles.',
  },
  { tableName: 'notification_digest_queue', policyFamily: 'service_only' },
  {
    tableName: 'notification_preferences',
    policyFamily: 'tenant_user_scoped',
    notes: 'All four operations scoped to own rows (user_id = auth.uid()) for non-privileged actors. SELECT and UPDATE (pp_notification_preferences_select/update) were hardened in 0025. INSERT and DELETE (pp_notification_preferences_insert/delete) hardened in 0026 to prevent IDOR. Admin-tier roles retain full access via pp_rls_is_privileged() / pp_rls_can_read_audit_log().',
  },
  {
    tableName: 'onboarding_wizard_state',
    policyFamily: 'tenant_admin_write',
    notes: 'Community-shared wizard state: a single row per (community, wizardType) shared across all admins. All writes (INSERT/UPDATE/DELETE) restricted to admin-tier roles (pp_rls_can_read_audit_log) at the DB layer, hardened in 0026. SELECT remains open to all community members (pp_tenant_select).',
  },
  { tableName: 'provisioning_jobs', policyFamily: 'service_only' },
  {
    tableName: 'units',
    policyFamily: 'tenant_member_configurable',
    notes: 'Writes configurable via community_settings.unitsWriteLevel. Units are community inventory; communities may restrict creation/modification to admin-tier roles.',
  },
  {
    tableName: 'user_roles',
    policyFamily: 'tenant_admin_write',
    notes: 'INSERT/UPDATE/DELETE require admin-tier role (pp_rls_can_read_audit_log). SELECT uses community membership. No recursion risk: pp_rls_has_community_membership is SECURITY DEFINER.',
  },
] as const satisfies readonly RlsTenantTableConfig[];

export const RLS_GLOBAL_TABLE_EXCLUSIONS = [
  { tableName: 'communities', reason: 'Root tenant entity — isolation enforced on id column (not community_id) by ScopedClient special-case; RLS is enabled (pp_communities_* policies, 0026) but community_id FK-based scoping does not apply' },
  { tableName: 'users', reason: 'Global identity mirror (no community_id column)' },
  { tableName: 'pending_signups', reason: 'Pre-provisioning flow, not community-scoped yet' },
  { tableName: 'stripe_webhook_events', reason: 'Global billing webhook log' },
  { tableName: 'platform_admin_users', reason: 'Platform-level admin authorization — service_role only (REVOKE ALL from anon/authenticated). No community_id column; not community-scoped.' },
] as const satisfies readonly RlsGlobalTableExclusion[];

export const RLS_TENANT_TABLE_NAMES = RLS_TENANT_TABLES.map((entry) => entry.tableName);
export const RLS_GLOBAL_EXCLUSION_NAMES = RLS_GLOBAL_TABLE_EXCLUSIONS.map(
  (entry) => entry.tableName,
);

// Hardcoded intentionally — if you add or remove a table from RLS_TENANT_TABLES,
// you MUST update this number. This makes validateRlsConfigInvariant() a real
// regression guard rather than a tautology.
//
// WHY NOT derive this dynamically from RLS_TENANT_TABLES.length?
// A dynamic check (expected === actual === length) would always pass trivially
// and would never catch accidental additions or removals — it would be comparing
// the array to itself. The hardcoded constant forces a human to consciously
// acknowledge the change, which is the entire point of the guard.
export const RLS_EXPECTED_TENANT_TABLE_COUNT = 21;

export type RlsTenantTableName = (typeof RLS_TENANT_TABLES)[number]['tableName'];
export type RlsGlobalExclusionName = (typeof RLS_GLOBAL_TABLE_EXCLUSIONS)[number]['tableName'];

export function validateRlsConfigInvariant(): string[] {
  const problems: string[] = [];

  if (RLS_TENANT_TABLE_NAMES.length !== RLS_EXPECTED_TENANT_TABLE_COUNT) {
    problems.push(
      `Expected ${RLS_EXPECTED_TENANT_TABLE_COUNT} tenant-scoped tables, found ${RLS_TENANT_TABLE_NAMES.length}`,
    );
  }

  const tenantSet = new Set<string>();
  for (const tableName of RLS_TENANT_TABLE_NAMES) {
    if (tenantSet.has(tableName)) {
      problems.push(`Duplicate tenant table entry: ${tableName}`);
    }
    tenantSet.add(tableName);
  }

  const globalSet = new Set<string>();
  for (const tableName of RLS_GLOBAL_EXCLUSION_NAMES) {
    if (globalSet.has(tableName)) {
      problems.push(`Duplicate global exclusion entry: ${tableName}`);
    }
    globalSet.add(tableName);
    if (tenantSet.has(tableName)) {
      problems.push(`Table appears in both tenant RLS list and global exclusions: ${tableName}`);
    }
  }

  return problems;
}

export function isTenantScopedRlsTable(tableName: string): tableName is RlsTenantTableName {
  return RLS_TENANT_TABLE_NAMES.includes(tableName as RlsTenantTableName);
}
