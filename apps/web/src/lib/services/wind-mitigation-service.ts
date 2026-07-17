/**
 * Wind-mitigation report service — scoped DB access for the insurance hub.
 *
 * Every function takes an already-scoped client (AGENTS #13). Callers MUST
 * verify insurance read/write authorization before invoking; this layer does
 * not authorize.
 *
 * The scoped client already applies community scoping AND soft-delete
 * exclusion (buildScopeFilters), and auto-stamps `updatedAt` on update — so
 * none of that is repeated here.
 */
import type { createScopedClient } from '@propertypro/db';
import { documents, windMitigationReports } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';

type ScopedClient = ReturnType<typeof createScopedClient>;

export type WindMitigationRouteRow = Record<string, unknown>;

/**
 * List wind-mitigation reports in the caller's scoped community, soonest-expiring
 * first — the order both boards (what needs re-inspection) and owners (which
 * report is current) care about.
 *
 * Sorted in JS rather than SQL: the row count per community is bounded (one
 * report per building, typically 1-5), so this is not a pagination candidate.
 */
export async function listWindMitigationReportsForCommunity(
  scoped: ScopedClient,
): Promise<WindMitigationRouteRow[]> {
  const rows = (await scoped.query(windMitigationReports)) as WindMitigationRouteRow[];
  return rows.sort((a, b) => String(a.expiresAt).localeCompare(String(b.expiresAt)));
}

/**
 * Fetch a single report by id inside the caller's scoped community.
 */
export async function getWindMitigationReportById(
  scoped: ScopedClient,
  id: number,
): Promise<WindMitigationRouteRow | null> {
  const rows = await scoped.selectFrom(windMitigationReports, {}, eq(windMitigationReports.id, id));
  return ((rows as unknown as WindMitigationRouteRow[])[0]) ?? null;
}

/**
 * Fetch a document by id inside the caller's scoped community, to validate that
 * a report's `documentId` references a real, non-deleted document in the SAME
 * community. Scoping makes a cross-tenant document reference unrepresentable.
 */
export async function getWindMitigationDocumentById(
  scoped: ScopedClient,
  id: number,
): Promise<WindMitigationRouteRow | null> {
  const rows = await scoped.selectFrom(documents, {}, eq(documents.id, id));
  return ((rows as unknown as WindMitigationRouteRow[])[0]) ?? null;
}

/**
 * Insert a report in the caller's scoped community. Caller MUST verify
 * insurance:write authorization and document ownership first.
 */
export async function createWindMitigationReportForCommunity(
  scoped: ScopedClient,
  values: Record<string, unknown>,
): Promise<WindMitigationRouteRow | undefined> {
  const rows = await scoped.insert(windMitigationReports, values);
  return (rows as unknown as WindMitigationRouteRow[])[0];
}

/**
 * Update a report by id in the caller's scoped community.
 */
export async function updateWindMitigationReportById(
  scoped: ScopedClient,
  id: number,
  values: Record<string, unknown>,
): Promise<WindMitigationRouteRow | undefined> {
  const rows = await scoped.update(windMitigationReports, values, eq(windMitigationReports.id, id));
  return (rows as unknown as WindMitigationRouteRow[])[0];
}

/**
 * Soft-delete a report (a superseded inspection). The underlying library
 * document is intentionally left intact — the PDF remains a community record
 * and may still be referenced by the document library's version history.
 */
export async function softDeleteWindMitigationReportById(
  scoped: ScopedClient,
  id: number,
): Promise<WindMitigationRouteRow | undefined> {
  const rows = await scoped.softDelete(windMitigationReports, eq(windMitigationReports.id, id));
  return (rows as unknown as WindMitigationRouteRow[])[0];
}
