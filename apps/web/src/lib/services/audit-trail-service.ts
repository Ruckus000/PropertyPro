/**
 * Audit Trail Service
 *
 * Tenant-scoped reads of `compliance_audit_log` for the read-only viewer
 * at /api/v1/audit-trail. Two paths:
 *
 * - Paginated JSON: cursor-paginated via `paginate()` for the in-app UI.
 * - CSV export: bulk full-fetch (capped at MAX_CSV_ROWS) for downloads.
 *
 * Both paths share the same filter pushdown (action, userId, startDate,
 * endDate). The CSV path keeps its own non-paginated path because
 * exporters need every matching row, not page-sized chunks.
 */
import {
  complianceAuditLog,
  createScopedClient,
  paginate,
} from '@propertypro/db';
import { and, desc, eq, gte, lte } from '@propertypro/db/filters';

export interface AuditTrailFilters {
  action?: string | null;
  userId?: string | null;
  /** Date strings (YYYY-MM-DD) — converted to UTC start-of-day. */
  startDate?: string | null;
  /** Date strings (YYYY-MM-DD) — converted to UTC end-of-day. */
  endDate?: string | null;
}

function buildAuditTrailWhere(filters: AuditTrailFilters) {
  const conditions = [];
  if (filters.action) {
    conditions.push(eq(complianceAuditLog.action, filters.action));
  }
  if (filters.userId) {
    conditions.push(eq(complianceAuditLog.userId, filters.userId));
  }
  if (filters.startDate) {
    const start = new Date(filters.startDate);
    start.setUTCHours(0, 0, 0, 0);
    conditions.push(gte(complianceAuditLog.createdAt, start));
  }
  if (filters.endDate) {
    const end = new Date(filters.endDate);
    end.setUTCHours(23, 59, 59, 999);
    conditions.push(lte(complianceAuditLog.createdAt, end));
  }
  return conditions.length > 0 ? and(...conditions) : undefined;
}

/**
 * Cursor-paginated audit log read for the JSON viewer path.
 *
 * AUTHZ: tenant-scoped — caller MUST have already verified the actor's
 * community membership and `audit:read` permission.
 */
export async function paginateAuditTrail(params: {
  communityId: number;
  cursor?: string;
  pageSize?: number;
  filters: AuditTrailFilters;
}) {
  const where = buildAuditTrailWhere(params.filters);
  const scoped = createScopedClient(params.communityId);
  return paginate(
    scoped,
    complianceAuditLog,
    { cursor: params.cursor, pageSize: params.pageSize },
    { where },
  );
}

/**
 * Full-fetch audit log read for the CSV export path. Caps the result set
 * at `limit` rows; caller should set `X-CSV-Truncated` headers when the
 * returned array length equals the cap.
 *
 * AUTHZ: tenant-scoped — caller MUST have already verified the actor's
 * community membership and `audit:read` permission.
 */
export async function fetchAuditTrailForCsvExport(params: {
  communityId: number;
  filters: AuditTrailFilters;
  limit: number;
}): Promise<Record<string, unknown>[]> {
  const where = buildAuditTrailWhere(params.filters);
  const scoped = createScopedClient(params.communityId);
  return (await scoped
    .selectFrom(complianceAuditLog, {}, where)
    .orderBy(desc(complianceAuditLog.createdAt), desc(complianceAuditLog.id))
    .limit(params.limit)) as unknown as Record<string, unknown>[];
}
