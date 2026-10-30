/**
 * `record-auto-link-service` — which posted document fills which Florida record
 * on its own (D12), and what is left to a person.
 *
 * The database is a small in-memory fake: `selectFrom` answers by table, and
 * `update` honours an `isNull(document_id)` guard and a document `exists (...)`
 * guard only when the statement carries them, so the guards are tested rather
 * than assumed. It reads the document's `posted_at` subquery the same way. The
 * real SQL is covered by the integration test. The SQL filters themselves are covered by
 * `__tests__/integration/record-auto-link.integration.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface FakeItem {
  id: number;
  templateKey: string;
  documentId: number | null;
  isApplicable: boolean;
  autoLinkedDocumentId?: number | null;
  documentPostedAt?: Date | null;
}

interface FakeDoc {
  id: number;
  title: string;
  fileName: string;
  categoryId: number | null;
  postedAt: Date | null;
  sourceType: string;
  deletedAt: Date | null;
}

const { db, tables, createScopedClientMock, logAuditEventMock, getDocumentCategoryNamesMock } =
  vi.hoisted(() => {
    const tables = {
      communities: { __table: 'communities', id: 'communities.id', communityType: 'communities.communityType' },
      complianceChecklistItems: {
        __table: 'compliance_checklist_items',
        id: 'cci.id',
        templateKey: 'cci.templateKey',
        documentId: 'cci.documentId',
        isApplicable: 'cci.isApplicable',
      },
      documents: {
        __table: 'documents',
        id: 'documents.id',
        title: 'documents.title',
        fileName: 'documents.fileName',
        categoryId: 'documents.categoryId',
        postedAt: 'documents.postedAt',
        sourceType: 'documents.sourceType',
        deletedAt: 'documents.deletedAt',
      },
    };
    const db = {
      communityType: 'condo_718' as string,
      items: [] as FakeItem[],
      docs: [] as FakeDoc[],
      /** Runs just before an update is evaluated: another request getting there first. */
      beforeUpdate: null as null | (() => void),
    };
    return {
      db,
      tables,
      createScopedClientMock: vi.fn(),
      logAuditEventMock: vi.fn(),
      getDocumentCategoryNamesMock: vi.fn(),
    };
  });

vi.mock('@propertypro/db', () => ({
  communities: tables.communities,
  complianceChecklistItems: tables.complianceChecklistItems,
  documents: tables.documents,
  createScopedClient: createScopedClientMock,
  logAuditEvent: logAuditEventMock,
}));

vi.mock('@propertypro/db/filters', () => ({
  and: (...clauses: unknown[]) => ({ __and: clauses }),
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
  inArray: (col: unknown, vals: unknown) => ({ __inArray: { col, vals } }),
  isNotNull: (col: unknown) => ({ __isNotNull: col }),
  isNull: (col: unknown) => ({ __isNull: col }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ __sql: strings.join('$'), values }),
}));

vi.mock('@/lib/services/document-category-service', () => ({
  getDocumentCategoryNames: getDocumentCategoryNamesMock,
}));

import {
  applyRecordLinks,
  autoLinkCommunityRecords,
  autoLinkDocument,
  listRecordCandidates,
  planCommunityRecordLinks,
} from '../../../src/lib/services/record-auto-link-service';

const CATEGORY_NAMES = new Map<number, string>([
  [1, 'Financial Records'],
  [2, 'Declaration'],
]);

function clausesOf(where: unknown): unknown[] {
  return (where as { __and?: unknown[] })?.__and ?? [where];
}

/** The `eq(<table>.id, <id>)` value inside a where clause, if any. */
function idFilter(where: unknown, column: string): number | undefined {
  for (const clause of clausesOf(where)) {
    const eq = (clause as { __eq?: { col: unknown; val: unknown } })?.__eq;
    if (eq && eq.col === column) return Number(eq.val);
  }
  return undefined;
}

interface FakeSql {
  __sql: string;
  values: unknown[];
}

function asSql(value: unknown): FakeSql | null {
  return value != null && typeof value === 'object' && '__sql' in value ? (value as FakeSql) : null;
}

/** The fake's reading of the document subqueries: `d.id = $1 and d.community_id = $2 ...`. */
function subqueryDocument(fragment: FakeSql): FakeDoc | undefined {
  return db.docs.find((doc) => doc.id === fragment.values[0]);
}

/** Every `documents` read that is not the one-document read by id: the community-wide read. */
let communityDocumentReads = 0;

