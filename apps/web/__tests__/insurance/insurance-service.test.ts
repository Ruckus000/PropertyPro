/**
 * insurance-service list reads (roadmap 3.7, PAG-06).
 *
 * Both lists used to be `scoped.query(<table>)` — every row for the community —
 * sorted in JS. They now sort and cap in SQL. The fake scoped client below
 * REFUSES a whole-table `query()` and evaluates the recorded
 * `selectFrom(...).orderBy(...).limit(...)` chain over an in-memory row set, so
 * these tests pin both the SQL shape and the rows it yields.
 */
import { describe, expect, it, vi } from 'vitest';

const { tables } = vi.hoisted(() => ({
  tables: {
    insurancePolicies: {
      __table: 'insurance_policies',
      id: { __col: 'id' },
      expiresAt: { __col: 'expiresAt' },
    },
    insuranceCertificateRequests: {
      __table: 'insurance_certificate_requests',
      id: { __col: 'id' },
      createdAt: { __col: 'createdAt' },
    },
    documents: { __table: 'documents', id: { __col: 'id' } },
    users: { __table: 'users', id: { __col: 'id' } },
  },
}));

vi.mock('@propertypro/db', () => ({
  documents: tables.documents,
  insuranceCertificateRequests: tables.insuranceCertificateRequests,
  insurancePolicies: tables.insurancePolicies,
  users: tables.users,
}));

vi.mock('@propertypro/db/filters', () => ({
  asc: (col: { __col: string }) => ({ dir: 'asc', col }),
  desc: (col: { __col: string }) => ({ dir: 'desc', col }),
  eq: (col: unknown, val: unknown) => ({ eq: { col, val } }),
}));

import {
  CERTIFICATE_REQUEST_LIST_CAP,
  INSURANCE_POLICY_LIST_CAP,
  listCertificateRequests,
  listInsurancePolicies,
} from '../../src/lib/services/insurance-service';

type Row = Record<string, unknown>;
type Order = { dir: 'asc' | 'desc'; col: { __col: string } };

function compareValues(a: unknown, b: unknown): number {
  const av = a instanceof Date ? a.getTime() : a;
  const bv = b instanceof Date ? b.getTime() : b;
  if (typeof av === 'number' && typeof bv === 'number') return av - bv;
  return String(av) < String(bv) ? -1 : String(av) > String(bv) ? 1 : 0;
}

/** A scoped client whose selectFrom chain behaves like the SQL it records. */
function fakeScoped(rowsByTable: Map<unknown, Row[]>) {
  const calls: Array<{ table: unknown; where: unknown; orderBy: Order[]; limit: number | null }> = [];
  const scoped = {
    query: vi.fn(async () => {
      throw new Error('whole-table query() read (PAG-06 regression)');
    }),
    selectFrom: vi.fn((table: unknown, _columns: unknown, where?: unknown) => {
      const call = { table, where, orderBy: [] as Order[], limit: null as number | null };
      calls.push(call);
      const evaluate = () => {
        const rows = [...(rowsByTable.get(table) ?? [])].sort((a, b) => {
          for (const o of call.orderBy) {
            const c = compareValues(a[o.col.__col], b[o.col.__col]);
            if (c !== 0) return o.dir === 'asc' ? c : -c;
          }
          return 0;
        });
        return call.limit === null ? rows : rows.slice(0, call.limit);
      };
      const builder = {
        orderBy: (...cols: Order[]) => {
          call.orderBy.push(...cols);
          return builder;
        },
        limit: (n: number) => {
          call.limit = n;
          return builder;
        },
        then: <R1, R2 = never>(
          onFulfilled?: (rows: Row[]) => R1 | PromiseLike<R1>,
          onRejected?: (e: unknown) => R2 | PromiseLike<R2>,
        ) => Promise.resolve().then(evaluate).then(onFulfilled, onRejected),
      };
      return builder;
    }),
  };
  return { scoped, calls };
}

