/* eslint-disable no-console -- CLI script; console output is intentional */

/**
 * P4-61 Demo Reset Script
 *
 * Deletes all data in demo communities and re-seeds from scratch.
 * Uses service-role access (bypasses RLS). Idempotent — safe to run repeatedly.
 *
 * Usage:
 *   pnpm reset:demo
 *   # or with env wrapper:
 *   scripts/with-env-local.sh pnpm reset:demo
 */
import { pathToFileURL } from 'node:url';
import { inArray, sql } from '@propertypro/db/filters';
import { communities } from '@propertypro/db';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { DEMO_COMMUNITIES, DEMO_USERS } from './config/demo-data';
import { runDemoSeed } from './seed-demo';

const db = createUnscopedClient();

/**
 * FK-safe deletion order for the 21 tenant-scoped tables.
 * Children before parents to avoid RESTRICT constraint violations.
 *
 * IMPORTANT: Keep in sync with packages/db/src/schema/. When adding a new
 * tenant-scoped table (one with a community_id column), add it here in the
 * correct position so its children are deleted before it.
 */
const TENANT_TABLE_DELETION_ORDER = [
  // Phase 1 — leaf tables (no children depend on them)
  'announcement_delivery_log',
  'contract_bids',
  'maintenance_comments',
  'meeting_documents',

  // Phase 2 — mid-level tables with children already deleted above
  'notification_digest_queue',
  'notification_preferences',
  'user_roles',
  'invitations',
  'leases',                     // self-ref FK nulled before delete
  'maintenance_requests',
  'onboarding_wizard_state',
  'provisioning_jobs',

  // Phase 3 — content tables
  'contracts',
  'compliance_checklist_items',
  'compliance_audit_log',
  'announcements',
  'documents',
  'document_categories',
  'meetings',
  'units',

  // Phase 4 — registry (standalone)
  'demo_seed_registry',
] as const;

interface ResetStats {
  table: string;
  deleted: number;
}

/**
 * Validates that TENANT_TABLE_DELETION_ORDER covers all tenant-scoped tables
 * (tables with a community_id column) in the current database schema. Throws
 * if a table with community_id exists but is missing from the deletion list,
 * preventing silent data leaks after schema changes.
 */
async function validateDeletionOrder(): Promise<void> {
  const rows = await db.execute(sql`
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'community_id'
      AND table_name != 'communities'
    ORDER BY table_name
  `);

  const dbTables = new Set((rows as unknown as { table_name: string }[]).map((r) => r.table_name));
  const listed = new Set<string>(TENANT_TABLE_DELETION_ORDER);

  const missing = [...dbTables].filter((t) => !listed.has(t));
  const stale = [...listed].filter((t) => !dbTables.has(t));

  if (missing.length > 0 || stale.length > 0) {
    const parts: string[] = [];
    if (missing.length > 0) {
      parts.push(`Tables with community_id missing from TENANT_TABLE_DELETION_ORDER: ${missing.join(', ')}`);
    }
    if (stale.length > 0) {
      parts.push(`Tables in TENANT_TABLE_DELETION_ORDER but not in DB: ${stale.join(', ')}`);
    }
    throw new Error(`[reset-demo] Deletion order out of sync with schema.\n${parts.join('\n')}`);
  }
}

async function resolveDemoCommunityIds(): Promise<number[]> {
  const slugs = DEMO_COMMUNITIES.map((c) => c.slug);
  if (slugs.length === 0) {
    return [];
  }
  const rows = await db
    .select({ id: communities.id })
    .from(communities)
    .where(inArray(communities.slug, slugs));

  return rows.map((r) => r.id);
}

async function deleteTenantData(communityIds: number[]): Promise<ResetStats[]> {
  if (communityIds.length === 0) {
    return [];
  }

  const stats: ResetStats[] = [];
  const idList = sql.join(communityIds.map((id) => sql`${id}`), sql`, `);

  // Null out self-referential FK on leases before deleting
  await db.execute(sql`
    UPDATE leases SET previous_lease_id = NULL
    WHERE community_id IN (${idList}) AND previous_lease_id IS NOT NULL
  `);

  for (const table of TENANT_TABLE_DELETION_ORDER) {
    const result = await db.execute(sql`
      DELETE FROM ${sql.identifier(table)}
      WHERE community_id IN (${idList})
    `);

    // postgres-js uses .count for affected rows, not .rowCount
    const count = (result as unknown as { count: number | null }).count ?? 0;

    stats.push({ table, deleted: count });
  }

  return stats;
}

