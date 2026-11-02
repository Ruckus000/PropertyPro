/**
 * Audit Trail Service
 *
 * Tenant-scoped reads of `compliance_audit_log` for the audit trail page
 * (`/api/v1/audit-trail`), its CSV download and its printable record. Paths:
 *
 * - Paginated JSON: cursor-paginated via `paginate()` for the in-app list.
 * - Full fetch: capped bulk read for the CSV download and the print view.
 * - Count: how many routine entries the Important view hid.
 * - Names: item titles for the rows on a page, and the label of a scope.
 *
 * Every path shares one filter pushdown (`buildAuditTrailWhere`). The view
 * rules ("Important", "Deleted", …) live in `lib/audit/audit-catalog.ts` so
 * the page and this query agree on what each choice means.
 */
import {
  announcements,
  complianceAuditLog,
  createScopedClient,
  documents,
  logAuditEvent,
  maintenanceRequests,
  meetings,
  paginate,
  violations,
} from '@propertypro/db';
import { and, desc, eq, gte, inArray, lte, or, sql, type SQL } from '@propertypro/db/filters';
import {
  ACCESS_RULES,
  ROUTINE_RULES,
  SCOPE_RESOURCE_TYPES,
  SUPPORT_METADATA_KEY,
  VIEW_RULES,
  type AuditRule,
  type AuditView,
} from '@/lib/audit/audit-catalog';
import { resourceKey, type AuditLogEntry, type AuditResourceInfo, type AuditScope } from '@/lib/audit/types';
import { auditUserIds, coerceAuditRow, toRedactedEntry } from '@/lib/audit/redact';
import { resolveUserDisplayNames } from '@/lib/utils/resolve-users';

export interface AuditTrailFilters {
  action?: string | null;
  userId?: string | null;
  /** Date strings (YYYY-MM-DD) — converted to UTC start-of-day. */
  startDate?: string | null;
  /** Date strings (YYYY-MM-DD) — converted to UTC end-of-day. */
  endDate?: string | null;
  /** A "Show" choice. Absent means no view filter (the pre-redesign behaviour). */
  view?: AuditView | null;
  /** Narrow to one person (what they did, or access changes about them) or one item. */
  scope?: AuditScope | null;
}

/** OR of the rules, grouping action-only rules into one IN list. */
function rulesPredicate(rules: readonly AuditRule[]): SQL {
  const actionOnly = rules.filter((r) => r.resourceType === undefined).map((r) => r.action);
  const pairs = rules.filter((r) => r.resourceType !== undefined);
  const clauses: SQL[] = [];
  if (actionOnly.length > 0) clauses.push(inArray(complianceAuditLog.action, actionOnly));
  for (const rule of pairs) {
    clauses.push(and(eq(complianceAuditLog.action, rule.action), eq(complianceAuditLog.resourceType, rule.resourceType!))!);
  }
  return clauses.length === 1 ? clauses[0]! : or(...clauses)!;
}

function viewPredicate(view: AuditView): SQL | undefined {
  switch (view) {
    case 'all':
      return undefined;
    case 'important':
      return sql`not (${rulesPredicate(ROUTINE_RULES)})`;
    case 'access':
      // Anything PropertyPro support did while signed in as a member is an access event too.
      return or(rulesPredicate(ACCESS_RULES), sql`${complianceAuditLog.metadata} ? ${SUPPORT_METADATA_KEY}`)!;
    default:
      return rulesPredicate(VIEW_RULES[view]);
  }
}

function scopePredicate(scope: AuditScope): SQL {
  if (scope.kind === 'person') {
    const accessActions = ACCESS_RULES.map((r) => r.action);
    return or(
      // What they did…
      eq(complianceAuditLog.userId, scope.userId),
      // …and access changes and invitations about them.
      and(
        inArray(complianceAuditLog.action, accessActions),
        or(
          sql`${complianceAuditLog.newValues} ->> 'userId' = ${scope.userId}`,
          eq(complianceAuditLog.resourceId, scope.userId),
        ),
      ),
    )!;
  }
  const types = SCOPE_RESOURCE_TYPES[scope.entityType] ?? [scope.entityType];
  const direct = and(inArray(complianceAuditLog.resourceType, [...types]), eq(complianceAuditLog.resourceId, scope.resourceId))!;
  if (scope.entityType === 'document') {
    // A document linked to a compliance checklist item is recorded against the item.
    return or(direct, sql`${complianceAuditLog.newValues} ->> 'documentId' = ${scope.resourceId}`)!;
  }
  return direct;
}