describe('listInsurancePolicies', () => {
  const policies: Row[] = [
    { id: 4, policyType: 'flood', expiresAt: '2027-03-01' },
    { id: 1, policyType: 'master', expiresAt: '2026-11-15' },
    { id: 9, policyType: 'wind', expiresAt: '2026-11-15' },
    { id: 2, policyType: 'd_and_o', expiresAt: '2026-10-01' },
  ];

  it('orders by expires_at ASC, id ASC and caps in SQL — no whole-table read', async () => {
    const { scoped, calls } = fakeScoped(new Map([[tables.insurancePolicies, policies]]));

    const result = await listInsurancePolicies(scoped as never);

    expect(scoped.query).not.toHaveBeenCalled();
    expect(calls).toEqual([
      {
        table: tables.insurancePolicies,
        where: undefined,
        orderBy: [
          { dir: 'asc', col: tables.insurancePolicies.expiresAt },
          { dir: 'asc', col: tables.insurancePolicies.id },
        ],
        limit: INSURANCE_POLICY_LIST_CAP,
      },
    ]);
    expect(INSURANCE_POLICY_LIST_CAP).toBe(500);
    expect(result.map((r) => r.id)).toEqual([2, 1, 9, 4]);
  });

  it('yields the same order the old JS sort produced (date strings sort lexically)', async () => {
    const { scoped } = fakeScoped(new Map([[tables.insurancePolicies, policies]]));
    const result = await listInsurancePolicies(scoped as never);

    const legacy = [...policies].sort((a, b) =>
      String(a.expiresAt).localeCompare(String(b.expiresAt)),
    );
    expect(result.map((r) => r.expiresAt)).toEqual(legacy.map((r) => r.expiresAt));
  });
});

describe('listCertificateRequests', () => {
  // Chosen so chronological order and the old `String(Date)` order disagree:
  // String(date) starts with the weekday name, so the legacy comparator sorted
  // "Wed…" before "Tue…" before "Mon…" regardless of the actual dates.
  const requests: Row[] = [
    { id: 1, createdAt: new Date('2026-09-28T12:00:00Z') }, // Mon
    { id: 2, createdAt: new Date('2026-09-02T12:00:00Z') }, // Wed
    { id: 3, createdAt: new Date('2026-09-29T12:00:00Z') }, // Tue
    { id: 4, createdAt: new Date('2026-09-29T12:00:00Z') }, // Tue, same instant as id 3
  ];

  it('orders by created_at DESC, id DESC and caps in SQL — no whole-table read', async () => {
    const { scoped, calls } = fakeScoped(
      new Map([[tables.insuranceCertificateRequests, requests]]),
    );

    const result = await listCertificateRequests(scoped as never);

    expect(scoped.query).not.toHaveBeenCalled();
    expect(calls).toEqual([
      {
        table: tables.insuranceCertificateRequests,
        where: undefined,
        orderBy: [
          { dir: 'desc', col: tables.insuranceCertificateRequests.createdAt },
          { dir: 'desc', col: tables.insuranceCertificateRequests.id },
        ],
        limit: CERTIFICATE_REQUEST_LIST_CAP,
      },
    ]);
    expect(CERTIFICATE_REQUEST_LIST_CAP).toBe(500);
    // Newest first, id breaking the tie.
    expect(result.map((r) => r.id)).toEqual([4, 3, 1, 2]);
  });

  it('returns only the newest CERTIFICATE_REQUEST_LIST_CAP rows when there are more', async () => {
    const many: Row[] = Array.from({ length: CERTIFICATE_REQUEST_LIST_CAP + 3 }, (_, i) => ({
      id: i + 1,
      createdAt: new Date(Date.UTC(2026, 0, 1) + i * 60_000),
    }));
    const { scoped } = fakeScoped(new Map([[tables.insuranceCertificateRequests, many]]));

    const result = await listCertificateRequests(scoped as never);

    expect(result).toHaveLength(CERTIFICATE_REQUEST_LIST_CAP);
    expect(result[0]!.id).toBe(CERTIFICATE_REQUEST_LIST_CAP + 3);
    expect(result.at(-1)!.id).toBe(4);
  });
});
