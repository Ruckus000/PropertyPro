/**
 * Household members (`unit_occupants`): people on file for a unit who have no
 * portal login. Manager-only; the routes gate on residents:write and
 * membership.isAdmin.
 *
 * Every write is audited, but name, email and phone never enter the audit
 * log: compliance_audit_log is append-only (DB trigger), so a value written
 * there could never be erased — and household members are often children.
 * Audit entries are built field by field, never spread from the row. Remove
 * hard-deletes for the same reason: a soft-deleted row would keep the PII.
 */
import { createScopedClient, leaseResidents, leases, logAuditEvent, paginate, unitOccupants } from '@propertypro/db';
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

/** Fields whose values are personal contact data: audited by name only. */
const PII_FIELDS: ReadonlySet<Field> = new Set(['fullName', 'email', 'phone']);

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
    newValues: {
      unitId: values.unitId,
      isOwnerHousehold: values.isOwnerHousehold,
      hasEmail: values.email !== null,
      hasPhone: values.phone !== null,
    },
  });
  return created;
}

/**
 * Update only what changed. With `expectedUpdatedAt` the write applies only
 * if nobody saved since (millisecond precision, what JSON carries) — the same
 * optimistic-concurrency rule as units and residents (sound because every
 * scoped write moves `updatedAt` at least 1ms forward).
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
  // ponytail: for name, email and phone the audit records who changed which
  // field and when, not the values — the trade for being able to erase them.
  const changedFields = Object.keys(changes) as Field[];
  const auditable = changedFields.filter((k) => !PII_FIELDS.has(k));
  await logAuditEvent({
    userId: actorUserId,
    action: 'update',
    resourceType: 'unit_occupant',
    resourceId: String(id),
    communityId,
    oldValues: Object.fromEntries(auditable.map((k) => [k, before[k]])),
    newValues: Object.fromEntries(auditable.map((k) => [k, changes[k]])),
    metadata: { changedFields },
  });
  return toRow(row);
}

/**
 * Erasure, not hiding: the row is hard-deleted and the audit keeps only the unit.
 *
 * Refused (409) while a lease on record names this person, current or past
 * (a deleted lease does not count, and its row is removed): a lease is
 * a record of who held the unit, and lease_residents.occupant_id is ON DELETE
 * RESTRICT so the database would refuse anyway. An erasure request for someone
 * on a lease is a records-retention decision for the manager, not a click.
 */
export async function removeOccupant(communityId: number, actorUserId: string, id: number): Promise<void> {
  const scoped = createScopedClient(communityId);
  const [current] = (await scoped.selectFrom(unitOccupants, {}, eq(unitOccupants.id, id))) as Record<string, unknown>[];
  if (!current) throw new NotFoundError('Household member not found');
  const leaseRows = (await scoped.selectFrom(
    leaseResidents,
    { leaseId: leaseResidents.leaseId },
    eq(leaseResidents.occupantId, id),
  )) as Array<{ leaseId: number }>;
  if (leaseRows.length > 0) {
    // The scoped client hides soft-deleted leases, so this finds only leases
    // still on record (cancelled ones included — they are records too).
    const live = await scoped.selectFrom(
      leases,
      { id: leases.id },
      inArray(leases.id, [...new Set(leaseRows.map((r) => r.leaseId))]),
    );
    if (live.length > 0) {
      throw new ConflictError('This person is named on a lease, so they stay on file with it. Take them off the lease in Leases first.');
    }
    // Only deleted leases (entered by mistake, or a rolled-back save) name
    // them: those rows are not records, and the FK would block erasure.
    await scoped.hardDelete(leaseResidents, eq(leaseResidents.occupantId, id));
  }
  await scoped.hardDelete(unitOccupants, eq(unitOccupants.id, id));
  await logAuditEvent({
    userId: actorUserId,
    action: 'delete',
    resourceType: 'unit_occupant',
    resourceId: String(id),
    communityId,
    oldValues: { unitId: current['unitId'] },
  });
}
