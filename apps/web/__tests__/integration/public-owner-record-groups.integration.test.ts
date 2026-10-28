/**
 * Public owner-record groups — the Documents section's owner summary, against
 * real Postgres.
 *
 * `listOwnerRecordGroups` turns the owners-only compliance checklist into public
 * output (a count per group of records, never a title), so what matters is the
 * JOIN, the predicates and the GROUP BY. The unit test beside the reader pins
 * the predicates by name against a mocked query chain; that cannot show they do
 * what their names say. These cases do, including two that only a real schema
 * can pose:
 *   - `compliance_checklist_items.document_id` is a plain foreign key, so an
 *     item can point at ANOTHER community's document;
 *   - an item can be hand-linked to a `violation_evidence` document, which
 *     owners never reach through the documents UI.
 *
 * Nothing is mocked — no-mock-guard forbids it under __tests__/integration/. The
 * reader is the real one, on its real unauthenticated client.
 */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { getPublicCommunityScopedReader } from '@/lib/db/public-community-reader';
import {
  type TestKitState,
  initTestKit,
  teardownTestKit,
  trackCommunityForCleanup,
  requireDatabaseUrlInCI,
  getDescribeDb,
} from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('Public owner-record groups integration tests');

const describeDb = getDescribeDb();

/** In every checklist item title, so a leak of a title into the output is visible. */
const OWNER_ONLY_TITLE = 'OWNER-ONLY-TITLE';

type SourceType = 'library' | 'authored' | 'violation_evidence';

