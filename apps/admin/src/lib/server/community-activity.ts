/**
 * Recent platform-admin activity for one community — feeds the client
 * workspace's Overview tab (Task 17a).
 *
 * Reads `platform_admin_audit_log`, the append-only trail every privileged
 * admin mutation writes via `logAdminAction()` (`lib/audit/log-admin-action.ts`).
 * That table is NOT part of `AdminDatabase` (see
 * `packages/db/src/supabase/admin-types.ts`), so this uses the untyped
 * `createAdminClient()` rather than `createAdminTypedClient()` — the typed
 * client has no row type for it and would fail to compile.
 *
 * Deliberately its own file rather than added to `lib/server/clients.ts`:
 * that file is owned by the Clients-grid slice (2a), and this one ships in
 * the same wave from a disjoint file.
 */
import { createAdminClient } from '@propertypro/db/supabase/admin';

/** How many rows the Overview tab's Recent Activity list shows. */
const ACTIVITY_LIMIT = 8;

export interface CommunityActivityEntry {
  id: number;
  action: string;
  resourceType: string;
  resourceId: string | null;
  /** Denormalized on the audit row; null for a long-gone admin account. */
  adminEmail: string | null;
  createdAt: string;
}

interface ActivityRow {
  id: number;
  action: string;
  resource_type: string;
  resource_id: string | null;
  admin_email: string | null;
  created_at: string;
}

export async function getCommunityActivity(communityId: number): Promise<CommunityActivityEntry[]> {
  const db = createAdminClient();

  const { data, error } = await db
    .from('platform_admin_audit_log')
    .select('id, action, resource_type, resource_id, admin_email, created_at')
    .eq('community_id', communityId)
    .order('created_at', { ascending: false })
    .limit(ACTIVITY_LIMIT);

  if (error) {
    throw new Error(`Failed to load community activity: ${error.message}`);
  }

  return ((data ?? []) as ActivityRow[]).map((row) => ({
    id: row.id,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    adminEmail: row.admin_email,
    createdAt: row.created_at,
  }));
}
