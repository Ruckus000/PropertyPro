/**
 * `loadComplianceScores`: the admin console's reads for the shared compliance
 * rule. The fake client filters its fixtures by the `.in(...)` / `.is(...)` /
 * `.gte(...)` calls the loader makes and honours `.range(...)`, so what the
 * loader asks for is what decides the result.
 */
import { describe, expect, it, vi } from 'vitest';
import { loadComplianceScores, type ScoredCommunity } from '@/lib/server/compliance-scores';

type Row = Record<string, unknown>;

function fakeDb(tables: Record<string, Row[]>) {
  const calls: Array<{ table: string; filters: Array<[string, string, unknown]> }> = [];
  const from = vi.fn((table: string) => {
    const filters: Array<[string, string, unknown]> = [];
    let window: [number, number] | null = null;
    calls.push({ table, filters });
    const result = () => {
      let rows = (tables[table] ?? []).filter((row) =>
        filters.every(([op, col, value]) => {
          if (op === 'in') return (value as unknown[]).includes(row[col]);
          if (op === 'is') return row[col] === value;
          if (op === 'gte') return String(row[col]) >= String(value);
          return true;
        }),
      );
      if (window) rows = rows.slice(window[0], window[1] + 1);
      return Promise.resolve({ data: rows, error: null });
    };
    const chain: Record<string, unknown> = {
      select: () => chain,
      order: () => chain,
      in: (col: string, value: unknown[]) => (filters.push(['in', col, value]), chain),
      is: (col: string, value: unknown) => (filters.push(['is', col, value]), chain),
      gte: (col: string, value: unknown) => (filters.push(['gte', col, value]), chain),
      range: (a: number, b: number) => ((window = [a, b]), chain),
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => result().then(resolve, reject),
    };
    return chain;
  });
  return { db: { from } as never, calls };
}

const NOW = new Date('2026-11-23T12:00:00.000Z');
const condo = (id: number): ScoredCommunity => ({ id, community_type: 'condo_718', unit_count: 60 });

function checklistRow(id: number, communityId: number, documentId: number | null, extra: Row = {}): Row {
  return {
    id,
    community_id: communityId,
    template_key: `718_test_${id}`,
    is_applicable: true,
    document_id: documentId,
    document_posted_at: null,
    deadline: null,
    rolling_window: null,
    deleted_at: null,
    ...extra,
  };
}

function document(id: number, communityId: number, extra: Row = {}): Row {
  return { id, community_id: communityId, deleted_at: null, posted_at: '2026-10-01T00:00:00.000Z', received_at: null, ...extra };
}

describe('loadComplianceScores', () => {
  it('scores a draft or deleted file as not met, like the Compliance page', async () => {
    const { db } = fakeDb({
      compliance_checklist_items: [checklistRow(1, 1, 10), checklistRow(2, 1, 11), checklistRow(3, 1, 12)],
      documents: [
        document(10, 1),
        document(11, 1, { posted_at: null }),
        document(12, 1, { deleted_at: '2026-11-01T00:00:00.000Z' }),
      ],
    });

    const scores = await loadComplianceScores(db, [condo(1)], NOW);

    expect(scores.get(1)).toMatchObject({ score: 33, satisfied: 1, applicable: 3 });
  });

  it('never lets one community\'s document decide another\'s row', async () => {
    // Document 10 is community 1's draft. Community 2's row names it too.
    const { db } = fakeDb({
      compliance_checklist_items: [checklistRow(1, 1, 10), checklistRow(2, 2, 10)],
      documents: [document(10, 1, { posted_at: null })],
    });

    const scores = await loadComplianceScores(db, [condo(1), condo(2)], NOW);

    expect(scores.get(1)?.score).toBe(0);
    // Community 2 cannot see community 1's draft state (its own Compliance
    // page cannot either), so that draft does not make its row unmet.
    expect(scores.get(2)?.score).not.toBe(0);
  });

  it('gives no score to an apartment or to a community with nothing applicable, and reads nothing for apartments', async () => {
    const { db, calls } = fakeDb({
      compliance_checklist_items: [checklistRow(1, 1, null, { is_applicable: false })],
    });

    const scores = await loadComplianceScores(
      db,
      [condo(1), { id: 3, community_type: 'apartment', unit_count: 40 }],
      NOW,
    );

    expect(scores.size).toBe(0);
    for (const call of calls) {
      const ids = call.filters.find(([op, col]) => op === 'in' && col === 'community_id')?.[2] as number[];
      expect(ids).not.toContain(3);
    }
  });

  it('skips soft-deleted checklist rows and meetings before the scoring window', async () => {
    const { db, calls } = fakeDb({
      compliance_checklist_items: [checklistRow(1, 1, 10), checklistRow(2, 1, null, { deleted_at: '2026-11-01T00:00:00.000Z' })],
      documents: [document(10, 1)],
    });

    const scores = await loadComplianceScores(db, [condo(1)], NOW);

    expect(scores.get(1)).toMatchObject({ score: 100, applicable: 1 });
    const meetings = calls.find((c) => c.table === 'meetings');
    expect(meetings?.filters).toEqual(
      expect.arrayContaining([
        ['is', 'deleted_at', null],
        ['gte', 'starts_at', expect.any(String)],
      ]),
    );
  });

  it('looks up more than one chunk of documents and uses every one', async () => {
    // Every file is a draft, so each row is met only if its document state
    // was NOT read (an id missing from the map reads as posted).
    const ids = Array.from({ length: 450 }, (_, i) => 1000 + i);
    const { db, calls } = fakeDb({
      compliance_checklist_items: ids.map((docId, i) => checklistRow(i + 1, 1, docId)),
      documents: ids.map((docId) => document(docId, 1, { posted_at: null })),
    });

    const scores = await loadComplianceScores(db, [condo(1)], NOW);

    expect(calls.filter((c) => c.table === 'documents')).toHaveLength(3);
    expect(scores.get(1)).toMatchObject({ score: 0, satisfied: 0, applicable: 450 });
  });
});
