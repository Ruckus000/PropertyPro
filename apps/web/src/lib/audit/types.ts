/**
 * Shapes shared by the audit trail API, page and print view.
 */

/** One `compliance_audit_log` row as the API sends it (dates as ISO strings). */
export interface AuditLogEntry {
  id: number;
  userId: string | null;
  communityId: number;
  action: string;
  resourceType: string;
  resourceId: string;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

/** What the server could find out about an entry's item, keyed by `resourceKey()`. */
export interface AuditResourceInfo {
  name: string;
  /** Meetings only: when it starts, so a notice can say how far ahead it went out. */
  startsAt?: string | null;
}

/** A person or item the page is narrowed to. */
export type AuditScope =
  | { kind: 'person'; userId: string }
  | { kind: 'item'; entityType: string; resourceId: string };

/** The inner payload of `GET /api/v1/audit-trail` (JSON path). */
export interface AuditPagePayload {
  data: AuditLogEntry[];
  pagination: { nextCursor: string | null; hasMore: boolean; pageSize: number };
  users: Record<string, string>;
  /** Names for items, keyed by `resourceKey()`. Absent from older responses. */
  resources?: Record<string, AuditResourceInfo>;
  /** Under the Important view: how many routine entries the same filters hid. */
  hiddenRoutineCount?: number | null;
  /** When narrowed to a person or item: its display name. */
  scopeLabel?: string | null;
}

export function resourceKey(resourceType: string, resourceId: string): string {
  return `${resourceType}:${resourceId}`;
}