function fakeScopedClient() {
  return {
    selectFrom: vi.fn(async (table: { __table: string }, _cols: unknown, where?: unknown) => {
      if (table.__table === 'communities') return [{ communityType: db.communityType }];
      if (table.__table === 'compliance_checklist_items') return db.items.map((item) => ({ ...item }));
      // documents: soft-deleted rows never come back from the scoped client.
      const live = db.docs.filter((doc) => doc.deletedAt == null);
      const id = idFilter(where, tables.documents.id);
      if (id === undefined) communityDocumentReads++;
      return (id === undefined ? live : live.filter((doc) => doc.id === id)).map((doc) => ({ ...doc }));
    }),
    update: vi.fn(async (_table: unknown, values: Record<string, unknown>, where: unknown) => {
      db.beforeUpdate?.();
      const id = idFilter(where, tables.complianceChecklistItems.id);
      const item = db.items.find((row) => row.id === id);
      if (!item) return [];
      const guardsUnlinked = clausesOf(where).some(
        (clause) => (clause as { __isNull?: unknown })?.__isNull === tables.complianceChecklistItems.documentId,
      );
      if (guardsUnlinked && item.documentId != null) return [];
      const existsGuard = clausesOf(where).map(asSql).find((f) => f?.__sql.startsWith('exists'));
      if (existsGuard) {
        const target = subqueryDocument(existsGuard);
        const stillEligible =
          target != null &&
          target.postedAt != null &&
          target.deletedAt == null &&
          ['library', 'authored'].includes(target.sourceType);
        if (!stillEligible) return [];
      }
      const resolved = Object.fromEntries(
        Object.entries(values).map(([key, value]) => {
          const fragment = asSql(value);
          return [key, fragment ? (subqueryDocument(fragment)?.postedAt ?? null) : value];
        }),
      );
      Object.assign(item, resolved);
      return [{ ...item }];
    }),
  };
}

const POSTED = new Date('2026-03-02T15:00:00.000Z');

function doc(id: number, title: string, overrides: Partial<FakeDoc> = {}): FakeDoc {
  return {
    id,
    title,
    fileName: `${title.toLowerCase().replace(/\s+/g, '-')}.pdf`,
    categoryId: 1,
    postedAt: POSTED,
    sourceType: 'library',
    deletedAt: null,
    ...overrides,
  };
}

function item(id: number, templateKey: string, overrides: Partial<FakeItem> = {}): FakeItem {
  return { id, templateKey, documentId: null, isApplicable: true, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.communityType = 'condo_718';
  db.items = [item(10, '718_budget'), item(11, '718_bylaws'), item(12, '718_declaration')];
  db.docs = [];
  db.beforeUpdate = null;
  communityDocumentReads = 0;
  createScopedClientMock.mockImplementation(() => fakeScopedClient());
  logAuditEventMock.mockResolvedValue(undefined);
  getDocumentCategoryNamesMock.mockImplementation(async (_communityId: number, ids: number[]) => {
    return new Map(ids.filter((id) => CATEGORY_NAMES.has(id)).map((id) => [id, CATEGORY_NAMES.get(id)!]));
  });
});

