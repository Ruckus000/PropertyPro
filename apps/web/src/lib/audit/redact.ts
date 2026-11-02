/**
 * Redaction and row shaping for audit entries before they leave the server —
 * the JSON list, the CSV download and the printable record all use these.
 *
 * `compliance_audit_log` is append-only, so a secret written into a row can
 * never be removed; this is the last line that keeps it off a screen or a file.
 */
import type { AuditLogEntry } from './types';

/**
 * Sensitive key patterns (case-insensitive) to redact before export/display.
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

/**
 * Recursively redact sensitive keys from a JSON object before export/display.
 * Applies case-insensitive substring matching for key detection.
 */
export function redactMetadata(metadata: Record<string, unknown> | null): Record<string, unknown> | null {
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
      redacted[key] = isSensitiveKey(key) ? '[REDACTED]' : redactValue(val);
    }
    return redacted;
  }
  return value;
}

export interface AuditLogRow extends Omit<AuditLogEntry, 'createdAt'> {
  createdAt: Date;
}

export function coerceAuditRow(row: Record<string, unknown>): AuditLogRow {
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

/** A redacted, JSON-safe entry. */
export function toRedactedEntry(row: AuditLogRow): AuditLogEntry {
  return {
    ...row,
    oldValues: redactMetadata(row.oldValues),
    newValues: redactMetadata(row.newValues),
    metadata: redactMetadata(row.metadata),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}

/**
 * Every user id an entry names: the actor, plus the person an access change or
 * invitation was about. Mirrors `targetPerson` in describe-event.ts.
 */
export function auditUserIds(rows: ReadonlyArray<Pick<AuditLogEntry, 'userId' | 'resourceType' | 'resourceId' | 'newValues' | 'oldValues' | 'metadata'>>): string[] {
  const ids = new Set<string>();
  const personTypes = new Set(['invitation', 'resident', 'user']);
  for (const row of rows) {
    if (row.userId) ids.add(row.userId);
    for (const value of [row.newValues?.['userId'], row.newValues?.['targetUserId'], row.oldValues?.['userId'], row.metadata?.['targetUserId']]) {
      if (typeof value === 'string' && value.length > 0) ids.add(value);
    }
    if (personTypes.has(row.resourceType) && row.resourceId) ids.add(row.resourceId);
  }
  return Array.from(ids);
}
