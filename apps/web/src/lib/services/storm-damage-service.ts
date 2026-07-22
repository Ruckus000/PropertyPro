/**
 * Storm-damage report service — scoped DB access for the storm-tools intake.
 *
 * Every function takes an already-scoped client (AGENTS #13). Callers MUST
 * verify storm_damage read/write authorization before invoking; this layer does
 * not authorize. The scoped client applies community scoping AND soft-delete
 * exclusion, and RLS additionally scopes non-admin actors to their own rows
 * (reported_by = auth.uid()), so neither is repeated here.
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
 * Page storm-damage reports the caller may see (RLS scopes non-admins to their
 * own rows, admin-tier to all), newest-first by id.
 */
export async function paginateStormDamageReports(
  scoped: ScopedClient,
  input: { cursor?: string; pageSize?: number },
): Promise<PaginatedResult<Row>> {
  return paginate<Row>(scoped, stormDamageReports, {
    cursor: input.cursor,
    pageSize: input.pageSize,
  });
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