async function deleteSupabaseAuthUsers(): Promise<number> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.log('[reset-demo] Supabase credentials not configured — skipping auth user cleanup');
    return 0;
  }

  const admin = createAdminClient();
  const demoEmails = new Set(DEMO_USERS.map((u) => u.email.toLowerCase()));
  let deleted = 0;
  let page = 1;
  const perPage = 200;

  // Collect target user IDs first, then delete — avoids pagination shift
  // when deleting users while paginating through the list.
  const toDelete: { id: string; email: string }[] = [];

  while (true) {
    const listed = await admin.auth.admin.listUsers({ page, perPage });
    if (listed.error) {
      console.warn('[reset-demo] Failed to list auth users:', listed.error.message);
      break;
    }

    for (const authUser of listed.data.users) {
      if (authUser.email && demoEmails.has(authUser.email.toLowerCase())) {
        toDelete.push({ id: authUser.id, email: authUser.email });
      }
    }

    if (listed.data.users.length < perPage) break;
    page++;
  }

  for (const { id, email } of toDelete) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) {
      console.warn(`[reset-demo] Failed to delete auth user ${email}:`, error.message);
    } else {
      deleted++;
    }
  }

  return deleted;
}

async function deleteDemoUsers(): Promise<number> {
  const emails = DEMO_USERS.map((u) => u.email.toLowerCase());
  const emailList = sql.join(emails.map((e) => sql`${e}`), sql`, `);

  const result = await db.execute(sql`
    DELETE FROM users WHERE email IN (${emailList})
  `);

  // postgres-js uses .count for affected rows, not .rowCount
  return (result as unknown as { count: number | null }).count ?? 0;
}

export async function runDemoReset(): Promise<void> {
  const startTime = Date.now();
  console.log('[reset-demo] Starting demo reset...');

  // Step 0: Validate deletion order against live schema
  await validateDeletionOrder();

  // Step 1: Resolve demo community IDs
  const communityIds = await resolveDemoCommunityIds();
  console.log(`[reset-demo] Found ${communityIds.length} demo communities (IDs: ${communityIds.join(', ') || 'none'})`);

  // Step 2: Delete all tenant-scoped data for demo communities
  if (communityIds.length > 0) {
    const stats = await deleteTenantData(communityIds);
    const totalDeleted = stats.reduce((sum, s) => sum + s.deleted, 0);
    console.log(`[reset-demo] Deleted ${totalDeleted} rows across ${stats.length} tables`);
    for (const s of stats) {
      if (s.deleted > 0) {
        console.log(`[reset-demo]   ${s.table}: ${s.deleted} rows`);
      }
    }

    // Step 3: Delete demo community rows themselves
    const communityIdList = sql.join(communityIds.map((id) => sql`${id}`), sql`, `);
    await db.execute(sql`DELETE FROM communities WHERE id IN (${communityIdList})`);
    console.log(`[reset-demo] Deleted ${communityIds.length} demo community rows`);
  }

  // Step 4: Delete Supabase Auth users (before DB users to avoid orphans)
  const authUsersDeleted = await deleteSupabaseAuthUsers();
  console.log(`[reset-demo] Deleted ${authUsersDeleted} Supabase Auth user(s)`);

  // Step 5: Delete demo users from DB
  const usersDeleted = await deleteDemoUsers();
  console.log(`[reset-demo] Deleted ${usersDeleted} demo user rows`);

  // Step 6: Re-seed
  console.log('[reset-demo] Re-seeding demo data...');
  await runDemoSeed();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[reset-demo] Reset complete in ${elapsed}s`);
}

async function main(): Promise<void> {
  await runDemoReset();
}

const isEntrypoint = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isEntrypoint) {
  main().catch((error) => {
    console.error('[reset-demo] Reset failed:', error);
    process.exitCode = 1;
  });
}