function buildAuditTrailWhere(filters: AuditTrailFilters): SQL | undefined {
  const conditions: SQL[] = [];
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
  if (filters.view) {
    const predicate = viewPredicate(filters.view);
    if (predicate) conditions.push(predicate);
  }
  if (filters.scope) {
    conditions.push(scopePredicate(filters.scope));
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
 * Full-fetch audit log read for the CSV export path and the printable record.
 * Caps the result set at `limit` rows; caller should set `X-CSV-Truncated`
 * headers when the returned array length equals the cap.
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

/**
 * Under the Important view: how many entries the same filters would show if
 * routine ones were included. The page says this number out loud so the log
 * never looks smaller than it is.
 *
 * AUTHZ: tenant-scoped — caller MUST have already verified `audit:read`.
 */
export async function countHiddenRoutineEntries(params: {
  communityId: number;
  filters: AuditTrailFilters;
}): Promise<number> {
  const where = buildAuditTrailWhere({ ...params.filters, view: null });
  const routine = rulesPredicate(ROUTINE_RULES);
  const scoped = createScopedClient(params.communityId);
  const rows = (await scoped.selectFrom(
    complianceAuditLog,
    { n: sql<number>`count(*)::int` },
    where ? and(where, routine) : routine,
  )) as unknown as Array<{ n: number }>;
  return rows[0]?.n ?? 0;
}

interface NameSource {
  resourceTypes: readonly string[];
  read: (scoped: ReturnType<typeof createScopedClient>, ids: number[]) => Promise<Array<{ id: number; name: string; startsAt?: string | null }>>;
}

/** Items whose current name is worth one batched lookup. Others use the name the row recorded. */
const NAME_SOURCES: readonly NameSource[] = [
  {
    resourceTypes: ['document'],
    read: async (scoped, ids) =>
      (await scoped.selectFrom(documents, { id: documents.id, name: documents.title }, inArray(documents.id, ids))) as unknown as Array<{ id: number; name: string }>,
  },
  {
    resourceTypes: ['meeting'],
    read: async (scoped, ids) => {
      const rows = (await scoped.selectFrom(
        meetings,
        { id: meetings.id, name: meetings.title, startsAt: meetings.startsAt },
        inArray(meetings.id, ids),
      )) as unknown as Array<{ id: number; name: string; startsAt: Date | string | null }>;
      return rows.map((r) => ({ ...r, startsAt: r.startsAt instanceof Date ? r.startsAt.toISOString() : r.startsAt }));
    },
  },
  {
    resourceTypes: ['announcement'],
    read: async (scoped, ids) =>
      (await scoped.selectFrom(announcements, { id: announcements.id, name: announcements.title }, inArray(announcements.id, ids))) as unknown as Array<{ id: number; name: string }>,
  },
  {
    resourceTypes: ['maintenance_request'],
    read: async (scoped, ids) =>
      (await scoped.selectFrom(
        maintenanceRequests,
        { id: maintenanceRequests.id, name: maintenanceRequests.title },
        inArray(maintenanceRequests.id, ids),
      )) as unknown as Array<{ id: number; name: string }>,
  },
  {
    resourceTypes: ['violation'],
    read: async (scoped, ids) => {
      const rows = (await scoped.selectFrom(
        violations,
        { id: violations.id, name: violations.description },
        inArray(violations.id, ids),
      )) as unknown as Array<{ id: number; name: string }>;
      return rows.map((r) => ({ ...r, name: r.name.length > 80 ? `${r.name.slice(0, 79)}…` : r.name }));
    },
  },
];

/**
 * Current names for the items on one page of entries, keyed by `resourceKey()`.
 * Deleted items are not found here; the describer falls back to the name the
 * row itself recorded.
 *
 * AUTHZ: tenant-scoped — caller MUST have already verified `audit:read`.
 */
export async function resolveAuditResourceNames(
  communityId: number,
  rows: ReadonlyArray<{ resourceType: string; resourceId: string }>,
): Promise<Record<string, AuditResourceInfo>> {
  const scoped = createScopedClient(communityId);
  const out: Record<string, AuditResourceInfo> = {};
  await Promise.all(
    NAME_SOURCES.map(async (source) => {
      const ids = Array.from(
        new Set(
          rows
            .filter((r) => source.resourceTypes.includes(r.resourceType))
            .map((r) => Number(r.resourceId))
            .filter((n) => Number.isInteger(n) && n > 0),
        ),
      );
      if (ids.length === 0) return;
      const found = await source.read(scoped, ids);
      for (const item of found) {
        for (const type of source.resourceTypes) {
          out[resourceKey(type, String(item.id))] = {
            name: item.name,
            ...(item.startsAt !== undefined ? { startsAt: item.startsAt } : {}),
          };
        }
      }
    }),
  );
  return out;
}

/** The searchable entity behind an item scope, as a `resource_type` the name sources know. */
export function scopeResourceType(scope: Extract<AuditScope, { kind: 'item' }>): string {
  return (SCOPE_RESOURCE_TYPES[scope.entityType] ?? [scope.entityType])[0]!;
}

/** The most entries one printed record carries. A longer history is narrowed first. */
export const AUDIT_PRINT_MAX_ENTRIES = 1000;

export interface AuditPrintRecord {
  entries: AuditLogEntry[];
  users: Record<string, string>;
  resources: Record<string, AuditResourceInfo>;
  /** True when the history is longer than AUDIT_PRINT_MAX_ENTRIES. */
  truncated: boolean;
  scopeLabel: string | null;
}

/**
 * Everything the printable audit record shows, oldest first, with names
 * resolved — and an `audit_evidence_generated` entry recording that it was
 * produced. The printout can show who opened what, so producing one is itself
 * findable in the trail, like the directory and community exports.
 *
 * AUTHZ: tenant-scoped — caller MUST have already verified `audit:read`.
 */
export async function buildAuditPrintRecord(params: {
  communityId: number;
  actorUserId: string;
  filters: AuditTrailFilters;
  /** Shown when the server can't name the scope (a deleted item). */
  fallbackLabel: string | null;
}): Promise<AuditPrintRecord> {
  const raw = await fetchAuditTrailForCsvExport({
    communityId: params.communityId,
    filters: params.filters,
    limit: AUDIT_PRINT_MAX_ENTRIES + 1,
  });
  const truncated = raw.length > AUDIT_PRINT_MAX_ENTRIES;
  const entries = raw.slice(0, AUDIT_PRINT_MAX_ENTRIES).map(coerceAuditRow).map(toRedactedEntry).reverse();

  const scope = params.filters.scope ?? null;
  const userIds = auditUserIds(entries);
  if (scope?.kind === 'person') userIds.push(scope.userId);
  // The record's header names who generated it.
  userIds.push(params.actorUserId);
  const scopeItem = scope?.kind === 'item' ? [{ resourceType: scopeResourceType(scope), resourceId: scope.resourceId }] : [];
  const [names, resources] = await Promise.all([
    resolveUserDisplayNames(params.communityId, userIds),
    resolveAuditResourceNames(params.communityId, [...entries, ...scopeItem]),
  ]);
  const users = Object.fromEntries(names);

  let scopeLabel: string | null = params.fallbackLabel;
  if (scope?.kind === 'person') scopeLabel = users[scope.userId] ?? scopeLabel;
  if (scope?.kind === 'item') scopeLabel = resources[resourceKey(scopeResourceType(scope), scope.resourceId)]?.name ?? scopeLabel;

  await logAuditEvent({
    userId: params.actorUserId,
    action: 'audit_evidence_generated',
    resourceType: scope?.kind === 'item' ? scopeResourceType(scope) : scope?.kind === 'person' ? 'user' : 'community',
    resourceId: scope?.kind === 'item' ? scope.resourceId : scope?.kind === 'person' ? scope.userId : String(params.communityId),
    communityId: params.communityId,
    metadata: {
      scopeLabel: scopeLabel ?? 'the whole community',
      entryCount: entries.length,
      truncated,
      view: params.filters.view ?? null,
      startDate: params.filters.startDate ?? null,
    },
  });

  return { entries, users, resources, truncated, scopeLabel };
}
