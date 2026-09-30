/**
 * Storm-damage report service — scoped DB access for the storm-tools intake.
 *
 * Every function takes an already-scoped client (AGENTS #13). Callers MUST
 * verify storm_damage read/write authorization before invoking; this layer does
 * not authorize. The scoped client applies community scoping AND soft-delete
 * exclusion. It does NOT narrow a non-admin to their own rows: the table's
 * RLS own-rows branch keys on auth.uid(), which the scoped client's
 * privileged connection never sets — so the list takes `reportedBy`.
 *
 * List reads paginate via the canonical `paginate()` helper (ADR-003): a busy
 * community can log many reports after a single storm, so this is not a bounded
 * table like the wind-mitigation locker.
 */
import type { createScopedClient } from '@propertypro/db';
import { documents, paginate, stormDamageReports } from '@propertypro/db';
import type { PaginatedResult } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';

type ScopedClient = ReturnType<typeof createScopedClient>;
type Row = Record<string, unknown>;

/**
 * Page storm-damage reports, newest-first by id. `reportedBy` narrows the page
 * to one reporter — pass it for every non-admin caller.
 */
export async function paginateStormDamageReports(
  scoped: ScopedClient,
  input: { cursor?: string; pageSize?: number; reportedBy?: string },
): Promise<PaginatedResult<Row>> {
  return paginate<Row>(
    scoped,
    stormDamageReports,
    { cursor: input.cursor, pageSize: input.pageSize },
    input.reportedBy === undefined
      ? undefined
      : { where: eq(stormDamageReports.reportedBy, input.reportedBy) },
  );
}

/** Fetch a single report by id inside the caller's scoped community. */
export async function getStormDamageReportById(
  scoped: ScopedClient,
  id: number,
): Promise<Row | null> {
  const rows = await scoped.selectFrom(stormDamageReports, {}, eq(stormDamageReports.id, id));
  return ((rows as unknown as Row[])[0]) ?? null;
}

/**
 * Fetch a document by id inside the caller's scoped community, to validate a
 * referenced photo `documentId` is a real, non-deleted document in the SAME
 * community. Scoping makes a cross-tenant document reference unrepresentable.
 */
export async function getStormDamageDocumentById(
  scoped: ScopedClient,
  id: number,
): Promise<Row | null> {
  const rows = await scoped.selectFrom(documents, {}, eq(documents.id, id));
  return ((rows as unknown as Row[])[0]) ?? null;
}

/**
 * Insert a report in the caller's scoped community. Caller MUST verify
 * storm_damage:write authorization and photo-document ownership first.
 */
export async function createStormDamageReport(
  scoped: ScopedClient,
  values: Record<string, unknown>,
): Promise<Row | undefined> {
  const rows = await scoped.insert(stormDamageReports, values);
  return (rows as unknown as Row[])[0];
}

/**
 * Update a report by id in the caller's scoped community. Used for the
 * admin-only status transition.
 */
export async function updateStormDamageReportById(
  scoped: ScopedClient,
  id: number,
  values: Record<string, unknown>,
): Promise<Row | undefined> {
  const rows = await scoped.update(stormDamageReports, values, eq(stormDamageReports.id, id));
  return (rows as unknown as Row[])[0];
}
