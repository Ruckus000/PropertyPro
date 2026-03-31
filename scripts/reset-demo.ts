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
import { closeUnscopedClient, createUnscopedClient } from '@propertypro/db/unsafe';
import { DEMO_COMMUNITIES } from './config/demo-data';
import { runDemoSeed } from './seed-demo';

const db = createUnscopedClient();

/**
 * FK-safe deletion order for the demo-owned tables that the seed depends on.
 * This intentionally does not try to vacuum every tenant table in the product:
 * demo reset now preserves communities, users, and append-only audit rows, then
 * re-normalizes the mutable demo data that must be reseeded.
 *
 * IMPORTANT: Keep documents before categories, leases before units, and child
 * tables before parents so reset stays deterministic under dirty DB state.
 */
const DEMO_RESET_TABLE_DELETION_ORDER = [
  // Phase 1 — leaf tables
  'announcement_delivery_log',
  'assessment_line_items',
  'contract_bids',
  'emergency_broadcast_recipients',
  'esign_events',
  'esign_signers',
  'maintenance_comments',
  'meeting_documents',
  'notification_digest_queue',
  'violation_fines',

  // Phase 2 — parent tables
  'emergency_broadcasts',
  'esign_consent',
  'esign_submissions',
  'leases', // self-ref FK nulled before delete
  'maintenance_requests',
  'notification_preferences',
  'user_roles',
  'invitations',
  'violations',
  'assessments',
  'esign_templates',
  'compliance_checklist_items',
  'announcements',
  'documents',
  'document_categories',
  'meetings',
  'units',
  'onboarding_wizard_state',
  'provisioning_jobs',

  // Phase 3 — standalone metadata
  'demo_seed_registry',
] as const;

const APPEND_ONLY_TABLES = ['compliance_audit_log'] as const;

interface ResetStats {
  table: string;
  deleted: number;
}

interface DemoResetOptions {
  syncAuthUsers?: boolean;
}

function extractRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) {
    return result as T[];
  }

  if (typeof result === 'object' && result !== null && 'rows' in result) {
    const rows = (result as { rows?: unknown }).rows;
    return Array.isArray(rows) ? (rows as T[]) : [];
  }

  return [];
}

async function resolveExistingResetTables(): Promise<string[]> {
  const expectedTables = [...DEMO_RESET_TABLE_DELETION_ORDER, ...APPEND_ONLY_TABLES];
  const rows = await db.execute(sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (${sql.join(expectedTables.map((table) => sql`${table}`), sql`, `)})
    ORDER BY table_name
  `);

  const existingTables = new Set(extractRows<{ table_name: string }>(rows).map((row) => row.table_name));
  const missing = expectedTables.filter((table) => !existingTables.has(table));

  if (missing.length > 0) {
    console.warn(`[reset-demo] Skipping missing reset tables: ${missing.join(', ')}`);
  }

  return DEMO_RESET_TABLE_DELETION_ORDER.filter((table) => existingTables.has(table));
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

async function countRowsByCommunity(table: string, communityIds: number[]): Promise<number> {
  const idList = sql.join(communityIds.map((id) => sql`${id}`), sql`, `);
  const result = await db.execute<{ count: number | string }>(sql`
    SELECT COUNT(*)::int AS count
    FROM ${sql.identifier(table)}
    WHERE community_id IN (${idList})
  `);

  const rows = extractRows<{ count: number | string }>(result);
  return Number(rows[0]?.count ?? 0);
}

async function deleteTenantData(
  communityIds: number[],
  tables: string[],
): Promise<ResetStats[]> {
  if (communityIds.length === 0) {
    return [];
  }

  const stats: ResetStats[] = [];
  const idList = sql.join(communityIds.map((id) => sql`${id}`), sql`, `);

  // Null out self-referential FK on leases before deleting
  if (tables.includes('leases')) {
    await db.execute(sql`
      UPDATE leases SET previous_lease_id = NULL
      WHERE community_id IN (${idList}) AND previous_lease_id IS NOT NULL
    `);
  }

  for (const table of tables) {
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

async function countAppendOnlyRows(communityIds: number[]): Promise<number> {
  if (communityIds.length === 0) {
    return 0;
  }

  const rows = await db.execute(sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ${APPEND_ONLY_TABLES[0]}
  `);
  const tableExists = extractRows<{ table_name: string }>(rows).length > 0;
  if (!tableExists) {
    return 0;
  }

  return countRowsByCommunity(APPEND_ONLY_TABLES[0], communityIds);
}

async function collectResiduals(
  communityIds: number[],
  tables: string[],
): Promise<ResetStats[]> {
  const residuals: ResetStats[] = [];

  for (const table of tables) {
    residuals.push({
      table,
      deleted: await countRowsByCommunity(table, communityIds),
    });
  }

  return residuals.filter((entry) => entry.deleted > 0);
}

async function deleteTenantDataUntilClean(
  communityIds: number[],
  tables: string[],
): Promise<ResetStats[]> {
  const combined = new Map<string, number>();

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const stats = await deleteTenantData(communityIds, tables);
    for (const stat of stats) {
      combined.set(stat.table, (combined.get(stat.table) ?? 0) + stat.deleted);
    }

    const residuals = await collectResiduals(communityIds, tables);
    if (residuals.length === 0) {
      return tables.map((table) => ({ table, deleted: combined.get(table) ?? 0 }));
    }

    if (attempt < 2) {
      console.warn(
        `[reset-demo] Residual demo rows remain after cleanup pass ${attempt}; retrying targeted delete (${residuals
          .map((entry) => `${entry.table}=${entry.deleted}`)
          .join(', ')})`,
      );
    } else {
      throw new Error(
        `[reset-demo] Residual demo rows remain after cleanup: ${residuals
          .map((entry) => `${entry.table}=${entry.deleted}`)
          .join(', ')}`,
      );
    }
  }

  return tables.map((table) => ({ table, deleted: combined.get(table) ?? 0 }));
}

export async function runDemoReset(options: DemoResetOptions = {}): Promise<void> {
  const startTime = Date.now();
  const syncAuthUsers = options.syncAuthUsers ?? false;
  console.log('[reset-demo] Starting demo reset...');

  const resetTables = await resolveExistingResetTables();

  const communityIds = await resolveDemoCommunityIds();
  console.log(`[reset-demo] Found ${communityIds.length} demo communities (IDs: ${communityIds.join(', ') || 'none'})`);

  if (communityIds.length > 0) {
    const appendOnlyRows = await countAppendOnlyRows(communityIds);
    if (appendOnlyRows > 0) {
      console.log(
        `[reset-demo] Preserving ${appendOnlyRows} append-only compliance audit row(s) and keeping demo communities/users in place`,
      );
    }

    const stats = await deleteTenantDataUntilClean(communityIds, resetTables);
    const totalDeleted = stats.reduce((sum, s) => sum + s.deleted, 0);
    console.log(`[reset-demo] Deleted ${totalDeleted} rows across ${stats.length} tables`);
    for (const s of stats) {
      if (s.deleted > 0) {
        console.log(`[reset-demo]   ${s.table}: ${s.deleted} rows`);
      }
    }
  }

  console.log('[reset-demo] Re-seeding demo data...');
  await runDemoSeed({ syncAuthUsers });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[reset-demo] Reset complete in ${elapsed}s`);
}

async function main(): Promise<void> {
  try {
    await runDemoReset({ syncAuthUsers: true });
  } finally {
    await closeUnscopedClient();
  }
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
