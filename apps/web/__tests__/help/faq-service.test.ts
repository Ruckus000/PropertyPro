import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createScopedClientMock, faqsTableMock } = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  faqsTableMock: {
    id: Symbol('faqs.id'),
    sortOrder: Symbol('faqs.sortOrder'),
    roleVisibility: Symbol('faqs.roleVisibility'),
  },
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  faqs: faqsTableMock,
  clampPageSize: (input: number | null | undefined) => {
    if (input === null || input === undefined) return 50;
    if (input < 1) return 1;
    if (input > 100) return 100;
    return input;
  },
}));

vi.mock('@propertypro/db/filters', () => ({
  and: (...clauses: unknown[]) => ({ __and: clauses }),
  asc: (col: unknown) => ({ __asc: col }),
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
  gt: (col: unknown, val: unknown) => ({ __gt: { col, val } }),
  isNull: (col: unknown) => ({ __isNull: col }),
  or: (...clauses: unknown[]) => ({ __or: clauses }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    __sql: { strings: [...strings], values },
  }),
}));

import {
  buildDefaultFaqRows,
  ensureFaqsExist,
  filterFaqsForRole,
  isFaqVisibleToRole,
  listVisibleFaqsPage,
  searchCommunityFaqs,
} from '../../src/lib/services/faq-service';

