/**
 * Household members (`unit_occupants`): people on file for a unit who have no
 * portal login. Manager-only; the routes gate on residents:write and
 * membership.isAdmin. Every write is audited like a resident change.
 */
import { createScopedClient, logAuditEvent, paginate, unitOccupants } from '@propertypro/db';
import { and, eq, inArray, sql } from '@propertypro/db/filters';
import { ConflictError, NotFoundError } from '@/lib/api/errors';
import { assertUnitInCommunity } from '@/lib/services/scoped-fk-validators';

export interface OccupantRow {
  id: number;
  unitId: number;
  fullName: string;
  email: string | null;
  phone: string | null;
  isOwnerHousehold: boolean;
  updatedAt: string;
}

const FIELDS = ['unitId', 'fullName', 'email', 'phone', 'isOwnerHousehold'] as const;
type Field = (typeof FIELDS)[number];
export type OccupantInput = Pick<OccupantRow, Field>;

function toRow(r: Record<string, unknown>): OccupantRow {
  return {
    id: r['id'] as number,
    unitId: r['unitId'] as number,
    fullName: r['fullName'] as string,
    email: (r['email'] as string | null) ?? null,
    phone: (r['phone'] as string | null) ?? null,
    isOwnerHousehold: r['isOwnerHousehold'] === true,
    updatedAt: new Date(r['updatedAt'] as string | Date).toISOString(),
  };
}

const clean = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

/** One keyset page; the Directory walks every page (walkPaginated), like access requests. */
export async function paginateOccupants(
  communityId: number,
  page: { cursor?: string; pageSize?: number },
): Promise<{ data: OccupantRow[]; pagination: { nextCursor: string | null; hasMore: boolean; pageSize: number } }> {
  const result = await paginate(createScopedClient(communityId), unitOccupants, page);
  return { data: (result.data as Record<string, unknown>[]).map(toRow), pagination: result.pagination };
}

/**
 * Rows for the Directory CSV: just the selected ids (filtered in SQL), or the
 * whole roster walked page by page through the same keyset helper.
 */
export async function listOccupantsForExport(communityId: number, ids?: readonly number[]): Promise<OccupantRow[]> {
  if (ids) {
    if (ids.length === 0) return [];
    const rows = await createScopedClient(communityId).selectFrom(unitOccupants, {}, inArray(unitOccupants.id, [...ids]));
    return (rows as Record<string, unknown>[]).map(toRow);
  }
  const all: OccupantRow[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await paginateOccupants(communityId, { cursor, pageSize: 100 });
    all.push(...page.data);
    if (!page.pagination.hasMore || !page.pagination.nextCursor) return all;
    cursor = page.pagination.nextCursor;
  }
}

/** Live occupants per unit — the delete-unit guard and consistency counts. */
export async function countOccupantsForUnit(communityId: number, unitId: number): Promise<number> {
  const rows = await createScopedClient(communityId).selectFrom(
    unitOccupants,
    { id: unitOccupants.id },
    eq(unitOccupants.unitId, unitId),
  );
  return rows.length;
}

export async function createOccupant(
  communityId: number,
  actorUserId: string,
  input: OccupantInput,
): Promise<OccupantRow> {
  const scoped = createScopedClient(communityId);
  await assertUnitInCommunity(scoped, input.unitId);
  const values = {
    unitId: input.unitId,
    fullName: input.fullName.trim(),
    email: clean(input.email)?.toLowerCase() ?? null,
    phone: clean(input.phone),
    isOwnerHousehold: input.isOwnerHousehold,
  };
  const [row] = (await scoped.insert(unitOccupants, values)) as Record<string, unknown>[];
  const created = toRow(row!);
  await logAuditEvent({
    userId: actorUserId,
    action: 'create',
    resourceType: 'unit_occupant',
    resourceId: String(created.id),
    communityId,
    newValues: values,
  });
  return created;
}

/**
 * Update only what changed. With `expectedUpdatedAt` the write applies only
 * if nobody saved since (millisecond precision, what JSON carries) — the same
 * optimistic-concurrency rule as units and residents.
 */
export async function updateOccupant(
  communityId: number,
  actorUserId: string,
  id: number,
  input: Partial<OccupantInput>,
  expectedUpdatedAt?: string,
): Promise<OccupantRow> {
  const scoped = createScopedClient(communityId);
  const [current] = (await scoped.selectFrom(unitOccupants, {}, eq(unitOccupants.id, id))) as Record<string, unknown>[];
  if (!current) throw new NotFoundError('Household member not found');
  const before = toRow(current);
  if (input.unitId !== undefined) await assertUnitInCommunity(scoped, input.unitId);

  const next: Partial<OccupantInput> = {
    ...(input.unitId !== undefined ? { unitId: input.unitId } : {}),
    ...(input.fullName !== undefined ? { fullName: input.fullName.trim() } : {}),
    ...(input.email !== undefined ? { email: clean(input.email)?.toLowerCase() ?? null } : {}),
    ...(input.phone !== undefined ? { phone: clean(input.phone) } : {}),
    ...(input.isOwnerHousehold !== undefined ? { isOwnerHousehold: input.isOwnerHousehold } : {}),
  };
  const changes = Object.fromEntries(
    Object.entries(next).filter(([k, v]) => before[k as Field] !== v),
  ) as Partial<OccupantInput>;
  if (Object.keys(changes).length === 0) return before;

  const where =
    expectedUpdatedAt === undefined
      ? eq(unitOccupants.id, id)
      : and(
          eq(unitOccupants.id, id),
          sql`date_trunc('milliseconds', ${unitOccupants.updatedAt}) = date_trunc('milliseconds', ${expectedUpdatedAt}::timestamptz)`,
        );
  const [row] = (await scoped.update(unitOccupants, changes, where)) as Record<string, unknown>[];
  if (!row) {
    throw new ConflictError('Someone else changed this household member since you opened them. Reload to see their changes.');
  }
  await logAuditEvent({
    userId: actorUserId,
    action: 'update',
    resourceType: 'unit_occupant',
    resourceId: String(id),
    communityId,
    oldValues: Object.fromEntries(Object.keys(changes).map((k) => [k, before[k as Field]])),
    newValues: changes,
  });
  return toRow(row);
}

export async function removeOccupant(communityId: number, actorUserId: string, id: number): Promise<void> {
  const scoped = createScopedClient(communityId);
  const [current] = (await scoped.selectFrom(unitOccupants, {}, eq(unitOccupants.id, id))) as Record<string, unknown>[];
  if (!current) throw new NotFoundError('Household member not found');
  await scoped.softDelete(unitOccupants, eq(unitOccupants.id, id));
  await logAuditEvent({
    userId: actorUserId,
    action: 'delete',
    resourceType: 'unit_occupant',
    resourceId: String(id),
    communityId,
    oldValues: { unitId: current['unitId'], fullName: current['fullName'] },
  });
}
