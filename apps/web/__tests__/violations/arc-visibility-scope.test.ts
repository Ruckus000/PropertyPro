/**
 * ARC read scope is per UNIT, not per submitter — pinned (#955).
 *
 * On a unit with both an owner and a tenant, each can read the other's ARC
 * submissions. That is the intended scope: an ARC application is a request to
 * alter the PROPERTY, and under a Florida declaration the OWNER is bound by the
 * covenants and liable for unapproved work, so an owner unable to see a request
 * against their own unit would be the actual defect. It also matches how
 * violations scope, which is the adjacent property-scoped feature.
 *
 * The decision was taken explicitly rather than inherited, so it gets a test.
 * Without one, "narrower must be safer" is a very easy change for someone to
 * make later, and it would silently take an owner's visibility of alterations
 * to their own property with it.
 *
 * These tests target `listActorUnitIds`, which is the MECHANISM: it unions
 * role-assigned units with owned units, and that union is precisely what makes
 * an owner and their tenant resolve to the same unit id.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { unitsTable, userRolesTable } = vi.hoisted(() => ({
  // Distinct symbols, not a bare `Symbol` for the whole table: a single opaque
  // token would make every `table.column` assertion below vacuously true.
  unitsTable: { id: Symbol('units.id'), ownerUserId: Symbol('units.owner_user_id') },
  userRolesTable: { unitId: Symbol('user_roles.unit_id'), userId: Symbol('user_roles.user_id') },
}));

vi.mock('@propertypro/db', () => ({
  units: unitsTable,
  userRoles: userRolesTable,
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
}));

import { listActorUnitIds } from '@/lib/units/actor-units';

const OWNER = 'owner-user-id';
const TENANT = 'tenant-user-id';

/**
 * `selectFrom(table, …)` is dispatched on the table so each source can be
 * answered independently — that separation is the whole point of these tests.
 */
function scopedClientReturning(opts: {
  roleAssignedUnitIds?: Array<number | null>;
  ownedUnitIds?: number[];
}) {
  return {
    selectFrom: vi.fn(async (table: unknown) => {
      if (table === userRolesTable) {
        return (opts.roleAssignedUnitIds ?? []).map((unitId) => ({ unitId }));
      }
      if (table === unitsTable) {
        return (opts.ownedUnitIds ?? []).map((id) => ({ id }));
      }
      throw new Error('unexpected table in selectFrom');
    }),
  } as never;
}

describe('ARC/violation unit scope — listActorUnitIds', () => {
  beforeEach(() => vi.clearAllMocks());

  it('unions role-assigned units with OWNED units', async () => {
    // The owner reaches unit 1 through `units.owner_user_id` even with no
    // `user_roles.unit_id` assignment. This union is why an owner sees requests
    // on a unit they let out.
    const ids = await listActorUnitIds(
      scopedClientReturning({ roleAssignedUnitIds: [], ownedUnitIds: [1] }),
      OWNER,
    );

    expect(ids).toEqual([1]);
  });

  it('resolves an owner and their tenant to the SAME unit id', async () => {
    // The pinned behaviour, stated directly: both parties on unit 1 resolve to
    // [1], so both pass `inArray(arcSubmissions.unitId, allowedUnitIds)` and
    // each can read the other's submissions on it.
    const ownerUnits = await listActorUnitIds(
      scopedClientReturning({ ownedUnitIds: [1] }),
      OWNER,
    );
    const tenantUnits = await listActorUnitIds(
      scopedClientReturning({ roleAssignedUnitIds: [1] }),
      TENANT,
    );

    expect(ownerUnits).toEqual([1]);
    expect(tenantUnits).toEqual([1]);
    expect(ownerUnits).toEqual(tenantUnits);
  });

  it('deduplicates a unit that is both role-assigned and owned', async () => {
    // The resident-owner case: seeded demo data attaches owner.one to unit 1
    // through BOTH routes. A duplicate would still work in `inArray`, but it
    // would be noise in every query.
    const ids = await listActorUnitIds(
      scopedClientReturning({ roleAssignedUnitIds: [1], ownedUnitIds: [1] }),
      OWNER,
    );

    expect(ids).toEqual([1]);
  });

  it('drops null unit assignments rather than widening the filter', async () => {
    // A community-wide `user_roles` row carries `unit_id = NULL`. If a null
    // leaked into the array it would poison `inArray` — the failure mode being
    // a filter that matches nothing, or in other drivers everything.
    const ids = await listActorUnitIds(
      scopedClientReturning({ roleAssignedUnitIds: [null, 2], ownedUnitIds: [] }),
      TENANT,
    );

    expect(ids).toEqual([2]);
  });

  it('returns an empty array for a resident attached to no unit', async () => {
    // Callers short-circuit on this: drizzle forbids `inArray(col, [])`, so the
    // ARC list returns an empty envelope instead of querying.
    const ids = await listActorUnitIds(scopedClientReturning({}), TENANT);

    expect(ids).toEqual([]);
  });

  it('never scopes by submitter — the actor id is used only to find units', async () => {
    // Guards the decision itself. If someone later narrows ARC to
    // per-submitter, the natural implementation adds the actor id to the ROW
    // filter; this asserts the actor id reaches only the two unit lookups.
    const client = scopedClientReturning({ roleAssignedUnitIds: [1], ownedUnitIds: [3] });
    await listActorUnitIds(client, OWNER);

    const calls = (client as unknown as { selectFrom: { mock: { calls: unknown[][] } } })
      .selectFrom.mock.calls;
    expect(calls).toHaveLength(2);

    const tables = calls.map((c) => c[0]);
    expect(tables).toContain(userRolesTable);
    expect(tables).toContain(unitsTable);

    // Both predicates key the actor to a unit — one via role, one via
    // ownership. Neither is a submitter filter.
    expect(calls.map((c) => c[2])).toEqual(
      expect.arrayContaining([
        { __eq: { col: userRolesTable.userId, val: OWNER } },
        { __eq: { col: unitsTable.ownerUserId, val: OWNER } },
      ]),
    );
  });
});
