#!/usr/bin/env tsx

import { and, eq, inArray, isNull } from 'drizzle-orm';
import { documentCategories, documents, violations } from '@propertypro/db';
import { closeUnscopedClient, createUnscopedClient } from '@propertypro/db/unsafe';
import {
  normalizeCategoryName,
  type KnownDocumentCategoryKey,
} from '@propertypro/shared';

const db = createUnscopedClient();

const CATEGORY_INFERENCE_RULES: Array<{
  key: KnownDocumentCategoryKey;
  patterns: RegExp[];
}> = [
  {
    key: 'declaration',
    patterns: [/\bdeclaration\b/i, /\bbylaws?\b/i, /\barticles?\b/i, /\bgoverning\b/i],
  },
  {
    key: 'rules',
    patterns: [/\brules?\b/i, /\bregulations?\b/i, /\bpolicy\b/i],
  },
  {
    key: 'inspection_reports',
    patterns: [/\binspection\b/i, /\bmilestone\b/i, /\bsafety\b/i, /\bengineering\b/i],
  },
  {
    key: 'meeting_minutes',
    patterns: [/\bminutes?\b/i, /\bmeeting\b/i, /\bagenda\b/i],
  },
  {
    key: 'announcements',
    patterns: [/\bannouncement\b/i, /\bnotice\b/i, /\bnewsletter\b/i, /\bcorrespondence\b/i, /\bcommunication\b/i],
  },
  {
    key: 'maintenance_records',
    patterns: [/\bmaintenance\b/i, /\bwork[-_\s]?order\b/i, /\brepair\b/i, /\bservice\b/i],
  },
  {
    key: 'lease_docs',
    patterns: [/\blease\b/i, /\baddendum\b/i, /\btenant\b/i],
  },
  {
    key: 'community_handbook',
    patterns: [/\bhandbook\b/i, /\bresident guide\b/i, /\bcommunity guide\b/i],
  },
  {
    key: 'move_in_out_docs',
    patterns: [/\bmove[-_\s]?in\b/i, /\bmove[-_\s]?out\b/i, /\bmoving\b/i],
  },
];

type UncategorizedLibraryDocument = {
  id: number;
  communityId: number;
  title: string;
  fileName: string;
};

function inferCategoryKeys(document: UncategorizedLibraryDocument): KnownDocumentCategoryKey[] {
  const haystack = `${document.title} ${document.fileName}`;
  return CATEGORY_INFERENCE_RULES
    .filter((rule) => rule.patterns.some((pattern) => pattern.test(haystack)))
    .map((rule) => rule.key);
}

async function backfillViolationEvidenceSourceType(): Promise<number> {
  const rows = await db.select({
    evidenceDocumentIds: violations.evidenceDocumentIds,
  }).from(violations);

  const evidenceIds = Array.from(
    new Set(
      rows.flatMap((row) => Array.isArray(row.evidenceDocumentIds) ? row.evidenceDocumentIds : []),
    ),
  );

  if (evidenceIds.length === 0) {
    return 0;
  }

  const updated = await db
    .update(documents)
    .set({ sourceType: 'violation_evidence' })
    .where(inArray(documents.id, evidenceIds))
    .returning({ id: documents.id });

  return updated.length;
}

async function backfillUncategorizedLibraryDocuments(): Promise<{
  updatedCount: number;
  unresolved: Array<Record<string, unknown>>;
}> {
  const [libraryDocs, categoryRows] = await Promise.all([
    db
      .select({
        id: documents.id,
        communityId: documents.communityId,
        title: documents.title,
        fileName: documents.fileName,
      })
      .from(documents)
      .where(
        and(
          eq(documents.sourceType, 'library'),
          isNull(documents.categoryId),
          isNull(documents.deletedAt),
        ),
      ),
    db
      .select({
        id: documentCategories.id,
        communityId: documentCategories.communityId,
        name: documentCategories.name,
      })
      .from(documentCategories)
      .where(isNull(documentCategories.deletedAt)),
  ]);

  const categoriesByCommunity = new Map<number, Array<{ id: number; name: string }>>();
  for (const category of categoryRows) {
    const communityCategories = categoriesByCommunity.get(category.communityId) ?? [];
    communityCategories.push({ id: category.id, name: category.name });
    categoriesByCommunity.set(category.communityId, communityCategories);
  }

  let updatedCount = 0;
  const unresolved: Array<Record<string, unknown>> = [];

  for (const document of libraryDocs as UncategorizedLibraryDocument[]) {
    const inferredKeys = inferCategoryKeys(document);
    if (inferredKeys.length !== 1) {
      unresolved.push({
        id: document.id,
        communityId: document.communityId,
        title: document.title,
        fileName: document.fileName,
        reason: inferredKeys.length === 0 ? 'no_keyword_match' : 'multiple_keyword_matches',
        inferredKeys,
      });
      continue;
    }

    const matchingCategories = (categoriesByCommunity.get(document.communityId) ?? []).filter(
      (category) => normalizeCategoryName(category.name) === inferredKeys[0],
    );

    if (matchingCategories.length !== 1) {
      unresolved.push({
        id: document.id,
        communityId: document.communityId,
        title: document.title,
        fileName: document.fileName,
        reason: matchingCategories.length === 0 ? 'no_category_match' : 'multiple_category_matches',
        inferredKeys,
        matchingCategoryIds: matchingCategories.map((category) => category.id),
      });
      continue;
    }

    await db
      .update(documents)
      .set({ categoryId: matchingCategories[0]!.id })
      .where(eq(documents.id, document.id));

    updatedCount += 1;
  }

  return { updatedCount, unresolved };
}

async function main(): Promise<void> {
  const evidenceUpdated = await backfillViolationEvidenceSourceType();
  const { updatedCount, unresolved } = await backfillUncategorizedLibraryDocuments();

  console.log(`Marked ${evidenceUpdated} document(s) as violation evidence.`);
  console.log(`Auto-mapped ${updatedCount} uncategorized library document(s).`);

  if (unresolved.length > 0) {
    console.log(`Unresolved library documents: ${unresolved.length}`);
    console.table(unresolved);
  } else {
    console.log('No unresolved uncategorized library documents remain.');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeUnscopedClient();
  });
