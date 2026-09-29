/** Registry-tracked seeded announcements. */
import { and, eq } from '../../filters';
import { announcements } from '../../schema';
import { db } from './context';
import { lookupRegistry, upsertRegistryEntry } from './registry';

export async function seedRegistryAnnouncement(
  communityId: number,
  seedKey: string,
  title: string,
  body: string,
  publishedBy: string,
  audience: string = 'all',
  isPinned = false,
): Promise<number> {
  const registryEntityId = await lookupRegistry('announcement', seedKey, communityId);
  if (registryEntityId) {
    const id = Number(registryEntityId);
    const [updated] = await db
      .update(announcements)
      .set({
        title,
        body,
        publishedBy,
        audience,
        isPinned,
        archivedAt: null,
        deletedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(announcements.id, id))
      .returning();
    if (updated) return updated.id;
  }

  const existing = await db
    .select({ id: announcements.id })
    .from(announcements)
    .where(and(eq(announcements.communityId, communityId), eq(announcements.title, title)))
    .limit(1);

  if (existing[0]) {
    const [updated] = await db
      .update(announcements)
      .set({
        title,
        body,
        publishedBy,
        audience,
        isPinned,
        archivedAt: null,
        deletedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(announcements.id, existing[0].id))
      .returning();
    if (updated) {
      await upsertRegistryEntry('announcement', seedKey, String(updated.id), communityId);
      return updated.id;
    }
  }

  const [created] = await db
    .insert(announcements)
    .values({
      communityId,
      title,
      body,
      publishedBy,
      audience,
      isPinned,
    })
    .returning();

  await upsertRegistryEntry('announcement', seedKey, String(created!.id), communityId);
  return created!.id;
}
