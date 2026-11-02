/**
 * Audit Trail API — read-only viewer for compliance_audit_log entries (P3-53).
 *
 * Patterns:
 * - withErrorHandler for structured error responses
 * - createScopedClient for tenant isolation (AGENTS #13)
 * - Cursor-based pagination via the canonical `paginate()` helper from
 *   `@propertypro/db` (Plan B3; ADR-003 / Plan A2)
 * - CSV export via ?format=csv query parameter — keeps its own MAX_CSV_ROWS
 *   path because exporters need every matching row, not page-sized chunks
 * - Formula-injection sanitization on CSV cells
 * - Read-only: no POST/PATCH/DELETE routes
 * - Admin-only: owner/tenant roles are denied
 *
 * Response envelope (JSON path) is double-wrapped per the paginated-route
 * contract:
 *
 *     { data: { data: AuditLogRow[], pagination: { nextCursor, hasMore, pageSize }, users: { [id]: name } } }
 *
 * `users` lives inside the inner `data` object so the entire payload unwraps
 * via `requestJson<{ data, pagination, users }>` in one hop. See
 * `apps/web/src/lib/api/request-json.ts` for the envelope rules.
 *
 * Behavioral changes from the previous custom implementation:
 * - Cursor format: was composite base64(`{createdAt, id}`), now opaque
 *   base64url(`{id}`) issued by `paginate()`. Old cursors with extra
 *   `createdAt` fields still decode (the helper ignores unknown keys).
 *   Sort order is `id DESC`; for `compliance_audit_log` (`bigserial id`,
 *   monotonic) this is equivalent to the old `(createdAt DESC, id DESC)`
 *   composite ordering.
 * - Limit upper bound: was 200, now clamps silently to MAX_PAGE_SIZE (100)
 *   per the paginate contract.
 * - Invalid cursors: was 400, now silently treated as "first page" (per the
 *   paginate contract — stale cursors from old clients shouldn't 400).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { BadRequestError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { generateCSV } from '@/lib/services/csv-export';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { requirePermission } from '@/lib/db/access-control';
import { resolveUserDisplayNames } from '@/lib/utils/resolve-users';
import {
  countHiddenRoutineEntries,
  fetchAuditTrailForCsvExport,
  paginateAuditTrail,
  resolveAuditResourceNames,
  scopeResourceType,
  type AuditTrailFilters,
} from '@/lib/services/audit-trail-service';
import {
  AuditQueryError,
  hasAuditQuery,
  parseAuditQuery,
  periodStartDate,
  type AuditQueryState,
} from '@/lib/audit/audit-query';
import { auditUserIds, coerceAuditRow, redactMetadata, toRedactedEntry } from '@/lib/audit/redact';
import { describeAuditEvent, knownUserName } from '@/lib/audit/describe-event';
import { resourceKey } from '@/lib/audit/types';

/** Maximum rows for CSV export to prevent OOM on large datasets. */
const MAX_CSV_ROWS = 10_000;

