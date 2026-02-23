/**
 * P4-55 RLS inventory and policy-family config.
 *
 * This file is the source of truth for policy coverage tests so new tenant-scoped
 * tables do not silently miss RLS rollout.
 */

export type RlsPolicyFamily =
  | 'tenant_crud'           // All 4 ops gated on community membership
  | 'tenant_append_only'    // SELECT + INSERT only; UPDATE/DELETE blocked at RLS level
  | 'tenant_admin_write'    // SELECT on membership; INSERT/UPDATE/DELETE require admin-tier role
  | 'service_only'          // All ops require pp_rls_is_privileged()
  | 'audit_log_restricted'; // SELECT requires admin-tier role; INSERT requires privilege

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
  { tableName: 'announcements', policyFamily: 'tenant_crud' },
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
  { tableName: 'document_categories', policyFamily: 'tenant_crud' },
  { tableName: 'documents', policyFamily: 'tenant_crud' },
  { tableName: 'invitations', policyFamily: 'tenant_crud' },
  { tableName: 'leases', policyFamily: 'tenant_crud' },
  {
    tableName: 'maintenance_comments',
    policyFamily: 'tenant_append_only',
    notes: 'Append-only: UPDATE/DELETE dropped at RLS level, consistent with scoped-client APPEND_ONLY_TABLES.',
  },
  { tableName: 'maintenance_requests', policyFamily: 'tenant_crud' },
  { tableName: 'meeting_documents', policyFamily: 'tenant_crud' },
  { tableName: 'meetings', policyFamily: 'tenant_crud' },
  { tableName: 'notification_digest_queue', policyFamily: 'service_only' },
  { tableName: 'notification_preferences', policyFamily: 'tenant_crud' },
  { tableName: 'onboarding_wizard_state', policyFamily: 'tenant_crud' },
  { tableName: 'provisioning_jobs', policyFamily: 'service_only' },
  { tableName: 'units', policyFamily: 'tenant_crud' },
  {
    tableName: 'user_roles',
    policyFamily: 'tenant_admin_write',
    notes: 'INSERT/UPDATE/DELETE require admin-tier role (pp_rls_can_read_audit_log). SELECT uses community membership. No recursion risk: pp_rls_has_community_membership is SECURITY DEFINER.',
  },
] as const satisfies readonly RlsTenantTableConfig[];

export const RLS_GLOBAL_TABLE_EXCLUSIONS = [
  { tableName: 'communities', reason: 'Global tenant registry (no community_id column)' },
  { tableName: 'users', reason: 'Global identity mirror (no community_id column)' },
  { tableName: 'pending_signups', reason: 'Pre-provisioning flow, not community-scoped yet' },
  { tableName: 'stripe_webhook_events', reason: 'Global billing webhook log' },
] as const satisfies readonly RlsGlobalTableExclusion[];

export const RLS_TENANT_TABLE_NAMES = RLS_TENANT_TABLES.map((entry) => entry.tableName);
export const RLS_GLOBAL_EXCLUSION_NAMES = RLS_GLOBAL_TABLE_EXCLUSIONS.map(
  (entry) => entry.tableName,
);

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
