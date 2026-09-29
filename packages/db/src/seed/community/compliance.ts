/** Compliance checklist rows from the community type's statutory template. */
import { eq } from '../../filters';
import { complianceChecklistItems } from '../../schema';
import { calculatePostingDeadline, getComplianceTemplate } from '@propertypro/shared';
import { db } from './context';

export async function seedCommunityCompliance(
  communityId: number,
  communityType: 'condo_718' | 'hoa_720' | 'apartment',
): Promise<void> {
  const template = getComplianceTemplate(communityType);
  if (template.length === 0) {
    await db
      .delete(complianceChecklistItems)
      .where(eq(complianceChecklistItems.communityId, communityId));
    return;
  }

  const existingRows = await db
    .select({
      id: complianceChecklistItems.id,
      templateKey: complianceChecklistItems.templateKey,
      title: complianceChecklistItems.title,
      description: complianceChecklistItems.description,
      category: complianceChecklistItems.category,
      statuteReference: complianceChecklistItems.statuteReference,
      isConditional: complianceChecklistItems.isConditional,
      deadline: complianceChecklistItems.deadline,
      rollingWindow: complianceChecklistItems.rollingWindow,
    })
    .from(complianceChecklistItems)
    .where(eq(complianceChecklistItems.communityId, communityId));
  const existingByKey = new Map(existingRows.map((row) => [row.templateKey, row]));
  const inserts: Array<typeof complianceChecklistItems.$inferInsert> = [];
  const now = new Date();

  for (const item of template) {
    const existing = existingByKey.get(item.templateKey);
    const deadline = item.deadlineDays ? calculatePostingDeadline(now, item.deadlineDays) : null;
    const rollingWindow = item.rollingMonths ? { months: item.rollingMonths } : null;

    if (!existing) {
      inserts.push({
        communityId,
        templateKey: item.templateKey,
        title: item.title,
        description: item.description,
        category: item.category,
        statuteReference: item.statuteReference,
        deadline,
        rollingWindow,
        isConditional: item.isConditional ?? false,
        documentId: null,
        documentPostedAt: null,
        lastModifiedBy: null,
      });
      continue;
    }

    const changed = existing.title !== item.title
      || existing.description !== item.description
      || existing.category !== item.category
      || (existing.statuteReference ?? null) !== (item.statuteReference ?? null)
      || existing.isConditional !== (item.isConditional ?? false)
      || (existing.deadline == null && deadline != null)
      || ((existing.rollingWindow as { months?: number } | null)?.months ?? null) !== (rollingWindow?.months ?? null);
    if (!changed) {
      continue;
    }

    await db
      .update(complianceChecklistItems)
      .set({
        title: item.title,
        description: item.description,
        category: item.category,
        statuteReference: item.statuteReference,
        deadline: existing.deadline ?? deadline,
        rollingWindow,
        isConditional: item.isConditional ?? false,
        updatedAt: new Date(),
      })
      .where(eq(complianceChecklistItems.id, existing.id));
  }

  if (inserts.length > 0) {
    await db.insert(complianceChecklistItems).values(inserts);
  }
}
