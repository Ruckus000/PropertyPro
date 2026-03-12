import { pathToFileURL } from 'node:url';
import {
  communities,
  complianceChecklistItems,
} from '@propertypro/db';
import {
  and,
  eq,
  inArray,
  isNull,
} from '@propertypro/db/filters';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import {
  getComplianceTemplate,
  type CommunityType,
} from '@propertypro/shared';

const db = createUnscopedClient();

function calculatePostingDeadline(sourceDate: Date, days: number): Date {
  const deadline = new Date(sourceDate);
  deadline.setUTCDate(deadline.getUTCDate() + days);

  const weekday = deadline.getUTCDay();
  if (weekday === 6) {
    deadline.setUTCDate(deadline.getUTCDate() + 2);
  } else if (weekday === 0) {
    deadline.setUTCDate(deadline.getUTCDate() + 1);
  }

  return deadline;
}

async function backfillCommunity(
  communityId: number,
  communityType: CommunityType,
): Promise<{ inserted: number; updated: number }> {
  const template = getComplianceTemplate(communityType);
  if (template.length === 0) {
    return { inserted: 0, updated: 0 };
  }

  return db.transaction(async (tx) => {
    const existingRows = await tx
      .select({
        id: complianceChecklistItems.id,
        templateKey: complianceChecklistItems.templateKey,
        title: complianceChecklistItems.title,
        description: complianceChecklistItems.description,
        category: complianceChecklistItems.category,
        statuteReference: complianceChecklistItems.statuteReference,
        isConditional: complianceChecklistItems.isConditional,
      })
      .from(complianceChecklistItems)
      .where(
        and(
          eq(complianceChecklistItems.communityId, communityId),
          isNull(complianceChecklistItems.deletedAt),
        ),
      );

    const existingByKey = new Map(existingRows.map((row) => [row.templateKey, row]));
    const now = new Date();
    const inserts: Array<typeof complianceChecklistItems.$inferInsert> = [];
    let updated = 0;

    for (const item of template) {
      const existing = existingByKey.get(item.templateKey);
      if (!existing) {
        inserts.push({
          communityId,
          templateKey: item.templateKey,
          title: item.title,
          description: item.description,
          category: item.category,
          statuteReference: item.statuteReference,
          deadline: item.deadlineDays ? calculatePostingDeadline(now, item.deadlineDays) : null,
          rollingWindow: item.rollingMonths ? { months: item.rollingMonths } : null,
          isConditional: item.isConditional ?? false,
          documentId: null,
          documentPostedAt: null,
          lastModifiedBy: null,
        });
        continue;
      }

      const shouldUpdate =
        existing.title !== item.title
        || (existing.description ?? null) !== (item.description ?? null)
        || existing.category !== item.category
        || (existing.statuteReference ?? null) !== (item.statuteReference ?? null)
        || existing.isConditional !== (item.isConditional ?? false);

      if (!shouldUpdate) {
        continue;
      }

      await tx
        .update(complianceChecklistItems)
        .set({
          title: item.title,
          description: item.description,
          category: item.category,
          statuteReference: item.statuteReference,
          isConditional: item.isConditional ?? false,
          updatedAt: new Date(),
        })
        .where(eq(complianceChecklistItems.id, existing.id));

      updated += 1;
    }

    if (inserts.length > 0) {
      await tx.insert(complianceChecklistItems).values(inserts);
    }

    return {
      inserted: inserts.length,
      updated,
    };
  });
}

export async function runBackfill(): Promise<void> {
  const targetTypes: CommunityType[] = ['condo_718', 'hoa_720'];

  const targetCommunities = await db
    .select({
      id: communities.id,
      name: communities.name,
      slug: communities.slug,
      communityType: communities.communityType,
    })
    .from(communities)
    .where(
      and(
        inArray(communities.communityType, targetTypes),
        isNull(communities.deletedAt),
      ),
    );

  let totalInserted = 0;
  let totalUpdated = 0;

  for (const community of targetCommunities) {
    const result = await backfillCommunity(community.id, community.communityType);
    totalInserted += result.inserted;
    totalUpdated += result.updated;

    // eslint-disable-next-line no-console
    console.log(
      `[backfill] ${community.slug} (${community.communityType}) inserted=${result.inserted} updated=${result.updated}`,
    );
  }

  // eslint-disable-next-line no-console
  console.log(
    `[backfill] done communities=${targetCommunities.length} inserted=${totalInserted} updated=${totalUpdated}`,
  );
}

async function main(): Promise<void> {
  await runBackfill();
}

const isEntrypoint = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isEntrypoint) {
  main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error('[backfill] failed:', error);
    process.exitCode = 1;
  });
}
