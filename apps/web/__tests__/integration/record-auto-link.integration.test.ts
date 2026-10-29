/**
 * Automatic record linking (D12) against real Postgres.
 *
 * The unit test pins the decision on an in-memory fake. Only a real database
 * can show that the eligibility filters are real SQL (a draft, violation
 * evidence or a deleted budget is not a competing candidate), that the guarded
 * UPDATE leaves an existing link alone, and that the audit row lands.
 *
 * Nothing is mocked: no-mock-guard forbids it under __tests__/integration/.
 */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq } from '@propertypro/db/filters';
import {
  autoLinkDocument,
  listRecordCandidates,
} from '@/lib/services/record-auto-link-service';
import {
  type TestKitState,
  getDescribeDb,
  initTestKit,
  requireDatabaseUrlInCI,
  teardownTestKit,
  trackCommunityForCleanup,
} from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('Record auto-link integration tests');

const describeDb = getDescribeDb();

describeDb('record auto-link (db-backed integration)', () => {
  let state: TestKitState;

  async function seedCondoWithBudgetItem(label: string): Promise<{
    communityId: number;
    categoryId: number;
    itemId: number;
  }> {
    const { communities, documentCategories, complianceChecklistItems } = state.dbModule;
    const [community] = await state.db
      .insert(communities)
      .values({
        name: `Auto link ${label} ${state.runSuffix}`,
        slug: `auto-link-${label}-${state.runSuffix}`,
        communityType: 'condo_718',
        timezone: 'America/New_York',
      })
      .returning({ id: communities.id });
    if (!community) throw new Error(`Failed to create community "${label}"`);
    trackCommunityForCleanup(state, community.id);

    const [category] = await state.db
      .insert(documentCategories)
      .values({ communityId: community.id, name: 'Financial Records', isSystem: true })
      .returning({ id: documentCategories.id });
    const [item] = await state.db
      .insert(complianceChecklistItems)
      .values({
        communityId: community.id,
        templateKey: '718_budget',
        title: 'Annual Budget',
        category: 'financial_records',
      })
      .returning({ id: complianceChecklistItems.id });
    if (!category || !item) throw new Error('Failed to seed category or item');
    return { communityId: community.id, categoryId: category.id, itemId: item.id };
  }

  async function seedBudget(
    communityId: number,
    categoryId: number,
    title: string,
    opts: {
      postedAt?: Date | null;
      sourceType?: 'library' | 'authored' | 'violation_evidence';
      deleted?: boolean;
    } = {},
  ): Promise<number> {
    const { documents } = state.dbModule;
    const slug = title.toLowerCase().replace(/\s+/g, '-');
    const [row] = await state.db
      .insert(documents)
      .values({
        communityId,
        categoryId,
        title,
        filePath: `communities/${communityId}/documents/${slug}-${state.runSuffix}.pdf`,
        fileName: `${slug}.pdf`,
        fileSize: 1024,
        mimeType: 'application/pdf',
        sourceType: opts.sourceType ?? 'library',
        // NULL is a draft; the column's default (now) would otherwise post it.
        postedAt: opts.postedAt === undefined ? new Date() : opts.postedAt,
        deletedAt: opts.deleted ? new Date() : null,
      })
      .returning({ id: documents.id });
    if (!row) throw new Error(`Failed to create document "${title}"`);
    return row.id;
  }

  async function readItem(itemId: number) {
    const { complianceChecklistItems } = state.dbModule;
    const [row] = await state.db
      .select()
      .from(complianceChecklistItems)
      .where(eq(complianceChecklistItems.id, itemId));
    return row;
  }

  beforeAll(async () => {
    state = await initTestKit();
  });

  afterAll(async () => {
    if (state) await teardownTestKit(state);
  });

  it('a posted budget links; a second budget uploaded later does not steal the link', async () => {
    const { communityId, categoryId, itemId } = await seedCondoWithBudgetItem('steal');
    // None of these is a candidate, so none makes the posted budget ambiguous.
    await seedBudget(communityId, categoryId, '2026 Budget Draft Copy', { postedAt: null });
    await seedBudget(communityId, categoryId, '2026 Budget Exhibit', { sourceType: 'violation_evidence' });
    await seedBudget(communityId, categoryId, '2024 Annual Budget', { deleted: true });

    const postedAt = new Date('2026-02-10T14:00:00.000Z');
    const first = await seedBudget(communityId, categoryId, '2026 Annual Budget', { postedAt });

    await expect(autoLinkDocument(communityId, first, null)).resolves.toEqual({
      templateKey: '718_budget',
      outcome: 'linked',
    });
    const linked = await readItem(itemId);
    expect(linked?.documentId).toBe(first);
    expect(linked?.autoLinkedDocumentId).toBe(first);
    expect(linked?.documentPostedAt?.toISOString()).toBe(postedAt.toISOString());

    const { complianceAuditLog } = state.dbModule;
    const audit = await state.db
      .select()
      .from(complianceAuditLog)
      .where(
        and(
          eq(complianceAuditLog.communityId, communityId),
          eq(complianceAuditLog.action, 'link_document'),
        ),
      );
    expect(audit).toHaveLength(1);
    expect(audit[0]?.resourceId).toBe(String(itemId));
    expect(audit[0]?.metadata).toEqual({ linkedBy: 'auto_match', templateKey: '718_budget' });

    const second = await seedBudget(communityId, categoryId, '2027 Proposed Annual Budget');
    const result = await autoLinkDocument(communityId, second, null);

    expect(result.outcome).not.toBe('linked');
    const after = await readItem(itemId);
    expect(after?.documentId).toBe(first);
    expect(after?.autoLinkedDocumentId).toBe(first);
    // A linked item asks no one to choose.
    await expect(listRecordCandidates(communityId)).resolves.toEqual({});
  });

  it('two posted budgets link neither, and both are offered', async () => {
    const { communityId, categoryId, itemId } = await seedCondoWithBudgetItem('two');
    const older = await seedBudget(communityId, categoryId, '2025 Annual Budget');
    const newer = await seedBudget(communityId, categoryId, '2026 Annual Budget');

    await expect(autoLinkDocument(communityId, newer, null)).resolves.toEqual({
      templateKey: '718_budget',
      outcome: 'ambiguous',
    });
    expect((await readItem(itemId))?.documentId).toBeNull();
    await expect(listRecordCandidates(communityId)).resolves.toEqual({
      [itemId]: [
        { documentId: newer, title: '2026 Annual Budget' },
        { documentId: older, title: '2025 Annual Budget' },
      ],
    });
  });
});
