/**
 * Redaction and row shaping for audit entries before they leave the server —
 * the JSON list, the CSV download and the printable record all use these.
 * Two kinds: secret-looking keys (always), and what a bid said while its
 * contract's bidding is still sealed (`sealBidAuditRows`).
 *
 * `compliance_audit_log` is append-only, so a secret written into a row can
 * never be removed; this is the last line that keeps it off a screen or a file.
 */
import { isBiddingSealed } from '@/lib/contracts/bid-sealing';
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

// ---------------------------------------------------------------------------
// Sealed bids
// ---------------------------------------------------------------------------
//
// Adding a bid writes its vendor and amount into a `contract_bid` entry. The
// entry is written as it always was (the table is append-only and is the
// record); what changes is what LEAVES the server. Owner decision, 2026-11-24
// ("Hide them until closing"): until the parent contract's bidding closes, a
// bid's entry says that a bid was recorded and on which contract, and nothing
// the bid said. After the closing time the same entry shows everything.

/** The `resource_type` of an add-bid entry. */
export const BID_AUDIT_RESOURCE_TYPE = 'contract_bid';

/** Shown in place of a sealed bid's details. */
export const SEALED_BID_DETAILS = 'Sealed until bidding closes';

/** What the redaction needs to know about a bid's parent contract. */
export interface BidParentContract {
  title: string;
  /** As stored. Read by `isBiddingSealed`, which fails closed on anything unreadable. */
  biddingClosesAt: unknown;
}

type AuditRowLike = Record<string, unknown>;

function parentContractId(row: AuditRowLike): number | null {
  for (const key of ['newValues', 'oldValues', 'metadata']) {
    const source = row[key];
    if (source === null || typeof source !== 'object') continue;
    const id = Number((source as Record<string, unknown>)['contractId']);
    if (Number.isInteger(id) && id > 0) return id;
  }
  return null;
}

/** The parent contracts of the bid entries in `rows`: what to look up, once, before sealing them. */
export function bidAuditContractIds(rows: ReadonlyArray<AuditRowLike>): number[] {
  const ids = new Set<number>();
  for (const row of rows) {
    if (row['resourceType'] !== BID_AUDIT_RESOURCE_TYPE) continue;
    const id = parentContractId(row);
    if (id !== null) ids.add(id);
  }
  return Array.from(ids);
}

/**
 * `rows` with every bid entry whose contract is still sealed stripped of what
 * the bid said. Fails closed: an entry that names no contract, or whose
 * contract is not in `contractsById`, or whose closing time cannot be read, is
 * redacted. Entries of any other kind are returned untouched.
 */
export function sealBidAuditRows<T extends AuditRowLike>(
  rows: ReadonlyArray<T>,
  contractsById: ReadonlyMap<number, BidParentContract>,
  now: Date,
): T[] {
  return rows.map((row) => {
    if (row['resourceType'] !== BID_AUDIT_RESOURCE_TYPE) return row;
    const contractId = parentContractId(row);
    const contract = contractId === null ? undefined : contractsById.get(contractId);
    if (contract && !isBiddingSealed(contract.biddingClosesAt, now)) return row;

    const closesAt = contract?.biddingClosesAt;
    const sealed: Record<string, unknown> = {
      ...(contractId !== null ? { contractId } : {}),
      ...(contract ? { contract: contract.title } : {}),
      bidDetails: SEALED_BID_DETAILS,
      ...(closesAt instanceof Date && !Number.isNaN(closesAt.getTime())
        ? { biddingClosesAt: closesAt.toISOString() }
        : {}),
    };
    return {
      ...row,
      newValues: sealed,
      oldValues: row['oldValues'] ? { bidDetails: SEALED_BID_DETAILS } : null,
      // Nothing a bid said belongs in metadata, and none is written there today.
      // Keep only the keys the request plumbing writes, in case that changes.
      metadata: sealedBidMetadata(row['metadata']),
    };
  });
}

function sealedBidMetadata(metadata: unknown): Record<string, unknown> | null {
  if (metadata === null || typeof metadata !== 'object') return null;
  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata as Record<string, unknown>)) {
    if (key === 'requestId' || key === 'support') kept[key] = value;
  }
  return kept;
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
