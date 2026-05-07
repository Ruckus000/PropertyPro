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
import {
  createScopedClient,
  complianceAuditLog,
  paginate,
} from '@propertypro/db';
import { and, desc, eq, gte, lte } from '@propertypro/db/filters';
import { withErrorHandler } from '@/lib/api/error-handler';
import { BadRequestError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { generateCSV } from '@/lib/services/csv-export';
import { requirePermission } from '@/lib/db/access-control';
import { resolveUserDisplayNames } from '@/lib/utils/resolve-users';

/** Maximum rows for CSV export to prevent OOM on large datasets. */
const MAX_CSV_ROWS = 10_000;

/**
 * Sensitive key patterns (case-insensitive) to redact from metadata before export/display.
 * Matches any key that contains these substrings.
 */
const SENSITIVE_KEY_PATTERNS = [
  'token',
  'secret',
  'password',
  'apikey',
  'api_key',
  'authorization',
  'cookie',
  'signature',
  'signedurl',
  'signed_url',
];

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((pattern) => lower.includes(pattern));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface AuditLogRow {
  id: number;
  userId: string | null;
  communityId: number;
  action: string;
  resourceType: string;
  resourceId: string;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

function coerceAuditRow(row: Record<string, unknown>): AuditLogRow {
  return {
    id: row['id'] as number,
    userId: (row['userId'] as string | null) ?? null,
    communityId: row['communityId'] as number,
    action: row['action'] as string,
    resourceType: row['resourceType'] as string,
    resourceId: row['resourceId'] as string,
    oldValues: (row['oldValues'] as Record<string, unknown> | null) ?? null,
    newValues: (row['newValues'] as Record<string, unknown> | null) ?? null,
    metadata: (row['metadata'] as Record<string, unknown> | null) ?? null,
    createdAt: row['createdAt'] as Date,
  };
}

/**
 * Recursively redact sensitive keys from a metadata object before export/display.
 * Applies case-insensitive substring matching for key detection.
 */
function redactMetadata(metadata: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!metadata) return null;
  return redactValue(metadata) as Record<string, unknown>;
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const redacted: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (isSensitiveKey(key)) {
        redacted[key] = '[REDACTED]';
      } else {
        redacted[key] = redactValue(val);
      }
    }
    return redacted;
  }
  return value;
}

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

  // --- Pagination params (validated; paginate() clamps pageSize to [1, 100]) ---
  const cursor = searchParams.get('cursor') ?? undefined;
  const rawLimit = searchParams.get('limit');
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
  const conditions: ReturnType<typeof eq>[] = [];

  const actionFilter = searchParams.get('action');
  if (actionFilter) {
    conditions.push(eq(complianceAuditLog.action, actionFilter));
  }

  const userIdFilter = searchParams.get('userId');
  if (userIdFilter) {
    conditions.push(eq(complianceAuditLog.userId, userIdFilter));
  }

  const startDate = searchParams.get('startDate');
  if (startDate) {
    const start = new Date(startDate);
    start.setUTCHours(0, 0, 0, 0);
    conditions.push(gte(complianceAuditLog.createdAt, start));
  }

  const endDate = searchParams.get('endDate');
  if (endDate) {
    const end = new Date(endDate);
    end.setUTCHours(23, 59, 59, 999);
    conditions.push(lte(complianceAuditLog.createdAt, end));
  }

  const additionalWhere = conditions.length > 0 ? and(...conditions) : undefined;

  const scoped = createScopedClient(communityId);

  // --- CSV Export: fetch all matching rows from DB (no cursor pagination) ---
  const format = searchParams.get('format');
  if (format === 'csv') {
    const csvRawRows = await scoped
      .selectFrom(complianceAuditLog, {}, additionalWhere)
      .orderBy(desc(complianceAuditLog.createdAt), desc(complianceAuditLog.id))
      .limit(MAX_CSV_ROWS);
    const auditRows = (csvRawRows as unknown as Record<string, unknown>[]).map(coerceAuditRow);

    const csvHeaders = [
      { key: 'id', label: 'ID' },
      { key: 'createdAt', label: 'Timestamp' },
      { key: 'action', label: 'Action' },
      { key: 'resourceType', label: 'Resource Type' },
      { key: 'resourceId', label: 'Resource ID' },
      { key: 'userId', label: 'User ID' },
      { key: 'metadata', label: 'Metadata' },
    ];

    const csvRows = auditRows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      action: row.action,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      userId: row.userId ?? 'System',
      metadata: row.metadata ? JSON.stringify(redactMetadata(row.metadata)) : '',
    }));

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
  const result = await paginate(scoped, complianceAuditLog, { cursor, pageSize }, {
    where: additionalWhere,
  });
  const auditRows = (result.data as unknown as Record<string, unknown>[]).map(coerceAuditRow);

  // Redact sensitive keys in metadata, oldValues, and newValues
  const redactedPage = auditRows.map((row) => ({
    ...row,
    oldValues: redactMetadata(row.oldValues),
    newValues: redactMetadata(row.newValues),
    metadata: redactMetadata(row.metadata),
  }));

  // Load user display names for this page
  const userIds = auditRows.flatMap((row) => (row.userId ? [row.userId] : []));
  const userNames = await resolveUserDisplayNames(communityId, userIds);

  return NextResponse.json({
    data: {
      data: redactedPage,
      pagination: result.pagination,
      users: Object.fromEntries(userNames),
    },
  });
});
