import {
  LEDGER_ENTRY_TYPES,
  LEDGER_SOURCE_TYPES,
  type LedgerEntryType,
  type LedgerMetadata,
  type LedgerSourceType,
} from '@propertypro/shared';
import { and, desc, eq, gte, lte } from '../filters';
import type { ScopedClient } from '../types/scoped-client';
import { ledgerEntries } from '../schema/ledger-entries';
import { logAuditEvent } from '../utils/audit-logger';

export interface PostLedgerEntryParams {
  entryType: LedgerEntryType;
  amountCents: number;
  description: string;
  sourceType: LedgerSourceType;
  sourceId?: string;
  unitId?: number;
  userId?: string;
  effectiveDate?: Date;
  metadata?: LedgerMetadata;
  createdByUserId: string;
  requestId?: string;
}

export interface ListLedgerEntriesParams {
  unitId?: number;
  entryType?: LedgerEntryType;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

export interface LedgerEntryRow {
  [key: string]: unknown;
  id: number;
  communityId: number;
  entryType: LedgerEntryType;
  amountCents: number;
  description: string;
  sourceType: LedgerSourceType;
  sourceId: string | null;
  unitId: number | null;
  userId: string | null;
  effectiveDate: string;
  metadata: LedgerMetadata;
  createdAt: Date;
  createdByUserId: string | null;
}

const ENTRY_TYPE_SET = new Set<string>(LEDGER_ENTRY_TYPES);
const SOURCE_TYPE_SET = new Set<string>(LEDGER_SOURCE_TYPES);

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export async function postLedgerEntry(
  scopedClient: ScopedClient,
  entry: PostLedgerEntryParams,
): Promise<{ id: number }> {
  if (!ENTRY_TYPE_SET.has(entry.entryType)) {
    throw new Error(`Invalid ledger entry type: ${entry.entryType}`);
  }
  if (!SOURCE_TYPE_SET.has(entry.sourceType)) {
    throw new Error(`Invalid ledger source type: ${entry.sourceType}`);
  }
  if (!Number.isFinite(entry.amountCents)) {
    throw new Error('amountCents must be a finite number');
  }

  const inserted = await scopedClient.insert(ledgerEntries, {
    entryType: entry.entryType,
    amountCents: entry.amountCents,
    description: entry.description,
    sourceType: entry.sourceType,
    sourceId: entry.sourceId ?? null,
    unitId: entry.unitId ?? null,
    userId: entry.userId ?? null,
    effectiveDate: entry.effectiveDate ? toDateOnly(entry.effectiveDate) : undefined,
    metadata: entry.metadata ?? {},
    createdByUserId: entry.createdByUserId,
  });

  const firstRow = inserted[0];
  const id = firstRow?.['id'];
  if (typeof id !== 'number') {
    throw new Error('Failed to insert ledger entry');
  }

  await logAuditEvent({
    userId: entry.createdByUserId,
    action: 'create',
    resourceType: 'ledger_entry',
    resourceId: String(id),
    communityId: scopedClient.communityId,
    newValues: {
      entryType: entry.entryType,
      amountCents: entry.amountCents,
      sourceType: entry.sourceType,
      sourceId: entry.sourceId ?? null,
      unitId: entry.unitId ?? null,
      userId: entry.userId ?? null,
      effectiveDate: entry.effectiveDate ? toDateOnly(entry.effectiveDate) : null,
    },
    metadata: {
      requestId: entry.requestId ?? null,
      ...entry.metadata,
    },
  });

  return { id };
}

export async function listLedgerEntries(
  scopedClient: ScopedClient,
  params: ListLedgerEntriesParams = {},
): Promise<LedgerEntryRow[]> {
  const filters = [];

  if (params.unitId !== undefined) {
    filters.push(eq(ledgerEntries.unitId, params.unitId));
  }

  if (params.entryType !== undefined) {
    if (!ENTRY_TYPE_SET.has(params.entryType)) {
      throw new Error(`Invalid ledger entry type filter: ${params.entryType}`);
    }
    filters.push(eq(ledgerEntries.entryType, params.entryType));
  }

  if (params.startDate !== undefined) {
    filters.push(gte(ledgerEntries.effectiveDate, params.startDate));
  }

  if (params.endDate !== undefined) {
    filters.push(lte(ledgerEntries.effectiveDate, params.endDate));
  }

  const whereClause =
    filters.length === 0 ? undefined : (filters.length === 1 ? filters[0] : and(...filters));

  const safeLimit = Math.min(Math.max(params.limit ?? 100, 1), 500);

  const rows = await scopedClient
    .selectFrom<LedgerEntryRow>(ledgerEntries, {}, whereClause)
    .orderBy(desc(ledgerEntries.effectiveDate), desc(ledgerEntries.id))
    .limit(safeLimit);

  return rows;
}

export async function getUnitLedgerBalance(
  scopedClient: ScopedClient,
  unitId: number,
): Promise<number> {
  const rows = await scopedClient.selectFrom<{ amountCents: number }>(
    ledgerEntries,
    { amountCents: ledgerEntries.amountCents },
    eq(ledgerEntries.unitId, unitId),
  );

  return rows.reduce((sum, row) => {
    if (typeof row.amountCents === 'number' && Number.isFinite(row.amountCents)) {
      return sum + row.amountCents;
    }
    return sum;
  }, 0);
}
