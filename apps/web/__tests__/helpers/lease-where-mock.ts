// Pure helpers — no vi.fn() calls. Lets a scoped-client double apply the WHERE
// a lease read was built with (PAG-04 runs lease filters in SQL), so a test
// fixture behaves like Postgres instead of returning every row.
//
// Use from a test:
//   vi.mock('@propertypro/db/filters', async (orig) =>
//     (await import('../helpers/lease-where-mock')).leaseFiltersMock(await orig()));
// and give the mocked `leases` table LEASE_COLUMNS so column refs are field names.

export type LeasePred =
  | { op: 'eq' | 'ne' | 'lte' | 'lt' | 'gte' | 'gt'; col: unknown; val: unknown }
  | { op: 'isNull' | 'isNotNull'; col: unknown }
  | { op: 'inArray'; col: unknown; vals: unknown[] }
  | { op: 'sql'; text: string; values: unknown[] }
  | { op: 'and' | 'or'; args: Array<LeasePred | undefined> };

export const LEASE_COLUMNS = {
  id: 'id',
  unitId: 'unitId',
  residentId: 'residentId',
  status: 'status',
  startDate: 'startDate',
  endDate: 'endDate',
  previousLeaseId: 'previousLeaseId',
  transferredFromLeaseId: 'transferredFromLeaseId',
  idempotencyKey: 'idempotencyKey',
  deletedAt: 'deletedAt',
} as const;

export function leaseFiltersMock(original: object) {
  return {
    ...original,
    eq: (col: unknown, val: unknown) => ({ op: 'eq', col, val }),
    ne: (col: unknown, val: unknown) => ({ op: 'ne', col, val }),
    lte: (col: unknown, val: unknown) => ({ op: 'lte', col, val }),
    lt: (col: unknown, val: unknown) => ({ op: 'lt', col, val }),
    gte: (col: unknown, val: unknown) => ({ op: 'gte', col, val }),
    gt: (col: unknown, val: unknown) => ({ op: 'gt', col, val }),
    isNull: (col: unknown) => ({ op: 'isNull', col }),
    isNotNull: (col: unknown) => ({ op: 'isNotNull', col }),
    inArray: (col: unknown, vals: unknown[]) => ({ op: 'inArray', col, vals }),
    sql: (s: TemplateStringsArray, ...values: unknown[]) => ({ op: 'sql', text: s.join('?'), values }),
    and: (...args: unknown[]) => ({ op: 'and', args }),
    or: (...args: unknown[]) => ({ op: 'or', args }),
    desc: (col: unknown) => ({ dir: 'desc', col }),
    asc: (col: unknown) => ({ dir: 'asc', col }),
  };
}

/**
 * Applies a WHERE to one lease row. Raw `sql` on a lease read is either the
 * co-tenant half of the party scope (values: lease id column, community id,
 * actor id), answered from the lease_residents fixture, or the expiring
 * list's "no signed renewal" NOT EXISTS, answered from the lease rows — both
 * as Postgres would.
 */
export function leaseMatches(
  node: LeasePred | undefined,
  row: Record<string, unknown>,
  residents: Array<Record<string, unknown>>,
  allLeases: Array<Record<string, unknown>> = [],
): boolean {
  if (!node) return true;
  const v = (col: unknown) => row[col as string];
  switch (node.op) {
    case 'eq': return v(node.col) === node.val;
    case 'ne': return v(node.col) !== node.val;
    case 'lte': return v(node.col) != null && String(v(node.col)) <= String(node.val);
    case 'lt': return v(node.col) != null && String(v(node.col)) < String(node.val);
    case 'gte': return v(node.col) != null && String(v(node.col)) >= String(node.val);
    case 'gt': return v(node.col) != null && String(v(node.col)) > String(node.val);
    case 'isNull': return v(node.col) == null;
    case 'isNotNull': return v(node.col) != null;
    case 'inArray': return node.vals.includes(v(node.col));
    case 'sql': {
      if (node.text.includes('previous_lease_id')) {
        return !allLeases.some((l) => l['previousLeaseId'] === row['id'] && l['status'] === 'active');
      }
      const actor = node.values[2];
      return residents.some((r) => r['leaseId'] === row['id'] && r['userId'] === actor && r['removedOn'] == null);
    }
    case 'and': return node.args.every((a) => leaseMatches(a, row, residents, allLeases));
    case 'or': return node.args.some((a) => leaseMatches(a, row, residents, allLeases));
  }
}

/** A thenable stand-in for the Drizzle select builder: orderBy/limit chain, WHERE applied to lease rows only. */
export function leaseSelectBuilder(
  rowsFor: () => Promise<unknown[]>,
  isLeases: boolean,
  where: LeasePred | undefined,
  residents: () => Array<Record<string, unknown>>,
) {
  let limit: number | undefined;
  const builder = {
    orderBy: () => builder,
    limit: (n: number) => {
      limit = n;
      return builder;
    },
    then: <R>(resolve: (rows: unknown[]) => R, reject?: (err: unknown) => R) =>
      rowsFor()
        .then((rows) => {
          if (!isLeases) return rows;
          const all = rows as Array<Record<string, unknown>>;
          const out = all.filter((r) => leaseMatches(where, r, residents(), all));
          return limit === undefined ? out : out.slice(0, limit);
        })
        .then(resolve, reject),
  };
  return builder;
}