describeDb('public owner-record groups (db-backed integration)', () => {
  let state: TestKitState;
  let communityA = 0;
  let communityB = 0;
  let evidenceCommunity = 0;
  let noRecordsCommunity = 0;

  async function seedCommunity(label: string): Promise<number> {
    const [row] = await state.db
      .insert(state.dbModule.communities)
      .values({
        name: `Owner records ${label} ${state.runSuffix}`,
        slug: `owner-records-${label}-${state.runSuffix}`,
        communityType: 'condo_718',
        timezone: 'America/New_York',
      })
      .returning({ id: state.dbModule.communities.id });
    if (!row) throw new Error(`Failed to create community "${label}"`);
    trackCommunityForCleanup(state, row.id);
    return row.id;
  }

  async function seedDocument(
    communityId: number,
    name: string,
    opts: { sourceType?: SourceType; posted?: boolean; deleted?: boolean } = {},
  ): Promise<number> {
    const [row] = await state.db
      .insert(state.dbModule.documents)
      .values({
        communityId,
        title: `${name} ${state.runSuffix}`,
        filePath: `${communityId}/documents/${name}-${state.runSuffix}.pdf`,
        fileName: `${name}.pdf`,
        fileSize: 1024,
        mimeType: 'application/pdf',
        sourceType: opts.sourceType ?? 'library',
        // NULL is a draft; the column's default (now) would otherwise post it.
        postedAt: opts.posted === false ? null : new Date(),
        deletedAt: opts.deleted ? new Date() : null,
      })
      .returning({ id: state.dbModule.documents.id });
    if (!row) throw new Error(`Failed to create document "${name}"`);
    return row.id;
  }

  async function seedItem(
    communityId: number,
    templateKey: string,
    category: string,
    opts: { documentId?: number; applicable?: boolean; conditional?: boolean; deleted?: boolean } = {},
  ): Promise<void> {
    await state.db.insert(state.dbModule.complianceChecklistItems).values({
      communityId,
      templateKey,
      title: `${OWNER_ONLY_TITLE} ${templateKey}`,
      category,
      documentId: opts.documentId ?? null,
      isApplicable: opts.applicable ?? true,
      isConditional: opts.conditional ?? false,
      deletedAt: opts.deleted ? new Date() : null,
    });
  }

  beforeAll(async () => {
    state = await initTestKit();
    communityA = await seedCommunity('a');
    communityB = await seedCommunity('b');
    evidenceCommunity = await seedCommunity('evidence');
    noRecordsCommunity = await seedCommunity('none');

    // Community A: every way an item can fail to count, and every way it can.
    const library = await seedDocument(communityA, 'library');
    const authored = await seedDocument(communityA, 'authored', { sourceType: 'authored' });
    const conditional = await seedDocument(communityA, 'conditional');
    const draft = await seedDocument(communityA, 'draft', { posted: false });
    const deleted = await seedDocument(communityA, 'deleted', { deleted: true });
    const notApplicable = await seedDocument(communityA, 'not-applicable');
    const onDeletedItem = await seedDocument(communityA, 'on-deleted-item');
    const operations = await seedDocument(communityA, 'operations');
    const meeting = await seedDocument(communityA, 'meeting');
    const unknownGroup = await seedDocument(communityA, 'unknown-group');
    const communityBDocument = await seedDocument(communityB, 'community-b');
    const communityBOther = await seedDocument(communityB, 'community-b-other');

    // Counted.
    await seedItem(communityA, 'a-library', 'financial_records', { documentId: library });
    await seedItem(communityA, 'a-authored', 'financial_records', { documentId: authored });
    await seedItem(communityA, 'a-conditional', 'financial_records', {
      documentId: conditional,
      conditional: true,
    });
    await seedItem(communityA, 'a-meeting', 'meeting_records', { documentId: meeting });
    await seedItem(communityA, 'a-operations', 'operations', { documentId: operations });
    // Not counted.
    await seedItem(communityA, 'a-draft', 'financial_records', { documentId: draft });
    await seedItem(communityA, 'a-deleted-document', 'financial_records', { documentId: deleted });
    await seedItem(communityA, 'a-not-applicable', 'governing_documents', {
      documentId: notApplicable,
      applicable: false,
    });
    await seedItem(communityA, 'a-unlinked', 'governing_documents');
    await seedItem(communityA, 'a-deleted-item', 'governing_documents', {
      documentId: onDeletedItem,
      deleted: true,
    });
    await seedItem(communityA, 'a-other-community', 'insurance', { documentId: communityBDocument });
    await seedItem(communityA, 'a-unknown-group', 'custom_category', { documentId: unknownGroup });

    // Community B holds its own records, one of which A's item points at.
    await seedItem(communityB, 'b-one', 'governing_documents', { documentId: communityBDocument });
    await seedItem(communityB, 'b-two', 'governing_documents', { documentId: communityBOther });

    // A posted violation photo hand-linked to a requirement, next to a posted
    // authored document linked to another: only the second is a record owners
    // can reach.
    const evidence = await seedDocument(evidenceCommunity, 'violation-photo', {
      sourceType: 'violation_evidence',
    });
    const evidenceAuthored = await seedDocument(evidenceCommunity, 'authored', {
      sourceType: 'authored',
    });
    await seedItem(evidenceCommunity, 'e-evidence', 'financial_records', { documentId: evidence });
    await seedItem(evidenceCommunity, 'e-authored', 'governing_documents', {
      documentId: evidenceAuthored,
    });

    // A checklist with nothing linked.
    await seedItem(noRecordsCommunity, 'n-one', 'governing_documents');
  });

  afterAll(async () => {
    if (state) await teardownTestKit(state);
  });

  it('counts only posted, undeleted, linked records of applicable items, per group, in the editor order', async () => {
    const groups = await getPublicCommunityScopedReader(communityA).listOwnerRecordGroups();

    expect(groups).toEqual([
      { category: 'financial_records', label: 'Financial records', postedCount: 3 },
      { category: 'meeting_records', label: 'Meeting records', postedCount: 1 },
      { category: 'operations', label: 'Contracts and inspections', postedCount: 1 },
    ]);
  });

  it("does not let another community's records, or a link into another community, into the count", async () => {
    const groups = await getPublicCommunityScopedReader(communityB).listOwnerRecordGroups();

    expect(groups).toEqual([
      { category: 'governing_documents', label: 'Governing documents', postedCount: 2 },
    ]);
  });

  it('never counts a violation photo an item was hand-linked to', async () => {
    const groups = await getPublicCommunityScopedReader(evidenceCommunity).listOwnerRecordGroups();

    // The authored document counts; the posted violation_evidence one, which
    // owners cannot reach through the documents UI, does not.
    expect(groups).toEqual([
      { category: 'governing_documents', label: 'Governing documents', postedCount: 1 },
    ]);
  });

  it('returns nothing for a community whose items link no record', async () => {
    await expect(
      getPublicCommunityScopedReader(noRecordsCommunity).listOwnerRecordGroups(),
    ).resolves.toEqual([]);
  });

  it('returns only a category, a label and a number', async () => {
    const groups = await getPublicCommunityScopedReader(communityA).listOwnerRecordGroups();

    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) {
      expect(Object.keys(group).sort()).toEqual(['category', 'label', 'postedCount']);
      expect(typeof group.postedCount).toBe('number');
    }
    // Neither a checklist title nor any document's title or path (all carry the
    // run suffix) appears in what an anonymous visitor is given.
    const serialized = JSON.stringify(groups);
    expect(serialized).not.toContain(OWNER_ONLY_TITLE);
    expect(serialized).not.toContain(state.runSuffix);
  });
});
