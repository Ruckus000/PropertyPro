/** demo_seed_registry: stable seed-key → entity-id bookkeeping that makes reseeds idempotent. */
import { and, eq, sql } from '../../filters';
import { demoSeedRegistry } from '../../schema';
import { db, extractRows } from './context';

let cachedRegistryAvailable: boolean | null = null;

async function hasRegistryTable(): Promise<boolean> {
  if (cachedRegistryAvailable !== null) {
    return cachedRegistryAvailable;
  }

  const result = await db.execute<{ exists: boolean }>(sql`
    select exists (
      select 1
      from information_schema.tables
      where table_schema = 'public' and table_name = 'demo_seed_registry'
    ) as exists
  `);
  const rows = extractRows<{ exists: boolean }>(result);
  cachedRegistryAvailable = rows[0]?.exists === true;
  return cachedRegistryAvailable;
}

/**
 * Registry keys are unique per (entity_type, seed_key) across ALL communities,
 * and some are not slug-prefixed (`apt-maint-*`), so the lookup must be scoped
 * to the community being seeded — otherwise seeding one community re-homes
 * another community's registered rows into it.
 */
export async function lookupRegistry(
  entityType: string,
  seedKey: string,
  communityId: number,
): Promise<string | null> {
  if (!(await hasRegistryTable())) {
    return null;
  }

  const rows = await db
    .select()
    .from(demoSeedRegistry)
    .where(
      and(
        eq(demoSeedRegistry.entityType, entityType),
        eq(demoSeedRegistry.seedKey, seedKey),
        eq(demoSeedRegistry.communityId, communityId),
      ),
    )
    .limit(1);
  return rows[0]?.entityId ?? null;
}

export async function upsertRegistryEntry(
  entityType: string,
  seedKey: string,
  entityId: string,
  communityId: number,
): Promise<void> {
  if (!(await hasRegistryTable())) {
    return;
  }

  await db.execute(sql`
    insert into demo_seed_registry (entity_type, seed_key, entity_id, community_id)
    values (${entityType}, ${seedKey}, ${entityId}, ${communityId})
    on conflict (entity_type, seed_key) do update
    set entity_id = excluded.entity_id,
        community_id = excluded.community_id
  `);
}