describe('faq service helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds a non-empty ordered default FAQ seed set', () => {
    const rows = buildDefaultFaqRows();

    expect(rows.length).toBeGreaterThanOrEqual(10);
    expect(rows[0]?.sortOrder).toBe(0);
    expect(rows.at(-1)?.sortOrder).toBe(rows.length - 1);
  });

  it('filters role-restricted FAQs correctly', () => {
    expect(isFaqVisibleToRole({ roleVisibility: null }, ['tenant'])).toBe(true);
    expect(isFaqVisibleToRole({ roleVisibility: ['manager'] }, ['tenant'])).toBe(false);
    expect(isFaqVisibleToRole({ roleVisibility: ['manager'] }, ['manager'])).toBe(true);

    const visible = filterFaqsForRole(
      [
        {
          id: 1,
          question: 'Visible',
          answer: 'All',
          sortOrder: 1,
          category: null,
          roleVisibility: null,
        },
        {
          id: 2,
          question: 'Admin only',
          answer: 'Restricted',
          sortOrder: 0,
          category: null,
          roleVisibility: ['manager'],
        },
      ] as never,
      ['tenant'],
    );

    expect(visible.map((faq) => faq.id)).toEqual([1]);
  });

  it('matches on any of the viewer\'s tokens (roadmap 2.8 — a board owner is owner AND board)', () => {
    const boardOwner = ['owner', 'board_member'];
    expect(isFaqVisibleToRole({ roleVisibility: ['owner'] }, boardOwner)).toBe(true);
    expect(isFaqVisibleToRole({ roleVisibility: ['board_member'] }, boardOwner)).toBe(true);
    expect(isFaqVisibleToRole({ roleVisibility: ['manager'] }, boardOwner)).toBe(false);
  });

  it('keeps every admin default FAQ manager-only — a board designation does not grant those actions', () => {
    const adminDefaults = buildDefaultFaqRows().filter((row) => row.roleVisibility?.length);
    expect(adminDefaults.length).toBeGreaterThan(0);
    for (const row of adminDefaults) {
      expect(isFaqVisibleToRole(row, ['manager'])).toBe(true);
      expect(isFaqVisibleToRole(row, ['owner', 'board_president'])).toBe(false);
    }
  });

  it('seeds defaults when a community has no FAQs yet', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const insert = vi.fn().mockResolvedValue([]);
    createScopedClientMock.mockReturnValue({ query, insert });

    await ensureFaqsExist(42);

    expect(createScopedClientMock).toHaveBeenCalledWith(42);
    expect(query).toHaveBeenCalledWith(faqsTableMock);
    expect(insert).toHaveBeenCalledOnce();
    expect(insert.mock.calls[0]?.[1]).toEqual(buildDefaultFaqRows());
  });

  it('does not reseed when FAQs already exist', async () => {
    const query = vi.fn().mockResolvedValue([{ id: 1 }]);
    const insert = vi.fn();
    createScopedClientMock.mockReturnValue({ query, insert });

    await ensureFaqsExist(42);

    expect(insert).not.toHaveBeenCalled();
  });

  describe('listVisibleFaqsPage', () => {
    function mockSelectRows(rows: Record<string, unknown>[]) {
      const limit = vi.fn().mockResolvedValue(rows);
      const orderBy = vi.fn(() => ({ limit }));
      const selectFrom = vi.fn((..._args: unknown[]) => ({ orderBy }));
      createScopedClientMock.mockReturnValue({ selectFrom });
      return { selectFrom, orderBy, limit };
    }

    it('returns a double-key ordered page and encodes the next cursor from the last kept row', async () => {
      const { selectFrom, orderBy, limit } = mockSelectRows([
        {
          id: 10,
          question: 'Q10',
          answer: 'A10',
          sortOrder: 1,
          category: null,
          roleVisibility: null,
        },
        {
          id: 11,
          question: 'Q11',
          answer: 'A11',
          sortOrder: 1,
          category: null,
          roleVisibility: null,
        },
        {
          id: 12,
          question: 'Q12',
          answer: 'A12',
          sortOrder: 2,
          category: null,
          roleVisibility: null,
        },
      ]);

      const result = await listVisibleFaqsPage(42, ['tenant'], { pageSize: 2 });

      expect(result.data.map((faq) => faq.id)).toEqual([10, 11]);
      expect(result.pagination.hasMore).toBe(true);
      expect(result.pagination.pageSize).toBe(2);
      expect(JSON.parse(Buffer.from(result.pagination.nextCursor!, 'base64url').toString('utf8'))).toEqual({
        sortOrder: 1,
        id: 11,
      });
      expect(selectFrom).toHaveBeenCalledWith(
        faqsTableMock,
        {},
        expect.objectContaining({ __or: expect.any(Array) }),
      );
      expect(orderBy).toHaveBeenCalledWith(
        { __asc: faqsTableMock.sortOrder },
        { __asc: faqsTableMock.id },
      );
      expect(limit).toHaveBeenCalledWith(3);
    });

    it('uses the ordered cursor predicate on the next page without post-fetch filtering', async () => {
      const cursor = Buffer.from(JSON.stringify({ sortOrder: 3, id: 20 }), 'utf8').toString(
        'base64url',
      );
      const { selectFrom } = mockSelectRows([
        {
          id: 21,
          question: 'Q21',
          answer: 'A21',
          sortOrder: 4,
          category: null,
          roleVisibility: ['board_member'],
        },
      ]);

      const result = await listVisibleFaqsPage(42, ['owner', 'board_member'], { cursor, pageSize: 10 });

      expect(result.data.map((faq) => faq.id)).toEqual([21]);
      expect(result.pagination.nextCursor).toBeNull();
      expect(selectFrom.mock.calls[0]?.[2]).toEqual({
        __and: [
          {
            __or: [
              {
                __or: [
                  { __isNull: faqsTableMock.roleVisibility },
                  {
                    __sql: {
                      strings: ['cardinality(', ') = 0'],
                      values: [faqsTableMock.roleVisibility],
                    },
                  },
                ],
              },
              {
                __sql: {
                  strings: ['', ' = ANY(', ')'],
                  values: ['owner', faqsTableMock.roleVisibility],
                },
              },
              {
                __sql: {
                  strings: ['', ' = ANY(', ')'],
                  values: ['board_member', faqsTableMock.roleVisibility],
                },
              },
            ],
          },
          {
            __or: [
              { __gt: { col: faqsTableMock.sortOrder, val: 3 } },
              {
                __and: [
                  { __eq: { col: faqsTableMock.sortOrder, val: 3 } },
                  { __gt: { col: faqsTableMock.id, val: 20 } },
                ],
              },
            ],
          },
        ],
      });
    });

    it('limits anonymous/no-role visibility to global FAQs before pagination', async () => {
      const { selectFrom } = mockSelectRows([]);

      await listVisibleFaqsPage(42, [], { pageSize: 5 });

      expect(selectFrom.mock.calls[0]?.[2]).toEqual({
        __or: [
          { __isNull: faqsTableMock.roleVisibility },
          {
            __sql: {
              strings: ['cardinality(', ') = 0'],
              values: [faqsTableMock.roleVisibility],
            },
          },
        ],
      });
    });

    it('treats malformed cursors as a first-page request', async () => {
      const { selectFrom } = mockSelectRows([]);

      await listVisibleFaqsPage(42, ['tenant'], { cursor: 'not-valid-base64', pageSize: 5 });

      const where = selectFrom.mock.calls[0]?.[2] as { __or: unknown[] };
      expect(where).toEqual({
        __or: [
          {
            __or: [
              { __isNull: faqsTableMock.roleVisibility },
              {
                __sql: {
                  strings: ['cardinality(', ') = 0'],
                  values: [faqsTableMock.roleVisibility],
                },
              },
            ],
          },
          {
            __sql: {
              strings: ['', ' = ANY(', ')'],
              values: ['tenant', faqsTableMock.roleVisibility],
            },
          },
        ],
      });
    });
  });

  describe('searchCommunityFaqs', () => {
    const rows = [
      { id: 1, question: 'How do I pay rent?', answer: 'Open Payments tab.' },
      { id: 2, question: 'Where is the gym?', answer: 'Building B.' },
      { id: 3, question: 'Pool hours?', answer: 'Open 6am-10pm.' },
      { id: 4, question: 'Pet policy?', answer: 'Dogs and cats allowed.' },
    ];

    it('matches case-insensitively against both question and answer', async () => {
      const query = vi.fn().mockResolvedValue(rows);
      createScopedClientMock.mockReturnValue({ query });

      const result = await searchCommunityFaqs(42, 'OPEN', ['owner']);
      expect(result.hits.map((h) => h.id).sort()).toEqual([1, 3]);
      expect(result.totalRowCount).toBe(4);
      expect(createScopedClientMock).toHaveBeenCalledWith(42);
    });

    it('returns empty hits and total row count when no match', async () => {
      const query = vi.fn().mockResolvedValue(rows);
      createScopedClientMock.mockReturnValue({ query });

      const result = await searchCommunityFaqs(42, 'xyzzy', ['owner']);
      expect(result.hits).toEqual([]);
      expect(result.totalRowCount).toBe(4);
    });

    it('caps hits at the limit', async () => {
      const manyMatching = Array.from({ length: 25 }, (_, i) => ({
        id: i + 1,
        question: 'pool',
        answer: 'pool',
      }));
      const query = vi.fn().mockResolvedValue(manyMatching);
      createScopedClientMock.mockReturnValue({ query });

      const result = await searchCommunityFaqs(42, 'pool', ['owner'], 5);
      expect(result.hits).toHaveLength(5);
      expect(result.totalRowCount).toBe(25);
    });

    // Route-authz census F4 (2026-09-28): search returned every FAQ's full
    // answer regardless of roleVisibility. Revert-check: drop the
    // isFaqVisibleToRole filter and this case goes red.
    it('hides an FAQ restricted to other roles, and keeps unrestricted ones', async () => {
      const query = vi.fn().mockResolvedValue([
        { id: 1, question: 'Gate code?', answer: '4321', roleVisibility: ['manager'] },
        { id: 2, question: 'Gate hours?', answer: '6am-10pm', roleVisibility: [] },
      ]);
      createScopedClientMock.mockReturnValue({ query });

      const asTenant = await searchCommunityFaqs(42, 'gate', ['tenant']);
      expect(asTenant.hits.map((h) => h.id)).toEqual([2]);

      const asManager = await searchCommunityFaqs(42, 'gate', ['manager']);
      expect(asManager.hits.map((h) => h.id).sort()).toEqual([1, 2]);
    });

    it('shapes each hit as { id, question, answer }', async () => {
      const query = vi.fn().mockResolvedValue([
        { id: 7, question: 'Q?', answer: 'A.', extraField: 'ignored' },
      ]);
      createScopedClientMock.mockReturnValue({ query });

      const result = await searchCommunityFaqs(42, 'Q', ['owner']);
      expect(result.hits[0]).toEqual({ id: 7, question: 'Q?', answer: 'A.' });
    });
  });
});
