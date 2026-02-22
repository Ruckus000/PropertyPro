/**
 * Audit Trail API — read-only viewer for compliance_audit_log entries (P3-53).
 *
 * Patterns:
 * - withErrorHandler for structured error responses
 * - createScopedClient for tenant isolation (AGENTS #13)
 * - Cursor-based pagination ordered by (createdAt DESC, id DESC)
 * - CSV export via ?format=csv query parameter
 * - Formula-injection sanitization on CSV cells
 * - Read-only: no POST/PATCH/DELETE routes
 * - Admin-only: owner/tenant roles are denied
 */
import { NextResponse, type NextRequest } from 'next/server';
import {
  createScopedClient,
  complianceAuditLog,
  userRoles,
} from '@propertypro/db';
import { and, desc, eq, gte, inArray, lte, sql } from '@propertypro/db/filters';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError, ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { generateCSV } from '@/lib/services/csv-export';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Roles allowed to view the audit trail (community admins). */
const ADMIN_ROLES = new Set([
  'board_member',
  'board_president',
  'cam',
  'site_manager',
  'property_manager_admin',
]);

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

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

function requireAdminRole(role: string): void {
  if (!ADMIN_ROLES.has(role)) {
    throw new ForbiddenError('Only community administrators can view the audit trail');
  }
}

interface AuditLogRow {
  id: number;
  userId: string;
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
    userId: row['userId'] as string,
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

/**
 * Decode a cursor string to { createdAt, id }.
 */
function decodeCursor(cursor: string): { createdAt: Date; id: number } | null {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8')) as {
      createdAt?: unknown;
      id?: unknown;
    };
    if (typeof decoded.createdAt !== 'string') {
      return null;
    }
    if (!Number.isInteger(decoded.id) || (decoded.id as number) <= 0) {
      return null;
    }
    const createdAt = new Date(decoded.createdAt);
    if (Number.isNaN(createdAt.getTime())) {
      return null;
    }
    return {
      createdAt,
      id: decoded.id as number,
    };
  } catch {
    return null;
  }
}

/**
 * Encode a cursor from a row's createdAt and id.
 */
function encodeCursor(row: AuditLogRow): string {
  return Buffer.from(
    JSON.stringify({ createdAt: row.createdAt.toISOString(), id: row.id }),
  ).toString('base64');
}

/**
 * Load user display names for a set of userIds within a community.
 * Uses scoped user_roles to get community-specific user IDs, then matches.
 */
async function loadUserDisplayNames(
  communityId: number,
  userIds: Set<string>,
): Promise<Map<string, string>> {
  if (userIds.size === 0) return new Map();

  const scoped = createScopedClient(communityId);
  const roleRows = await scoped.selectFrom(userRoles, {}, inArray(userRoles.userId, [...userIds]));

  const nameMap = new Map<string, string>();
  for (const row of roleRows as unknown as Record<string, unknown>[]) {
    const userId = row['userId'] as string;
    // Use userId as fallback display name (actual name lookup would require users table)
    nameMap.set(userId, userId.substring(0, 8));
  }

  return nameMap;
}

// ---------------------------------------------------------------------------
// GET — List audit trail entries with cursor pagination + CSV export
// ---------------------------------------------------------------------------

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const { searchParams } = new URL(req.url);

  const rawCommunityId = searchParams.get('communityId');
  if (!rawCommunityId) {
    throw new ValidationError('communityId query parameter is required');
  }

  const parsedCommunityId = Number(rawCommunityId);
  if (!Number.isInteger(parsedCommunityId) || parsedCommunityId <= 0) {
    throw new ValidationError('communityId must be a positive integer');
  }

  const communityId = resolveEffectiveCommunityId(req, parsedCommunityId);
  const membership = await requireCommunityMembership(communityId, actorUserId);
  requireAdminRole(membership.role);

  // --- Cursor-based pagination params (validated before DB query) ---
  const cursor = searchParams.get('cursor');
  const rawLimit = searchParams.get('limit');
  let limit = DEFAULT_PAGE_SIZE;

  if (rawLimit !== null) {
    const parsedLimit = Number(rawLimit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > MAX_PAGE_SIZE) {
      throw new ValidationError(
        `limit must be an integer between 1 and ${MAX_PAGE_SIZE}`,
      );
    }
    limit = parsedLimit;
  }

  // --- Build DB-level WHERE clause from filters ---
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

  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (!decoded) {
      throw new ValidationError('Invalid cursor value');
    }
    // Compound cursor: (created_at, id) < (cursor.createdAt, cursor.id) in DESC order
    conditions.push(
      sql`(${complianceAuditLog.createdAt}, ${complianceAuditLog.id}) < (${decoded.createdAt.toISOString()}::timestamptz, ${decoded.id})`,
    );
  }

  const additionalWhere = conditions.length > 0 ? and(...conditions) : undefined;

  const scoped = createScopedClient(communityId);

  // --- CSV Export: fetch all matching rows from DB ---
  const format = searchParams.get('format');
  if (format === 'csv') {
    const csvRawRows = await scoped
      .selectFrom(complianceAuditLog, {}, additionalWhere)
      .orderBy(desc(complianceAuditLog.createdAt), desc(complianceAuditLog.id));
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
      userId: row.userId,
      metadata: row.metadata ? JSON.stringify(redactMetadata(row.metadata)) : '',
    }));

    const csv = generateCSV(csvHeaders, csvRows);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="audit-trail-${communityId}.csv"`,
      },
    });
  }

  // --- Paginated query: fetch limit+1 rows to detect hasMore ---
  const rawRows = await scoped
    .selectFrom(complianceAuditLog, {}, additionalWhere)
    .orderBy(desc(complianceAuditLog.createdAt), desc(complianceAuditLog.id))
    .limit(limit + 1);
  const auditRows = (rawRows as unknown as Record<string, unknown>[]).map(coerceAuditRow);

  const hasMore = auditRows.length > limit;
  const page = auditRows.slice(0, limit);
  const lastEntry = page[page.length - 1];
  const nextCursor = lastEntry && hasMore ? encodeCursor(lastEntry) : null;

  // Redact metadata in API response
  const redactedPage = page.map((row) => ({
    ...row,
    metadata: redactMetadata(row.metadata),
  }));

  // Load user display names for this page
  const userIds = new Set(page.map((r) => r.userId));
  const userNames = await loadUserDisplayNames(communityId, userIds);

  return NextResponse.json({
    data: redactedPage,
    pagination: {
      nextCursor,
      hasMore,
      pageSize: limit,
    },
    users: Object.fromEntries(userNames),
  });
});
