import { createScopedClient, demoSeedRegistry, type Announcement, type Community } from '@propertypro/db';
import { and, eq } from '@propertypro/db/filters';

function hasDemoLineage(community: Pick<Community, 'isDemo' | 'trialEndsAt' | 'demoExpiresAt'>): boolean {
  return Boolean(community.isDemo || community.trialEndsAt || community.demoExpiresAt);
}

async function listSeededAnnouncementIds(communityId: number): Promise<Set<number> | null> {
  try {
    const scoped = createScopedClient(communityId);
    const rows = await scoped.selectFrom<{ entityId: string }>(
      demoSeedRegistry,
      { entityId: demoSeedRegistry.entityId },
      and(
        eq(demoSeedRegistry.communityId, communityId),
        eq(demoSeedRegistry.entityType, 'announcement'),
      ),
    );

    const ids = rows
      .map((row) => Number(row.entityId))
      .filter((value) => Number.isInteger(value) && value > 0);
    return new Set(ids);
  } catch {
    return null;
  }
}

export async function applyDemoAnnouncementProvenancePolicy(
  community: Pick<Community, 'id' | 'isDemo' | 'trialEndsAt' | 'demoExpiresAt'>,
  rows: Announcement[],
): Promise<Announcement[]> {
  if (!hasDemoLineage(community)) {
    return rows;
  }

  const seededIds = await listSeededAnnouncementIds(community.id);

  // Guardrail is intentionally fail-closed for demo-lineage communities.
  if (seededIds == null || seededIds.size === 0) {
    return [];
  }

  return rows.filter((row) => !seededIds.has(row.id));
}