describe('autoLinkDocument', () => {
  it('links a posted budget in Financial Records to 718_budget and records auto_linked_document_id', async () => {
    db.docs = [doc(100, '2026 Annual Budget')];

    const result = await autoLinkDocument(42, 100, 'user-1');

    expect(result).toEqual({ templateKey: '718_budget', outcome: 'linked' });
    const budget = db.items.find((row) => row.id === 10)!;
    expect(budget.documentId).toBe(100);
    expect(budget.autoLinkedDocumentId).toBe(100);
    // The document's own posting date, not the moment of linking.
    expect(budget.documentPostedAt).toEqual(POSTED);
    expect(createScopedClientMock).toHaveBeenCalledWith(42);
  });

  it('does not link a draft', async () => {
    db.docs = [doc(100, '2026 Annual Budget', { postedAt: null })];

    const result = await autoLinkDocument(42, 100, 'user-1');

    expect(result).toEqual({ templateKey: null, outcome: 'not_eligible' });
    expect(db.items.every((row) => row.documentId === null)).toBe(true);
  });

  it('does not link violation evidence', async () => {
    db.docs = [doc(100, '2026 Annual Budget', { sourceType: 'violation_evidence' })];

    const result = await autoLinkDocument(42, 100, 'user-1');

    expect(result).toEqual({ templateKey: null, outcome: 'not_eligible' });
    expect(db.items.every((row) => row.documentId === null)).toBe(true);
  });

  it('does nothing for an apartment', async () => {
    db.communityType = 'apartment';
    db.docs = [doc(100, '2026 Annual Budget')];

    const result = await autoLinkDocument(42, 100, 'user-1');

    expect(result).toEqual({ templateKey: null, outcome: 'not_eligible' });
    expect(db.items.every((row) => row.documentId === null)).toBe(true);
    expect(logAuditEventMock).not.toHaveBeenCalled();
    await expect(autoLinkCommunityRecords(42, 'user-1')).resolves.toEqual({ linked: 0, ambiguous: 0 });
    await expect(listRecordCandidates(42)).resolves.toEqual({});
  });

  it('never replaces an existing link', async () => {
    db.items = [item(10, '718_budget', { documentId: 55 })];
    db.docs = [doc(55, '2025 Budget'), doc(100, '2026 Annual Budget')];

    const result = await autoLinkDocument(42, 100, 'user-1');

    // A linked item is not open, so nothing is even attempted.
    expect(result).toEqual({ templateKey: null, outcome: 'no_match' });
    expect(db.items[0]!.documentId).toBe(55);
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('never replaces a link made after the read: zero rows updated is not_eligible, and nothing is audited', async () => {
    db.docs = [doc(100, '2026 Annual Budget')];
    // A person links the item between this request's read and its write.
    db.beforeUpdate = () => {
      db.items.find((row) => row.id === 10)!.documentId = 77;
    };

    const result = await autoLinkDocument(42, 100, 'user-1');

    expect(result).toEqual({ templateKey: '718_budget', outcome: 'not_eligible' });
    expect(db.items.find((row) => row.id === 10)!.documentId).toBe(77);
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('never links a document taken back to a draft after the read', async () => {
    db.docs = [doc(100, '2026 Annual Budget')];
    db.beforeUpdate = () => {
      db.docs.find((row) => row.id === 100)!.postedAt = null;
    };

    const result = await autoLinkDocument(42, 100, 'user-1');

    expect(result).toEqual({ templateKey: '718_budget', outcome: 'not_eligible' });
    expect(db.items.find((row) => row.id === 10)!.documentId).toBeNull();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('answers no_match for an upload that fits no open item without reading the other documents', async () => {
    db.docs = [doc(99, '2026 Annual Budget'), doc(100, 'Pool Hours', { categoryId: 2 })];

    const result = await autoLinkDocument(42, 100, 'user-1');

    expect(result).toEqual({ templateKey: null, outcome: 'no_match' });
    expect(communityDocumentReads).toBe(0);
  });

  it('does not count a document that already fills one item as a candidate for another', async () => {
    // A person linked the combined document to the declaration.
    db.items = [item(11, '718_bylaws'), item(12, '718_declaration', { documentId: 100 })];
    db.docs = [doc(100, 'Declaration and Bylaws', { categoryId: 2 }), doc(101, 'Bylaws', { categoryId: 2 })];

    const result = await autoLinkDocument(42, 101, 'user-1');

    expect(result).toEqual({ templateKey: '718_bylaws', outcome: 'linked' });
    expect(db.items.find((row) => row.id === 11)!.documentId).toBe(101);
  });

  it('does not link when two posted budgets both match, and lists both as candidates', async () => {
    db.docs = [doc(100, '2025 Annual Budget'), doc(101, '2026 Annual Budget')];

    const result = await autoLinkDocument(42, 101, 'user-1');

    expect(result).toEqual({ templateKey: '718_budget', outcome: 'ambiguous' });
    expect(db.items.find((row) => row.id === 10)!.documentId).toBeNull();
    await expect(listRecordCandidates(42)).resolves.toEqual({
      10: [
        { documentId: 101, title: '2026 Annual Budget' },
        { documentId: 100, title: '2025 Annual Budget' },
      ],
    });
    await expect(planCommunityRecordLinks(42)).resolves.toEqual({
      links: [],
      ambiguous: [{ itemId: 10, templateKey: '718_budget', documentIds: [100, 101] }],
    });
  });

  it('does not link a document that fits two items', async () => {
    db.docs = [doc(100, 'Declaration and Bylaws', { categoryId: 2 })];

    const result = await autoLinkDocument(42, 100, 'user-1');

    expect(result).toEqual({ templateKey: null, outcome: 'ambiguous' });
    expect(db.items.every((row) => row.documentId === null)).toBe(true);
    await expect(listRecordCandidates(42)).resolves.toEqual({
      11: [{ documentId: 100, title: 'Declaration and Bylaws' }],
      12: [{ documentId: 100, title: 'Declaration and Bylaws' }],
    });
    await expect(autoLinkCommunityRecords(42, 'user-1')).resolves.toEqual({ linked: 0, ambiguous: 2 });
    expect(db.items.every((row) => row.documentId === null)).toBe(true);
  });

  it('leaves an item marked "doesn\'t apply" alone', async () => {
    db.items = [item(10, '718_budget', { isApplicable: false })];
    db.docs = [doc(100, '2026 Annual Budget')];

    const result = await autoLinkDocument(42, 100, 'user-1');

    expect(result).toEqual({ templateKey: null, outcome: 'no_match' });
    expect(db.items[0]!.documentId).toBeNull();
  });

  it('audits with linkedBy auto_match', async () => {
    db.docs = [doc(100, '2026 Annual Budget')];

    await autoLinkDocument(42, 100, 'user-1');

    expect(logAuditEventMock).toHaveBeenCalledTimes(1);
    expect(logAuditEventMock).toHaveBeenCalledWith({
      userId: 'user-1',
      action: 'link_document',
      resourceType: 'compliance_checklist_item',
      resourceId: '10',
      communityId: 42,
      newValues: { documentId: 100 },
      metadata: { linkedBy: 'auto_match', templateKey: '718_budget' },
    });
  });
});

describe('autoLinkCommunityRecords', () => {
  it('a bulk upload links only the documents it created', async () => {
    // An older budget, posted before automatic linking existed, and an upload of an unrelated paper.
    db.docs = [doc(101, '2025 Annual Budget'), doc(200, 'Pool Hours', { categoryId: 2 })];
    // Unfiltered, the older budget would link: only the filter keeps it out.
    await expect(planCommunityRecordLinks(42)).resolves.toEqual({
      links: [{ itemId: 10, templateKey: '718_budget', documentId: 101 }],
      ambiguous: [],
    });

    const result = await autoLinkCommunityRecords(42, 'pm-1', { documentIds: [200] });

    expect(result).toEqual({ linked: 0, ambiguous: 0 });
    expect(db.items.find((row) => row.id === 10)!.documentId).toBeNull();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('applyRecordLinks adds the caller\'s audit metadata beside linkedBy and templateKey, and cannot replace them', async () => {
    db.docs = [doc(100, '2026 Annual Budget')];
    const plan = await planCommunityRecordLinks(42);

    await expect(
      applyRecordLinks(42, plan.links, null, {
        operator: 'Jane Doe',
        source: 'backfill',
        linkedBy: 'someone_else',
        templateKey: 'spoofed',
      }),
    ).resolves.toBe(1);

    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          operator: 'Jane Doe',
          source: 'backfill',
          linkedBy: 'auto_match',
          templateKey: '718_budget',
        },
      }),
    );
  });

  it('applyRecordLinks skips a planned link whose item a person linked after the plan', async () => {
    db.docs = [doc(100, '2026 Annual Budget')];
    const plan = await planCommunityRecordLinks(42);
    db.items.find((row) => row.id === 10)!.documentId = 77;

    await expect(applyRecordLinks(42, plan.links, null)).resolves.toBe(0);
    expect(db.items.find((row) => row.id === 10)!.documentId).toBe(77);
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('applies every unambiguous link and counts the items left to a person', async () => {
    db.docs = [
      doc(100, 'Bylaws', { categoryId: 2 }),
      doc(101, '2025 Annual Budget'),
      doc(102, '2026 Annual Budget'),
    ];

    await expect(planCommunityRecordLinks(42)).resolves.toEqual({
      links: [{ itemId: 11, templateKey: '718_bylaws', documentId: 100 }],
      ambiguous: [{ itemId: 10, templateKey: '718_budget', documentIds: [101, 102] }],
    });
    // The plan writes nothing.
    expect(db.items.every((row) => row.documentId === null)).toBe(true);

    await expect(autoLinkCommunityRecords(42, null)).resolves.toEqual({ linked: 1, ambiguous: 1 });
    expect(db.items.find((row) => row.id === 11)!.documentId).toBe(100);
    expect(db.items.find((row) => row.id === 10)!.documentId).toBeNull();
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: null, resourceId: '11', action: 'link_document' }),
    );
  });
});
