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
import { eq, sql } from '@propertypro/db/filters';
import { communities } from '@propertypro/db';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { DEMO_COMMUNITIES, DEMO_USERS } from './config/demo-data';
import { runDemoSeed } from './seed-demo';

const db = createUnscopedClient();

/**
 * FK-safe deletion order for the 21 tenant-scoped tables.
 * Children before parents to avoid RESTRICT constraint violations.
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

async function resolveDemoCommunityIds(): Promise<number[]> {
  const slugs = DEMO_COMMUNITIES.map((c) => c.slug);
  const rows = await db
    .select({ id: communities.id, slug: communities.slug })
    .from(communities)
    .where(sql`${communities.slug} IN (${sql.join(slugs.map((s) => sql`${s}`), sql`, `)})`);

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

    const count = typeof result === 'object' && result !== null && 'rowCount' in result
      ? (result.rowCount as number) ?? 0
      : 0;

    stats.push({ table, deleted: count });
  }

  return stats;
}

async function deleteDemoUsers(): Promise<number> {
  const emails = DEMO_USERS.map((u) => u.email.toLowerCase());
  const emailList = sql.join(emails.map((e) => sql`${e}`), sql`, `);

  const result = await db.execute(sql`
    DELETE FROM users WHERE email IN (${emailList})
  `);

  return typeof result === 'object' && result !== null && 'rowCount' in result
    ? (result.rowCount as number) ?? 0
    : 0;
}

export async function runDemoReset(): Promise<void> {
  const startTime = Date.now();
  // eslint-disable-next-line no-console
  console.log('[reset-demo] Starting demo reset...');

  // Step 1: Resolve demo community IDs
  const communityIds = await resolveDemoCommunityIds();
  // eslint-disable-next-line no-console
  console.log(`[reset-demo] Found ${communityIds.length} demo communities (IDs: ${communityIds.join(', ') || 'none'})`);

  // Step 2: Delete all tenant-scoped data for demo communities
  if (communityIds.length > 0) {
    const stats = await deleteTenantData(communityIds);
    const totalDeleted = stats.reduce((sum, s) => sum + s.deleted, 0);
    // eslint-disable-next-line no-console
    console.log(`[reset-demo] Deleted ${totalDeleted} rows across ${stats.length} tables`);
    for (const s of stats) {
      if (s.deleted > 0) {
        // eslint-disable-next-line no-console
        console.log(`[reset-demo]   ${s.table}: ${s.deleted} rows`);
      }
    }

    // Step 3: Delete demo community rows themselves
    const communityIdList = sql.join(communityIds.map((id) => sql`${id}`), sql`, `);
    await db.execute(sql`DELETE FROM communities WHERE id IN (${communityIdList})`);
    // eslint-disable-next-line no-console
    console.log(`[reset-demo] Deleted ${communityIds.length} demo community rows`);
  }

  // Step 4: Delete demo users
  const usersDeleted = await deleteDemoUsers();
  // eslint-disable-next-line no-console
  console.log(`[reset-demo] Deleted ${usersDeleted} demo user rows`);

  // Step 5: Re-seed
  // eslint-disable-next-line no-console
  console.log('[reset-demo] Re-seeding demo data...');
  await runDemoSeed();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  // eslint-disable-next-line no-console
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
    // eslint-disable-next-line no-console
    console.error('[reset-demo] Reset failed:', error);
    process.exitCode = 1;
  });
}
