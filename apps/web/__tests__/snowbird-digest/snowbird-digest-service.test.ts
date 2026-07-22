/**
 * Unit tests for the snowbird digest compiler.
 *
 * These cover the SHAPING logic — section assembly, category grouping, the
 * document cap + "and N more" line, and empty-digest detection. The SQL window
 * filter (gte/lte on timestamps) is Drizzle's job and is exercised at runtime;
 * here the fake scoped client returns canned rows so we assert what the
 * compiler does with them.
 */
import { describe, expect, it, vi } from 'vitest';

// The @propertypro/db barrel guards DATABASE_URL at load time. This test only
// needs the schema TABLE OBJECTS (for identity matching in the fake client),
// never a real connection, so satisfy the guard before the import graph loads.
vi.hoisted(() => {
  process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
});

import { documents, documentCategories, elections, meetings, polls } from '@propertypro/db';
import {
  compileSnowbirdDigest,
  isDigestEmpty,
  DIGEST_DOCUMENT_CAP,
} from '../../src/lib/services/snowbird-digest-service';

/**
 * Build a fake scoped client. The compiler queries some tables more than once
 * (meetings: approved-minutes then upcoming; elections: certified then
 * closing), so each table gets a FIFO QUEUE of result-sets consumed in call
 * order — a single query against a table is just a one-element queue. The
 * compiler awaits the builder directly, so we resolve immediately.
 */
type Queues = {
  meetings?: unknown[][];
  elections?: unknown[][];
  documents?: unknown[][];
  documentCategories?: unknown[][];
  polls?: unknown[][];
};
function fakeScoped(queues: Queues) {
  const q: Record<string, unknown[][]> = {
    meetings: [...(queues.meetings ?? [])],
    elections: [...(queues.elections ?? [])],
    documents: [...(queues.documents ?? [])],
    documentCategories: [...(queues.documentCategories ?? [])],
    polls: [...(queues.polls ?? [])],
  };
  const keyFor = (table: unknown): string | null => {
    if (table === meetings) return 'meetings';
    if (table === elections) return 'elections';
    if (table === documents) return 'documents';
    if (table === documentCategories) return 'documentCategories';
    if (table === polls) return 'polls';
    return null;
  };
  const next = (table: unknown): unknown[] => {
    const key = keyFor(table);
    if (!key) return [];
    return q[key]!.shift() ?? [];
  };
  return {
    selectFrom: vi.fn((table: unknown) => Promise.resolve(next(table))),
    query: vi.fn((table: unknown) => Promise.resolve(next(table))),
  } as never;
}

const WIN_START = new Date('2026-07-01T00:00:00Z');
const WIN_END = new Date('2026-07-17T00:00:00Z');

describe('compileSnowbirdDigest', () => {
  it('assembles board decisions from approved minutes and certified elections', async () => {
    const scoped = fakeScoped({
      // [approved-minutes query, upcoming-meetings query]
      meetings: [[{ title: 'July Board Meeting', minutesApprovedAt: new Date('2026-07-10T00:00:00Z') }], []],
      // [certified query, closing query]
      elections: [[{ title: '2026 Director Election', certifiedAt: new Date('2026-07-12T00:00:00Z') }], []],
    });

    const out = await compileSnowbirdDigest(scoped, 1, WIN_START, WIN_END, false);

    expect(out.boardDecisions).toHaveLength(2);
    expect(out.boardDecisions[0]!.title).toBe('Minutes approved: July Board Meeting');
    expect(out.boardDecisions[0]!.actionUrl).toBe('/communities/1/meetings');
    expect(out.boardDecisions[1]!.title).toBe('Election certified: 2026 Director Election');
    expect(out.boardDecisions[1]!.date).toBe('July 12, 2026');
  });

  it('labels new documents with their category name', async () => {
    const scoped = fakeScoped({
      documents: [
        [
          { title: 'Reserve Study 2026', categoryId: 5, createdAt: new Date('2026-07-05T00:00:00Z') },
          { title: 'Uncategorized memo', categoryId: null, createdAt: new Date('2026-07-06T00:00:00Z') },
        ],
      ],
      documentCategories: [[{ id: 5, name: 'Financial Records' }]],
    });

    const out = await compileSnowbirdDigest(scoped, 1, WIN_START, WIN_END, false);

    expect(out.newDocuments).toHaveLength(2);
    expect(out.newDocuments[0]).toMatchObject({ title: 'Reserve Study 2026', detail: 'Financial Records' });
    expect(out.newDocuments[1]!.detail).toBeUndefined();
  });

  it('caps the document list and appends an "and N more" line (never silent truncation)', async () => {
    const many = Array.from({ length: DIGEST_DOCUMENT_CAP + 3 }, (_, i) => ({
      title: `Doc ${i}`,
      categoryId: null,
      createdAt: new Date('2026-07-05T00:00:00Z'),
    }));
    const scoped = fakeScoped({ documents: [many] });

    const out = await compileSnowbirdDigest(scoped, 1, WIN_START, WIN_END, false);

    expect(out.newDocuments).toHaveLength(DIGEST_DOCUMENT_CAP + 1);
    expect(out.newDocuments.at(-1)!.title).toBe('…and 3 more new document(s)');
  });

  it('builds the upcoming section from meetings, open elections, and active polls', async () => {
    const scoped = fakeScoped({
      // [approved (none), upcoming]
      meetings: [[], [{ title: 'August Meeting', startsAt: new Date('2026-07-25T00:00:00Z') }]],
      // [certified (none), closing]
      elections: [[], [{ title: 'Budget Vote', status: 'open', closesAt: new Date('2026-07-30T00:00:00Z') }]],
      polls: [[{ title: 'Pool Hours Poll', isActive: true, endsAt: new Date('2026-07-28T00:00:00Z') }]],
    });

    const out = await compileSnowbirdDigest(scoped, 1, WIN_START, WIN_END, false);

    expect(out.boardDecisions).toHaveLength(0);
    expect(out.upcoming.map((u) => u.title)).toEqual([
      'Meeting: August Meeting',
      'Voting closes: Budget Vote',
      'Poll closes: Pool Hours Poll',
    ]);
  });

  it('includes the compliance note only when hasCompliance is true', async () => {
    const withCompliance = await compileSnowbirdDigest(
      fakeScoped({}),
      1,
      WIN_START,
      WIN_END,
      true,
      'Currently compliant',
    );
    expect(withCompliance.complianceNote).toBe('Currently compliant');

    const without = await compileSnowbirdDigest(fakeScoped({}), 1, WIN_START, WIN_END, false, 'ignored');
    expect(without.complianceNote).toBeNull();
  });
});

describe('isDigestEmpty', () => {
  it('is true only when every activity section is empty', async () => {
    const empty = await compileSnowbirdDigest(fakeScoped({}), 1, WIN_START, WIN_END, true, 'Compliant');
    // A compliance note alone must NOT keep an otherwise-empty digest alive.
    expect(isDigestEmpty(empty)).toBe(true);

    const nonEmpty = await compileSnowbirdDigest(
      fakeScoped({ documents: [[{ title: 'X', categoryId: null, createdAt: WIN_END }]] }),
      1,
      WIN_START,
      WIN_END,
      false,
    );
    expect(isDigestEmpty(nonEmpty)).toBe(false);
  });
});