// ---------------------------------------------------------------------------
// GET — List audit trail entries with cursor pagination + CSV export
// ---------------------------------------------------------------------------

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const { searchParams } = new URL(req.url);

  const rawCommunityId = searchParams.get('communityId');
  if (!rawCommunityId) {
    throw new BadRequestError('communityId query parameter is required');
  }

  const parsedCommunityId = Number(rawCommunityId);
  if (!Number.isInteger(parsedCommunityId) || parsedCommunityId <= 0) {
    throw new BadRequestError('communityId must be a positive integer');
  }

  const communityId = resolveEffectiveCommunityId(req, parsedCommunityId);
  const membership = await requireCommunityMembership(communityId, actorUserId);
  requirePermission(membership, 'audit', 'read');
  // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
  await requireEntitledForAdminRead(communityId, membership);

  // --- Pagination params (validated; paginate() clamps pageSize to [1, 100]) ---
  // Use `||` to collapse empty-string params to undefined/null. paginate's
  // own decodeCursor guards against empty cursors, but limit parsing would
  // otherwise see `Number("") === 0` and 400 with "must be a positive integer"
  // when a caller sends `?limit=`.
  const cursor = searchParams.get('cursor') || undefined;
  const rawLimit = searchParams.get('limit') || null;
  let pageSize: number | undefined;

  if (rawLimit !== null) {
    const parsedLimit = Number(rawLimit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1) {
      throw new BadRequestError('limit must be a positive integer');
    }
    pageSize = parsedLimit;
    // No upper-bound 400: paginate() clamps to MAX_PAGE_SIZE silently.
  }

  // --- Build DB-level WHERE clause from filters (cursor predicate is built by paginate) ---
  // The page's vocabulary (view, period, person, entity, item). Callers that
  // send none of it — the compliance activity feed — keep the old behaviour:
  // no view filter and no date bound.
  const get = (key: string) => searchParams.get(key) || null;
  let query: AuditQueryState | null = null;
  if (hasAuditQuery(get)) {
    try {
      query = parseAuditQuery(get);
    } catch (err) {
      if (err instanceof AuditQueryError) throw new BadRequestError(err.message);
      throw err;
    }
  }

  const filters: AuditTrailFilters = {
    action: searchParams.get('action'),
    userId: searchParams.get('userId'),
    startDate: searchParams.get('startDate') ?? (query ? periodStartDate(query.period) : null),
    endDate: searchParams.get('endDate'),
    view: query?.view ?? null,
    scope: query?.scope ?? null,
  };

  // --- CSV Export: fetch all matching rows from DB (no cursor pagination) ---
  const format = searchParams.get('format');
  if (format === 'csv') {
    const csvRawRows = await fetchAuditTrailForCsvExport({
      communityId,
      filters,
      limit: MAX_CSV_ROWS,
    });
    const auditRows = csvRawRows.map(coerceAuditRow);

    const csvHeaders = [
      { key: 'id', label: 'ID' },
      { key: 'createdAt', label: 'Timestamp' },
      { key: 'action', label: 'Action' },
      { key: 'resourceType', label: 'Resource Type' },
      { key: 'resourceId', label: 'Resource ID' },
      { key: 'userId', label: 'User ID' },
      { key: 'metadata', label: 'Metadata' },
      { key: 'who', label: 'Who' },
      { key: 'summary', label: 'What happened' },
    ];

    // Plain-language columns, so the file reads without a data dictionary.
    const csvEntries = auditRows.map(toRedactedEntry);
    const [csvUsers, csvResources] = await Promise.all([
      resolveUserDisplayNames(communityId, auditUserIds(csvEntries)),
      resolveAuditResourceNames(communityId, csvEntries),
    ]);
    const describeCtx = {
      users: Object.fromEntries(csvUsers),
      resources: csvResources,
      timeZone: membership.timezone,
    };

    const csvRows = auditRows.map((row, i) => {
      const described = describeAuditEvent(csvEntries[i]!, describeCtx);
      return {
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      action: row.action,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      userId: row.userId ?? 'System',
      metadata: row.metadata ? JSON.stringify(redactMetadata(row.metadata)) : '',
      who: described.actor.viaSupport ? `PropertyPro support (signed in as ${described.actor.name})` : described.actor.name,
      summary: described.sentence,
      };
    });

    const csv = generateCSV(csvHeaders, csvRows);

    const responseHeaders: Record<string, string> = {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="audit-trail-${communityId}.csv"`,
    };
    if (auditRows.length === MAX_CSV_ROWS) {
      responseHeaders['X-CSV-Truncated'] = 'true';
      responseHeaders['X-CSV-Max-Rows'] = String(MAX_CSV_ROWS);
    }

    return new NextResponse(csv, { status: 200, headers: responseHeaders });
  }

  // --- Paginated JSON path: delegate to paginate() ---
  const result = await paginateAuditTrail({ communityId, cursor, pageSize, filters });
  const auditRows = (result.data as unknown as Record<string, unknown>[]).map(coerceAuditRow);

  // Redact sensitive keys in metadata, oldValues, and newValues
  const redactedPage = auditRows.map(toRedactedEntry);

  const scope = filters.scope ?? null;
  const scopeItem =
    scope?.kind === 'item' ? [{ resourceType: scopeResourceType(scope), resourceId: scope.resourceId }] : [];
  const userIds = auditUserIds(redactedPage);
  if (scope?.kind === 'person') userIds.push(scope.userId);

  const [userNames, resources, hiddenRoutineCount] = await Promise.all([
    // Names for actors and for the people access changes were about
    resolveUserDisplayNames(communityId, userIds),
    resolveAuditResourceNames(communityId, [...redactedPage, ...scopeItem]),
    // Only the first page carries the count; it doesn't change while paging.
    filters.view === 'important' && !cursor
      ? countHiddenRoutineEntries({ communityId, filters })
      : Promise.resolve(null),
  ]);
  const users = Object.fromEntries(userNames);

  let scopeLabel: string | null = null;
  if (scope?.kind === 'person') scopeLabel = knownUserName(users, scope.userId) ?? 'A former member';
  if (scope?.kind === 'item') scopeLabel = resources[resourceKey(scopeResourceType(scope), scope.resourceId)]?.name ?? null;

  return NextResponse.json({
    data: {
      data: redactedPage,
      pagination: result.pagination,
      users,
      resources,
      hiddenRoutineCount,
      scopeLabel,
    },
  });
});
