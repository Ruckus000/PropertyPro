/** Registry-tracked seeded meetings and their document attachment. */
import { and, eq } from '../../filters';
import { meetingDocuments, meetings } from '../../schema';
import { db } from './context';
import { lookupRegistry, upsertRegistryEntry } from './registry';

export async function seedRegistryMeeting(
  communityId: number,
  seedKey: string,
  title: string,
  meetingType: string,
  startsAt: Date,
  location: string,
): Promise<number> {
  const registryEntityId = await lookupRegistry('meeting', seedKey, communityId);
  if (registryEntityId) {
    const id = Number(registryEntityId);
    const [updated] = await db
      .update(meetings)
      .set({
        title,
        meetingType,
        startsAt,
        location,
        deletedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(meetings.id, id))
      .returning();
    if (updated) return updated.id;
  }

  const existing = await db
    .select({ id: meetings.id })
    .from(meetings)
    .where(and(eq(meetings.communityId, communityId), eq(meetings.title, title)))
    .limit(1);

  if (existing[0]) {
    const [updated] = await db
      .update(meetings)
      .set({
        title,
        meetingType,
        startsAt,
        location,
        deletedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(meetings.id, existing[0].id))
      .returning();
    if (updated) {
      await upsertRegistryEntry('meeting', seedKey, String(updated.id), communityId);
      return updated.id;
    }
  }

  const [created] = await db
    .insert(meetings)
    .values({
      communityId,
      title,
      meetingType,
      startsAt,
      location,
    })
    .returning();

  await upsertRegistryEntry('meeting', seedKey, String(created!.id), communityId);
  return created!.id;
}

export async function attachMeetingDocument(
  communityId: number,
  meetingId: number,
  documentId: number,
  attachedBy: string,
): Promise<void> {
  const existing = await db
    .select()
    .from(meetingDocuments)
    .where(
      and(
        eq(meetingDocuments.meetingId, meetingId),
        eq(meetingDocuments.documentId, documentId),
      ),
    )
    .limit(1);

  if (existing[0]) {
    return;
  }

  await db.insert(meetingDocuments).values({
    meetingId,
    documentId,
    attachedBy,
    communityId,
  });
}
