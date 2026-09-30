import { createElement } from 'react';
import { addDays, differenceInCalendarDays, endOfMonth, format, startOfMonth } from 'date-fns';
import {
  assessmentLineItems,
  assessments,
  clampPageSize,
  communities,
  createScopedClient,
  financeStripeWebhookEvents,
  getUnitLedgerBalance,
  leases,
  listLedgerEntries,
  logAuditEvent,
  postLedgerEntry,
  rentObligations,
  rentPayments,
  stripeConnectedAccounts,
  units,
  users,
  type PaginatedResult,
  type PaginationInput,
} from '@propertypro/db';
import { and, asc, desc, eq, gte, inArray, lt, lte, notInArray, or, sql, type SQL } from '@propertypro/db/filters';
import type { LedgerEntryType, StripePayableMetadata, PayableType } from '@propertypro/shared';
import {
  type PaymentFeePolicy,
  DEFAULT_FEE_POLICY,
  calculateConvenienceFee,
  calculateStripeFeeEstimate,
} from '@propertypro/shared';
import type Stripe from 'stripe';
import { captureMessage } from '@sentry/nextjs';
import { AssessmentPaymentReceivedEmail, sendEmail } from '@propertypro/email';
import { generateCSV } from '@/lib/services/csv-export';
import { getStripeClient } from '@/lib/services/stripe-service';
import { markMatchingViolationFinePaid } from '@/lib/services/violations-service';
import { AppError, BadRequestError, ForbiddenError, NotFoundError, UnprocessableEntityError } from '@/lib/api/errors';
import { signPayload, verifySignature } from '@/lib/services/oauth-state';
import { centsToDollars, parseDateOnly } from '@/lib/finance/common';
import { assessmentMonthOutOfRange } from '@/lib/finance/date-only';
import { listActorUnitIds } from '@/lib/units/actor-units';
import {
  generateCommunityFinanceStatementPdf,
  generateFinanceStatementPdf,
} from '@/lib/utils/finance-pdf';
import { getBaseUrl } from '@/lib/utils/url';
import { isNamedUniqueViolation } from '@/lib/db/postgres-error';

export type AssessmentFrequency = 'monthly' | 'quarterly' | 'annual' | 'one_time';
export type AssessmentLineItemStatus = 'pending' | 'paid' | 'overdue' | 'waived';

export interface AssessmentRecord {
  [key: string]: unknown;
  id: number;
  communityId: number;
  title: string;
  description: string | null;
  amountCents: number;
  frequency: AssessmentFrequency;
  dueDay: number | null;
  lateFeeAmountCents: number;
  lateFeeDaysGrace: number;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface AssessmentOrderedCursorPayload {
  isActive: boolean;
  createdAt: string;
  id: number;
}

export interface AssessmentLineItemRecord {
  [key: string]: unknown;
  id: number;
  assessmentId: number | null;
  communityId: number;
  unitId: number;
  amountCents: number;
  dueDate: string;
  status: AssessmentLineItemStatus;
  paidAt: Date | null;
  paymentIntentId: string | null;
  lateFeeCents: number;
  createdAt: Date;
  updatedAt: Date;
}

interface StripeConnectedAccountRecord {
  [key: string]: unknown;
  id: number;
  communityId: number;
  stripeAccountId: string;
  onboardingComplete: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
}

export interface CreateAssessmentInput {
  title: string;
  description?: string | null;
  amountCents: number;
  frequency: AssessmentFrequency;
  dueDay?: number | null;
  lateFeeAmountCents?: number;
  lateFeeDaysGrace?: number;
  startDate?: string;
  endDate?: string | null;
  isActive?: boolean;
}

export interface UpdateAssessmentInput {
  title?: string;
  description?: string | null;
  amountCents?: number;
  frequency?: AssessmentFrequency;
  dueDay?: number | null;
  lateFeeAmountCents?: number;
  lateFeeDaysGrace?: number;
  startDate?: string;
  endDate?: string | null;
  isActive?: boolean;
}

export interface CreatePaymentIntentInput {
  payableId?: number;
  payableType?: 'assessment_line_item' | 'rent_obligation';
  lineItemId: number;
  actorUserId: string;
  allowedUnitId?: number;
  requestId?: string | null;
}

interface PayableRecord {
  payableType: PayableType;
  payableId: number;
  payableSourceType: 'assessment' | 'rent';
  payableSourceId: string;
  communityId: number;
  unitId: number;
  amountCents: number;
  status: PayableStatus;
  paidAt: Date | null;
  paymentIntentId: string | null;
  assessmentId: number | null;
  leaseId: number | null;
  dueDate: string;
  lateFeeCents: number;
}

type PayableStatus = AssessmentLineItemStatus | 'partially_paid';

interface RentObligationRecord {
  [key: string]: unknown;
  id: number;
  leaseId: number;
  communityId: number;
  unitId: number;
  dueDate: string;
  amountCents: number;
  status: 'pending' | 'paid' | 'partially_paid' | 'overdue' | 'waived';
  createdAt: Date;
  updatedAt: Date;
}

interface PaymentHistoryRecord {
  payableType: PayableType;
  payableId: number;
  payableSourceType: 'assessment' | 'rent';
  payableSourceId: string;
  unitId: number;
  amountCents: number;
  dueDate: string;
  status: PayableStatus;
  paidAt: Date | null;
  assessmentId: number | null;
  leaseId: number | null;
  lateFeeCents: number;
}

interface PayableMetadata {
  communityId: number;
  payableType: PayableType;
  payableId: number;
  payableSourceType: 'assessment' | 'rent';
  payableSourceId: string;
  unitId: number;
  userId: string;
  baseAmountCents: number;
  convenienceFeeCents: number;
}

const VALID_ASSESSMENT_FREQUENCIES: readonly AssessmentFrequency[] = [
  'monthly',
  'quarterly',
  'annual',
  'one_time',
];

const VALID_LINE_ITEM_STATUSES: readonly AssessmentLineItemStatus[] = [
  'pending',
  'paid',
  'overdue',
  'waived',
];

const STRIPE_FINANCE_EVENT_TYPES: ReadonlySet<string> = new Set([
  'payment_intent.succeeded',
  'charge.refunded',
  'charge.dispute.created',
]);

const FINANCE_WEBHOOK_ERROR_CODES = {
  MISSING_REQUIRED_METADATA: 'FINANCE_WEBHOOK_MISSING_REQUIRED_METADATA',
  DUPLICATE_EVENT: 'FINANCE_WEBHOOK_DUPLICATE_EVENT',
  PAYABLE_NOT_FOUND: 'FINANCE_WEBHOOK_PAYABLE_NOT_FOUND',
  REFUND_PREVIOUS_ATTRIBUTES_MISSING: 'FINANCE_WEBHOOK_REFUND_PREVIOUS_ATTRIBUTES_MISSING',
  REFUND_INVALID_INCREMENTAL_AMOUNT: 'FINANCE_WEBHOOK_REFUND_INVALID_INCREMENTAL_AMOUNT',
  DISPUTE_CHARGE_ID_MISSING: 'FINANCE_WEBHOOK_DISPUTE_CHARGE_ID_MISSING',
  UNHANDLED_EVENT_PROCESSING_ERROR: 'FINANCE_WEBHOOK_UNHANDLED_EVENT_PROCESSING_ERROR',
} as const;

type FinanceWebhookErrorCode =
  (typeof FINANCE_WEBHOOK_ERROR_CODES)[keyof typeof FINANCE_WEBHOOK_ERROR_CODES];

type FinanceWebhookCategory =
  | 'validation'
  | 'idempotency'
  | 'reconciliation'
  | 'dependency'
  | 'processing';

interface FinanceWebhookLogContext {
  eventId?: string;
  eventType?: string;
  communityId?: number | null;
  payableType?: PayableType | null;
  payableId?: number | null;
  payloadSnippet?: Record<string, unknown>;
}

function logFinanceWebhookEvent(
  level: 'info' | 'warn' | 'error',
  message: string,
  input: FinanceWebhookLogContext & {
    errorCode?: FinanceWebhookErrorCode;
    category?: FinanceWebhookCategory;
    metricName?: string;
    outcome?: 'success' | 'failure' | 'duplicate' | 'skipped';
    reason?: string;
    errorMessage?: string;
  },
): void {
  const payload = {
    component: 'finance-webhook',
    message,
    ...input,
  };
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
  fn('[finance-webhook]', payload);
}

const FINANCE_EXPORT_HEADERS = [
  { key: 'id', label: 'Entry ID' },
  { key: 'effectiveDate', label: 'Effective Date' },
  { key: 'entryType', label: 'Entry Type' },
  { key: 'amountDollars', label: 'Amount (USD)' },
  { key: 'description', label: 'Description' },
  { key: 'sourceType', label: 'Source Type' },
  { key: 'sourceId', label: 'Source ID' },
  { key: 'unitId', label: 'Unit ID' },
] as const;

function assertFrequency(value: string): AssessmentFrequency {
  if (!VALID_ASSESSMENT_FREQUENCIES.includes(value as AssessmentFrequency)) {
    throw new UnprocessableEntityError(`Invalid assessment frequency: ${value}`);
  }
  return value as AssessmentFrequency;
}

function assertLineItemStatus(value: string): AssessmentLineItemStatus {
  if (!VALID_LINE_ITEM_STATUSES.includes(value as AssessmentLineItemStatus)) {
    throw new UnprocessableEntityError(`Invalid line item status: ${value}`);
  }
  return value as AssessmentLineItemStatus;
}

function isMissingRelationError(err: unknown): boolean {
  const directCode = typeof err === 'object' && err !== null && 'code' in err
    ? (err as { code?: string }).code
    : undefined;
  const causeCode = typeof err === 'object' && err !== null && 'cause' in err
    ? ((err as { cause?: { code?: string } }).cause?.code)
    : undefined;
  return directCode === '42P01' || causeCode === '42P01';
}

function parseMetadataInt(metadata: Record<string, string>, key: string): number | null {
  const raw = metadata[key];
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseMetadataString(metadata: Record<string, string>, key: string): string | null {
  const raw = metadata[key];
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

function parsePayableType(metadata: Record<string, string>): PayableType | null {
  const payableType = parseMetadataString(metadata, 'payableType');
  if (payableType === 'assessment_line_item' || payableType === 'rent_obligation') {
    return payableType;
  }
  // Backward compatibility for pre-contract payment intents.
  const legacyLineItemId = parseMetadataInt(metadata, 'lineItemId');
  if (legacyLineItemId) {
    return 'assessment_line_item';
  }
  return null;
}

function parsePayableId(metadata: Record<string, string>, payableType: PayableType): number | null {
  const payableId = parseMetadataInt(metadata, 'payableId');
  if (payableId) return payableId;

  // Backward compatibility for assessment-only metadata.
  if (payableType === 'assessment_line_item') {
    return parseMetadataInt(metadata, 'lineItemId');
  }

  return null;
}

function toLegacyMetadata(payable: PayableRecord): Record<string, string> {
  if (payable.payableType === 'assessment_line_item') {
    return {
      lineItemId: String(payable.payableId),
    };
  }
  return {};
}

function computeDueDate(
  assessment: Pick<AssessmentRecord, 'frequency' | 'dueDay' | 'startDate'>,
  dueDateOverride?: string | null,
): string {
  if (dueDateOverride) {
    return parseDateOnly(dueDateOverride, 'dueDate');
  }

  const today = new Date();
  if (assessment.frequency === 'one_time') {
    return assessment.startDate;
  }

  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const day = assessment.dueDay ?? 1;
  const clampedDay = Math.max(1, Math.min(day, monthEnd.getDate()));
  const candidate = new Date(monthStart.getFullYear(), monthStart.getMonth(), clampedDay);
  return format(candidate, 'yyyy-MM-dd');
}

/** 'yyyy-MM-dd' → months since year 0 (0-based month), read from the string. */
function monthIndexOf(dateOnly: string): number {
  return Number(dateOnly.slice(0, 4)) * 12 + (Number(dateOnly.slice(5, 7)) - 1);
}

function firstOfMonthIndex(index: number): string {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
}

/**
 * The billing period a recurring assessment's due date falls in, as a
 * half-open `[start, endExclusive)` range of 'yyyy-MM-dd' strings — the
 * "already generated" check is keyed on this, not on the exact due date, so a
 * dueDay edit (or an override elsewhere in the same period) cannot bill the
 * period twice.
 *
 * monthly → the calendar month. quarterly / annual → the 3- / 12-month window
 * anchored on the start date's month, the same anchor shouldGenerateThisMonth
 * uses for cadence. one_time → null (keyed on the exact due date, as before).
 * Pure string arithmetic: no Date parsing, so no time-zone dependence.
 */
function billingPeriodFor(
  assessment: Pick<AssessmentRecord, 'frequency' | 'startDate'>,
  dueDate: string,
): { start: string; endExclusive: string } | null {
  const months =
    assessment.frequency === 'monthly' ? 1
      : assessment.frequency === 'quarterly' ? 3
        : assessment.frequency === 'annual' ? 12
          : null;
  if (months === null) return null;
  const dueIndex = monthIndexOf(dueDate);
  const offset = (((dueIndex - monthIndexOf(assessment.startDate)) % months) + months) % months;
  const startIndex = dueIndex - offset;
  return { start: firstOfMonthIndex(startIndex), endExclusive: firstOfMonthIndex(startIndex + months) };
}

function toLineItemDescription(assessment: AssessmentRecord, dueDate: string): string {
  return `${assessment.title} (${dueDate})`;
}

function encodeAssessmentOrderedCursor(payload: AssessmentOrderedCursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeAssessmentOrderedCursor(
  cursor: string | null | undefined,
): AssessmentOrderedCursorPayload | null {
  if (!cursor) return null;

  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }

    const createdAt = (parsed as { createdAt?: unknown }).createdAt;
    const parsedDate =
      typeof createdAt === 'string'
        ? new Date(createdAt)
        : null;

    if (
      typeof (parsed as { isActive?: unknown }).isActive === 'boolean'
      && typeof createdAt === 'string'
      && parsedDate !== null
      && !Number.isNaN(parsedDate.getTime())
      && Number.isInteger((parsed as { id?: unknown }).id)
    ) {
      return {
        isActive: (parsed as { isActive: boolean }).isActive,
        createdAt,
        id: (parsed as { id: number }).id,
      };
    }
  } catch {
    return null;
  }

  return null;
}

function buildAssessmentOrderedCursorWhere(
  cursor: AssessmentOrderedCursorPayload | null,
) {
  if (!cursor) return undefined;
  const cursorCreatedAt = new Date(cursor.createdAt);

  return or(
    lt(assessments.isActive, cursor.isActive),
    and(
      eq(assessments.isActive, cursor.isActive),
      or(
        lt(assessments.createdAt, cursorCreatedAt),
        and(
          eq(assessments.createdAt, cursorCreatedAt),
          lt(assessments.id, cursor.id),
        ),
      ),
    ),
  );
}

function mapAssessmentRow(row: AssessmentRecord): AssessmentRecord {
  return {
    ...row,
    frequency: assertFrequency(row.frequency),
  };
}

/**
 * Ordered-keyset paginated assessment list.
 *
 * Sort contract:
 *   ORDER BY is_active DESC, created_at DESC, id DESC
 *
 * AUTHZ: tenant-scoped - caller MUST have already verified finance read
 * permission and the finance feature gate.
 */
export async function paginateAssessmentsForCommunity(
  communityId: number,
  input: PaginationInput = {},
): Promise<PaginatedResult<AssessmentRecord>> {
  const pageSize = clampPageSize(input.pageSize);
  const cursorWhere = buildAssessmentOrderedCursorWhere(
    decodeAssessmentOrderedCursor(input.cursor),
  );
  const scoped = createScopedClient(communityId);
  const rows = await scoped
    .selectFrom<AssessmentRecord>(assessments, {}, cursorWhere)
    .orderBy(desc(assessments.isActive), desc(assessments.createdAt), desc(assessments.id))
    .limit(pageSize + 1);

  const hasMore = rows.length > pageSize;
  const dataRows = hasMore ? rows.slice(0, pageSize) : rows;
  const lastRow = dataRows[dataRows.length - 1];
  const nextCursor =
    hasMore && lastRow
      ? encodeAssessmentOrderedCursor({
          isActive: Boolean(lastRow.isActive),
          createdAt: lastRow.createdAt.toISOString(),
          id: lastRow.id,
        })
      : null;

  return {
    data: dataRows.map(mapAssessmentRow),
    pagination: {
      nextCursor,
      hasMore: nextCursor !== null,
      pageSize,
    },
  };
}

/**
 * The contracts can only compare dates sent in the same request; this compares
 * the dates the row will actually hold (defaults and stored values applied),
 * so an assessment cannot be saved ending before it starts.
 */
function assertAssessmentDateOrder(startDate: string, endDate: string | null): void {
  if (endDate !== null && endDate < startDate) {
    throw new BadRequestError('endDate must be on or after startDate');
  }
}

export async function createAssessmentForCommunity(
  communityId: number,
  actorUserId: string,
  input: CreateAssessmentInput,
  requestId?: string | null,
): Promise<AssessmentRecord> {
  const startDate = input.startDate ?? format(new Date(), 'yyyy-MM-dd');
  assertAssessmentDateOrder(startDate, input.endDate ?? null);
  const scoped = createScopedClient(communityId);
  const [inserted] = await scoped.insert(assessments, {
    title: input.title.trim(),
    description: input.description ?? null,
    amountCents: input.amountCents,
    frequency: input.frequency,
    dueDay: input.dueDay ?? null,
    lateFeeAmountCents: input.lateFeeAmountCents ?? 0,
    lateFeeDaysGrace: input.lateFeeDaysGrace ?? 0,
    startDate,
    endDate: input.endDate ?? null,
    isActive: input.isActive ?? true,
    createdByUserId: actorUserId,
  });

  if (!inserted) {
    throw new Error('Failed to create assessment');
  }

  const created = inserted as unknown as AssessmentRecord;
  await logAuditEvent({
    userId: actorUserId,
    action: 'create',
    resourceType: 'assessment',
    resourceId: String(created.id),
    communityId,
    newValues: created,
    metadata: { requestId: requestId ?? null },
  });

  return created;
}

export async function updateAssessmentForCommunity(
  communityId: number,
  assessmentId: number,
  actorUserId: string,
  input: UpdateAssessmentInput,
  requestId?: string | null,
): Promise<AssessmentRecord> {
  const scoped = createScopedClient(communityId);
  const existingRows = await scoped.selectFrom<AssessmentRecord>(
    assessments,
    {},
    eq(assessments.id, assessmentId),
  );
  const existing = existingRows[0];
  if (!existing) {
    throw new NotFoundError('Assessment not found');
  }
  assertAssessmentDateOrder(
    input.startDate ?? existing.startDate,
    input.endDate !== undefined ? input.endDate : existing.endDate,
  );

  const [updated] = await scoped.update(assessments, {
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.amountCents !== undefined ? { amountCents: input.amountCents } : {}),
    ...(input.frequency !== undefined ? { frequency: input.frequency } : {}),
    ...(input.dueDay !== undefined ? { dueDay: input.dueDay } : {}),
    ...(input.lateFeeAmountCents !== undefined ? { lateFeeAmountCents: input.lateFeeAmountCents } : {}),
    ...(input.lateFeeDaysGrace !== undefined ? { lateFeeDaysGrace: input.lateFeeDaysGrace } : {}),
    ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
    ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
  }, eq(assessments.id, assessmentId));

  if (!updated) {
    throw new NotFoundError('Assessment not found');
  }

  const row = updated as unknown as AssessmentRecord;
  await logAuditEvent({
    userId: actorUserId,
    action: 'update',
    resourceType: 'assessment',
    resourceId: String(row.id),
    communityId,
    oldValues: existing,
    newValues: row,
    metadata: { requestId: requestId ?? null },
  });

  return row;
}

export async function deleteAssessmentForCommunity(
  communityId: number,
  assessmentId: number,
  actorUserId: string,
  requestId?: string | null,
): Promise<void> {
  const scoped = createScopedClient(communityId);
  const existingRows = await scoped.selectFrom<AssessmentRecord>(
    assessments,
    {},
    eq(assessments.id, assessmentId),
  );
  const existing = existingRows[0];
  if (!existing) {
    throw new NotFoundError('Assessment not found');
  }

  await scoped.softDelete(assessments, eq(assessments.id, assessmentId));

  await logAuditEvent({
    userId: actorUserId,
    action: 'delete',
    resourceType: 'assessment',
    resourceId: String(assessmentId),
    communityId,
    oldValues: existing,
    metadata: { requestId: requestId ?? null },
  });
}

export async function listAssessmentLineItemsForCommunity(
  communityId: number,
  assessmentId: number,
  unitId?: number,
): Promise<AssessmentLineItemRecord[]> {
  const scoped = createScopedClient(communityId);
  const whereClause = unitId !== undefined
    ? and(eq(assessmentLineItems.assessmentId, assessmentId), eq(assessmentLineItems.unitId, unitId))
    : eq(assessmentLineItems.assessmentId, assessmentId);

  const rows = await scoped
    .selectFrom<AssessmentLineItemRecord>(assessmentLineItems, {}, whereClause)
    .orderBy(asc(assessmentLineItems.dueDate), asc(assessmentLineItems.id));

  return rows.map((row) => ({
    ...row,
    status: assertLineItemStatus(row.status),
  }));
}

export async function generateAssessmentLineItemsForCommunity(
  communityId: number,
  assessmentId: number,
  actorUserId: string | null,
  dueDateOverride?: string | null,
  requestId?: string | null,
): Promise<{ insertedCount: number; skippedCount: number; dueDate: string }> {
  const scoped = createScopedClient(communityId);
  const assessmentRows = await scoped.selectFrom<AssessmentRecord>(
    assessments,
    {},
    eq(assessments.id, assessmentId),
  );
  const assessment = assessmentRows[0];
  if (!assessment) {
    throw new NotFoundError('Assessment not found');
  }

  const dueDate = computeDueDate(assessment, dueDateOverride);
  const outOfRange = assessmentMonthOutOfRange(assessment, dueDate);
  if (outOfRange) {
    throw new UnprocessableEntityError(
      outOfRange === 'before_start'
        ? `Cannot generate line items: ${dueDate} is before the assessment's start month (${assessment.startDate})`
        : `Cannot generate line items: ${dueDate} is after the assessment's end month (${assessment.endDate})`,
    );
  }
  const unitRows = await scoped.selectFrom<{ id: number }>(units, { id: units.id });
  if (unitRows.length === 0) {
    throw new UnprocessableEntityError('Cannot generate line items: no units found for this community');
  }

  // "Already generated" = any item for this assessment in the same billing
  // period (see billingPeriodFor). App-level only: assessment_line_items has
  // no unique index, so two concurrent generations can still both read an
  // empty set — a DB backstop is a separate migration decision (roadmap 3.T2).
  const period = billingPeriodFor(assessment, dueDate);
  const existingRows = await scoped.selectFrom<AssessmentLineItemRecord>(
    assessmentLineItems,
    {},
    period
      ? and(
        eq(assessmentLineItems.assessmentId, assessmentId),
        gte(assessmentLineItems.dueDate, period.start),
        lt(assessmentLineItems.dueDate, period.endExclusive),
      )
      : and(
        eq(assessmentLineItems.assessmentId, assessmentId),
        eq(assessmentLineItems.dueDate, dueDate),
      ),
  );
  const existingUnitIds = new Set(existingRows.map((row) => row.unitId));

  const toInsert = unitRows
    .map((unitRow) => unitRow.id)
    .filter((unitId) => !existingUnitIds.has(unitId))
    .map((unitId) => ({
      assessmentId,
      unitId,
      amountCents: assessment.amountCents,
      dueDate,
      status: 'pending' as const,
      lateFeeCents: 0,
    }));

  if (toInsert.length === 0) {
    return { insertedCount: 0, skippedCount: unitRows.length, dueDate };
  }

  const insertedRows = await scoped.insert(assessmentLineItems, toInsert);
  const typedInsertedRows = insertedRows as unknown as AssessmentLineItemRecord[];

  for (const lineItem of typedInsertedRows) {
    await postLedgerEntry(scoped, {
      entryType: 'assessment',
      amountCents: lineItem.amountCents,
      description: toLineItemDescription(assessment, lineItem.dueDate),
      sourceType: 'assessment',
      sourceId: String(lineItem.id),
      unitId: lineItem.unitId,
      metadata: {
        assessmentId,
        lineItemId: lineItem.id,
      },
      createdByUserId: actorUserId,
      requestId: requestId ?? undefined,
    });
  }

  await logAuditEvent({
    userId: actorUserId,
    action: 'create',
    resourceType: 'assessment_line_item_batch',
    resourceId: String(assessmentId),
    communityId,
    newValues: {
      assessmentId,
      dueDate,
      insertedCount: typedInsertedRows.length,
      skippedCount: unitRows.length - typedInsertedRows.length,
    },
    metadata: { requestId: requestId ?? null },
  });

  return {
    insertedCount: typedInsertedRows.length,
    skippedCount: unitRows.length - typedInsertedRows.length,
    dueDate,
  };
}

async function requireConnectAccount(
  communityId: number,
): Promise<StripeConnectedAccountRecord> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom<StripeConnectedAccountRecord>(stripeConnectedAccounts, {});
  const record = rows[0];
  if (!record) {
    throw new UnprocessableEntityError('Stripe Connect account is not configured for this community');
  }
  return record;
}

/**
 * The connected account id a direct-charge Stripe call must be made against.
 *
 * Every read or write of a PaymentIntent created under direct charges needs
 * this — omitting it does not fall back to the platform account, it raises
 * `No such payment_intent`, which reads like a missing record rather than a
 * missing header. Extracted so the three call sites cannot drift (F-15).
 */
async function requireConnectedAccountId(communityId: number): Promise<string> {
  const record = await requireConnectAccount(communityId);
  return record.stripeAccountId;
}

/**
 * The effective fee policy. **Always `association_absorbs` (F-16).**
 *
 * ── Why `owner_pays` is refused rather than fixed ──
 *
 * In `owner_pays` the resident was charged a grossed-up processing fee computed
 * at the card rate, and `payment_method_types` includes `'card'`, which includes
 * DEBIT. Visa and Mastercard rules prohibit surcharging debit outright — and
 * they bind us through the Stripe agreement, where the remedy is losing card
 * acceptance, not a fine.
 *
 * The two ways to keep the mode were: charge one uniform fee across every
 * method (compliant, but an ACH payer's fee on a $2,000 assessment goes from
 * about $5 to about $60, and it removes any reason to use the cheapest rail);
 * or detect the card's funding type and waive the fee for debit (fair, but
 * funding type is not reliably known until the payment method is attached, so
 * it needs a confirm-time re-price and is the most fragile option).
 *
 * The owner chose to retire the mode instead. Associations absorb processing
 * cost — which was already the DEFAULT for every community — so no fee is ever
 * shown to a resident and the surcharge question stops existing rather than
 * being managed.
 *
 * ── Why the stored value is read and then ignored ──
 *
 * `communitySettings.paymentFeePolicy` is left in place untouched. Deleting it
 * would need a migration over a JSONB blob to reverse a product decision that
 * could reasonably be revisited, and the stored value is still worth reading:
 * it is how the settings UI explains to a PM that their old choice is no longer
 * honoured. Behaviour is uniform; history is intact.
 */
export async function getCommunityFeePolicy(_communityId: number): Promise<PaymentFeePolicy> {
  return 'association_absorbs';
}

/** The stored (possibly no-longer-honoured) preference. For settings copy only. */
export async function getStoredFeePolicyPreference(
  communityId: number,
): Promise<PaymentFeePolicy> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom(communities, {}, eq(communities.id, communityId));
  const community = rows[0] as Record<string, unknown> | undefined;
  const settings = community?.communitySettings as Record<string, unknown> | undefined;
  const policy = settings?.paymentFeePolicy;
  if (policy === 'owner_pays' || policy === 'association_absorbs') {
    return policy;
  }
  return DEFAULT_FEE_POLICY;
}

export interface SetCommunityFeePolicyResult {
  /**
   * The fee policy that was active before this update — defaults to
   * `'association_absorbs'` if `communitySettings.paymentFeePolicy` was
   * unset (matches the route's pre-A3 fallback). Useful for `oldValues`
   * in audit logs.
   */
  oldPolicy: string;
  /** The new policy now persisted in `communitySettings`. */
  newPolicy: PaymentFeePolicy;
}

/**
 * Read-modify-write the community's `communitySettings.paymentFeePolicy`,
 * preserving every other field in `communitySettings`. Returns the
 * pre-update value so the route can include it in `audit.oldValues`.
 *
 * Concurrency: settings is a JSONB column, and this is a read-modify-write
 * — concurrent updates to *other* settings keys could be lost. Acceptable
 * per the original route's behavior; not changed here.
 */
export async function setCommunityFeePolicy(
  communityId: number,
  newPolicy: PaymentFeePolicy,
): Promise<SetCommunityFeePolicyResult> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom(communities, {}, eq(communities.id, communityId));
  const community = rows[0] as Record<string, unknown> | undefined;
  const currentSettings = (community?.communitySettings as Record<string, unknown>) ?? {};
  const oldPolicy =
    (currentSettings['paymentFeePolicy'] as string | undefined) ?? 'association_absorbs';

  const updatedSettings = { ...currentSettings, paymentFeePolicy: newPolicy };
  await scoped.update(
    communities,
    { communitySettings: updatedSettings },
    eq(communities.id, communityId),
  );

  return { oldPolicy, newPolicy };
}

async function getAssessmentPayableById(
  communityId: number,
  payableId: number,
): Promise<PayableRecord | null> {
  const scoped = createScopedClient(communityId);
  const [lineItem] = await scoped.selectFrom<AssessmentLineItemRecord>(
    assessmentLineItems,
    {},
    eq(assessmentLineItems.id, payableId),
  );
  if (!lineItem) return null;

  return {
    payableType: 'assessment_line_item',
    payableId: lineItem.id,
    payableSourceType: 'assessment',
    payableSourceId: String(lineItem.id),
    communityId,
    unitId: lineItem.unitId,
    amountCents: lineItem.amountCents,
    status: lineItem.status,
    paidAt: lineItem.paidAt,
    paymentIntentId: lineItem.paymentIntentId,
    assessmentId: lineItem.assessmentId,
    leaseId: null,
    dueDate: lineItem.dueDate,
    lateFeeCents: lineItem.lateFeeCents,
  };
}

async function getRentPayableById(
  communityId: number,
  payableId: number,
): Promise<PayableRecord | null> {
  const scoped = createScopedClient(communityId);
  let rentRows: RentObligationRecord[];
  try {
    rentRows = await scoped.selectFrom<RentObligationRecord>(
      rentObligations,
      {},
      eq(rentObligations.id, payableId),
    );
  } catch (err) {
    if (isMissingRelationError(err)) return null;
    throw err;
  }
  const [obligation] = rentRows;
  if (!obligation) return null;

  return {
    payableType: 'rent_obligation',
    payableId: obligation.id,
    payableSourceType: 'rent',
    payableSourceId: String(obligation.id),
    communityId,
    unitId: obligation.unitId,
    amountCents: obligation.amountCents,
    status: obligation.status,
    paidAt: obligation.status === 'paid' ? obligation.updatedAt : null,
    paymentIntentId: null,
    assessmentId: null,
    leaseId: obligation.leaseId,
    dueDate: obligation.dueDate,
    lateFeeCents: 0,
  };
}

async function getPayableById(
  communityId: number,
  payableType: PayableType,
  payableId: number,
): Promise<PayableRecord | null> {
  if (payableType === 'assessment_line_item') {
    return getAssessmentPayableById(communityId, payableId);
  }
  return getRentPayableById(communityId, payableId);
}

/**
 * Pre-flight guard: verify that the given actor is the user who created the PI.
 * Used by the update-intent route to prevent cross-owner PI manipulation.
 */
export async function requireActorOwnsPi(
  paymentIntentId: string,
  actorUserId: string,
  communityId: number,
): Promise<void> {
  const stripe = getStripeClient();
  // Direct charges live on the connected account, so a bare retrieve against
  // the platform account raises `No such payment_intent` (F-15).
  const stripeAccount = await requireConnectedAccountId(communityId);
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId, undefined, {
    stripeAccount,
  });
  const piUserId = parseMetadataString(intent.metadata ?? {}, 'userId');
  if (piUserId && piUserId !== actorUserId) {
    throw new ForbiddenError('You can only update your own payment intent');
  }
}

export interface UpdatePaymentIntentFeeResult {
  convenienceFeeCents: number;
  totalChargeCents: number;
}

export async function updatePaymentIntentFee(
  communityId: number,
  paymentIntentId: string,
  paymentMethod: 'card' | 'us_bank_account',
  actorUserId: string,
): Promise<UpdatePaymentIntentFeeResult> {
  const stripe = getStripeClient();
  const stripeAccount = await requireConnectedAccountId(communityId);
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId, undefined, {
    stripeAccount,
  });

  // Security: verify the PI belongs to this community
  const piCommunityId = parseMetadataInt(intent.metadata ?? {}, 'communityId');
  if (piCommunityId !== communityId) {
    throw new ForbiddenError('Payment intent does not belong to this community');
  }

  // Prevent updating a PI that's already been confirmed or canceled
  if (intent.status !== 'requires_payment_method' && intent.status !== 'requires_confirmation' && intent.status !== 'requires_action') {
    throw new UnprocessableEntityError('Payment intent cannot be updated in its current state');
  }

  const baseAmountCents = parseMetadataInt(intent.metadata, 'baseAmountCents');
  if (!baseAmountCents || baseAmountCents <= 0) {
    throw new UnprocessableEntityError('Payment intent is missing base amount metadata');
  }

  const feePolicy = await getCommunityFeePolicy(communityId);

  if (feePolicy === 'owner_pays') {
    const convenienceFeeCents = calculateConvenienceFee(baseAmountCents, paymentMethod);
    const totalChargeCents = baseAmountCents + convenienceFeeCents;

    await stripe.paymentIntents.update(
      paymentIntentId,
      {
        amount: totalChargeCents,
        // Unchanged from the destination-charge design: our cut is still the
        // application fee. Only the account the charge lives on has moved.
        application_fee_amount: convenienceFeeCents,
        metadata: {
          ...intent.metadata,
          convenienceFeeCents: String(convenienceFeeCents),
          paymentMethod,
        },
      },
      { stripeAccount },
    );

    return { convenienceFeeCents, totalChargeCents };
  }

  // association_absorbs: owner pays base amount, association transfer is reduced
  const stripeFeeEstimate = calculateStripeFeeEstimate(baseAmountCents, paymentMethod);

  await stripe.paymentIntents.update(
    paymentIntentId,
    {
      amount: baseAmountCents,
      application_fee_amount: stripeFeeEstimate,
      metadata: {
        ...intent.metadata,
        convenienceFeeCents: '0',
        paymentMethod,
      },
    },
    { stripeAccount },
  );

  return { convenienceFeeCents: 0, totalChargeCents: baseAmountCents };
}

export interface CreatePaymentIntentResult {
  paymentIntentId: string;
  clientSecret: string;
  amountCents: number;
  convenienceFeeCents: number;
  totalChargeCents: number;
  currency: string;
  feePolicy: PaymentFeePolicy;
  /**
   * The association's connected account.
   *
   * The browser MUST initialise Stripe.js with `{ stripeAccount }` — a
   * direct-charge client secret does not resolve against the platform account,
   * so without this the payment element fails to mount and the resident sees a
   * blank dialog rather than an error (F-15).
   */
  stripeAccountId: string;
}

async function createPaymentIntentForPayable(
  communityId: number,
  input: {
    payableType: PayableType;
    payableId: number;
    actorUserId: string;
    allowedUnitId?: number;
    requestId?: string | null;
  },
): Promise<CreatePaymentIntentResult> {
  const payable = await getPayableById(communityId, input.payableType, input.payableId);
  if (!payable) {
    if (input.payableType === 'assessment_line_item') {
      throw new NotFoundError('Assessment line item not found');
    }
    throw new NotFoundError('Payable item not found');
  }
  if (input.allowedUnitId !== undefined && payable.unitId !== input.allowedUnitId) {
    throw new ForbiddenError('You can only pay payables for your own unit');
  }
  if (payable.status === 'paid' || payable.status === 'waived') {
    throw new UnprocessableEntityError('This payable is not payable in its current state');
  }

  const connectAccount = await requireConnectAccount(communityId);
  if (!connectAccount.onboardingComplete || !connectAccount.chargesEnabled) {
    throw new UnprocessableEntityError('Stripe Connect onboarding is incomplete for this community');
  }

  const stripe = getStripeClient();
  const amountCents = payable.amountCents + payable.lateFeeCents;
  if (amountCents <= 0) {
    throw new BadRequestError('Payable amount must be greater than zero');
  }

  const feePolicy = await getCommunityFeePolicy(communityId);

  const stripeMetadataBase: StripePayableMetadata = {
    communityId: String(communityId),
    payableType: input.payableType,
    payableId: String(payable.payableId),
    payableSourceType: payable.payableSourceType,
    payableSourceId: payable.payableSourceId,
    unitId: String(payable.unitId),
    userId: input.actorUserId,
    baseAmountCents: String(amountCents),
    convenienceFeeCents: '0',
    ...toLegacyMetadata(payable),
  };
  const stripeMetadata: Stripe.MetadataParam = { ...stripeMetadataBase };

  // ── DIRECT charge, not a destination charge (F-15) ──────────────────────
  //
  // The `{ stripeAccount }` request option creates the PaymentIntent ON the
  // association's own connected account. Three things change, all of them the
  // point:
  //
  //  1. Assessment funds never transit PropertyPro's Stripe balance. Our
  //     customers are fiduciaries with association-funds segregation duties;
  //     money briefly sitting in a vendor's account is the kind of detail that
  //     surfaces in an association's annual audit.
  //  2. The association becomes the merchant of record, so a chargeback on a
  //     $4,000 special assessment debits THEIR balance, not ours. On a
  //     destination charge the platform carries that liability and recovers
  //     from the association only if it can.
  //  3. Money-transmission questions stop arising, because we stop holding and
  //     forwarding other people's money.
  //
  // Our cut is unchanged — `application_fee_amount` replaces `transfer_data`
  // and is set on the update path where the fee is actually known.
  //
  // ⚠️ EVERY later call touching this PaymentIntent must pass the same
  // `{ stripeAccount }`, and the BROWSER must initialise Stripe.js with it too
  // — a direct-charge client secret is not resolvable from the platform
  // account. That is why `stripeAccountId` is returned to the caller.
  const intent = await stripe.paymentIntents.create(
    {
      amount: amountCents,
      currency: 'usd',
      payment_method_types: ['card', 'us_bank_account'],
      metadata: stripeMetadata,
    },
    { stripeAccount: connectAccount.stripeAccountId },
  );

  if (!intent.client_secret) {
    throw new Error('Stripe did not return a client_secret for PaymentIntent');
  }

  const scoped = createScopedClient(communityId);
  if (payable.payableType === 'assessment_line_item') {
    await scoped.update(
      assessmentLineItems,
      { paymentIntentId: intent.id },
      eq(assessmentLineItems.id, payable.payableId),
    );
  }

  await logAuditEvent({
    userId: input.actorUserId,
    action: 'update',
    resourceType: payable.payableType === 'rent_obligation' ? 'rent_obligation' : 'assessment_line_item',
    resourceId: String(payable.payableId),
    communityId,
    oldValues: {
      paymentIntentId: payable.paymentIntentId,
    },
    newValues: {
      paymentIntentId: intent.id,
      amountCents,
      payableType: input.payableType,
      payableId: payable.payableId,
    },
    metadata: { requestId: input.requestId ?? null },
  });

  return {
    paymentIntentId: intent.id,
    clientSecret: intent.client_secret,
    amountCents,
    convenienceFeeCents: 0,
    totalChargeCents: amountCents,
    currency: intent.currency,
    feePolicy,
    stripeAccountId: connectAccount.stripeAccountId,
  };
}

export async function createPaymentIntentForLineItem(
  communityId: number,
  input: CreatePaymentIntentInput,
): Promise<CreatePaymentIntentResult> {
  const payableType = input.payableType ?? 'assessment_line_item';
  const payableId = input.payableId ?? input.lineItemId;

  return createPaymentIntentForPayable(communityId, {
    payableType,
    payableId,
    actorUserId: input.actorUserId,
    allowedUnitId: input.allowedUnitId,
    requestId: input.requestId,
  });
}

export async function listPaymentHistoryForCommunity(
  communityId: number,
  unitId?: number,
): Promise<PaymentHistoryRecord[]> {
  const scoped = createScopedClient(communityId);
  const assessmentWhereClause = unitId !== undefined
    ? and(eq(assessmentLineItems.unitId, unitId), eq(assessmentLineItems.status, 'paid'))
    : eq(assessmentLineItems.status, 'paid');

  const assessmentRows = await scoped
    .selectFrom<AssessmentLineItemRecord>(assessmentLineItems, {}, assessmentWhereClause)
    .orderBy(desc(assessmentLineItems.paidAt), desc(assessmentLineItems.id));

  const rentWhereClause = unitId !== undefined
    ? and(eq(rentObligations.unitId, unitId), eq(rentObligations.status, 'paid'))
    : eq(rentObligations.status, 'paid');
  let rentRows: RentObligationRecord[] = [];
  try {
    rentRows = await scoped
      .selectFrom<RentObligationRecord>(rentObligations, {}, rentWhereClause)
      .orderBy(desc(rentObligations.updatedAt), desc(rentObligations.id));
  } catch (err) {
    if (!isMissingRelationError(err)) {
      throw err;
    }
  }

  const assessmentHistory: PaymentHistoryRecord[] = assessmentRows.map((row) => ({
    payableType: 'assessment_line_item',
    payableId: row.id,
    payableSourceType: 'assessment',
    payableSourceId: String(row.id),
    unitId: row.unitId,
    amountCents: row.amountCents,
    dueDate: row.dueDate,
    status: assertLineItemStatus(row.status),
    paidAt: row.paidAt,
    assessmentId: row.assessmentId,
    leaseId: null,
    lateFeeCents: row.lateFeeCents,
  }));
  const rentHistory: PaymentHistoryRecord[] = rentRows.map((row) => ({
    payableType: 'rent_obligation',
    payableId: row.id,
    payableSourceType: 'rent',
    payableSourceId: String(row.id),
    unitId: row.unitId,
    amountCents: row.amountCents,
    dueDate: row.dueDate,
    status: row.status,
    paidAt: row.updatedAt,
    assessmentId: null,
    leaseId: row.leaseId,
    lateFeeCents: 0,
  }));

  return [...assessmentHistory, ...rentHistory].sort((a, b) => {
    const aTime = a.paidAt ? a.paidAt.getTime() : 0;
    const bTime = b.paidAt ? b.paidAt.getTime() : 0;
    return bTime - aTime;
  });
}

export interface StatementLineItem {
  id: number;
  assessmentId: number | null;
  unitId: number;
  dueDate: string;
  status: PayableStatus;
  amountCents: number;
  lateFeeCents: number;
  paidAt: Date | null;
  paymentIntentId: string | null;
}

/**
 * Exact money totals for a statement, computed in SQL over EVERY outstanding
 * item (no date window, no row cap), so they never depend on which rows the
 * list shows. `partially_paid` counts in full, as the portal always did.
 */
export interface StatementSummary {
  totalDueCents: number;
  overdueCount: number;
  outstandingCount: number;
}

export interface UnitStatement {
  unitId: number;
  balanceCents: number;
  ledgerEntries: Awaited<ReturnType<typeof listLedgerEntries>>;
  /** Outstanding items (oldest due first), then history in the window (newest first). */
  lineItems: StatementLineItem[];
  summary: StatementSummary;
  /** True when either list had more than `limit` items; `summary` is still exact. */
  truncated: boolean;
}

/**
 * Rows listed per group. Each source is read with ONE extra row, so
 * `merged.length > limit` is an exact "something was dropped" signal.
 */
const STATEMENT_LINE_ITEM_LIMIT = 200;
/** PDF exports list (practically) everything; the PDF prints a note past this. */
export const STATEMENT_EXPORT_LIMIT = 5000;

// Outstanding = owed. Assessment line items have no partial state; rent does.
const ASSESSMENT_OUTSTANDING_STATUSES: AssessmentLineItemStatus[] = ['pending', 'overdue'];
const RENT_OUTSTANDING_STATUSES: RentObligationRecord['status'][] = ['pending', 'partially_paid', 'overdue'];

interface StatementReadOptions {
  unitId?: number;
  startDate?: string;
  endDate?: string;
  limit: number;
}

interface StatementRead {
  outstanding: StatementLineItem[];
  history: StatementLineItem[];
  summary: StatementSummary;
  truncated: boolean;
  outstandingRows: number;
  historyRows: number;
}

interface StatementSummaryRow {
  [key: string]: unknown;
  totalDueCents: number | string | null;
  overdueCount: number;
  outstandingCount: number;
}

function andAll(clauses: SQL[]): SQL | undefined {
  if (clauses.length === 0) return undefined;
  return clauses.length === 1 ? clauses[0] : and(...clauses);
}

/**
 * The one statement reader, shared by the unit and community statements.
 *
 * OUTSTANDING (pending | partially_paid | overdue) ignores the date window: an
 * item overdue for 120 days, or due next month, is still money owed. Before
 * 2026-09-30 the default 90-day window dropped both from "Total due" while the
 * ledger balance kept them. It is ordered oldest-due first, so a cap drops the
 * newest items, never the most overdue.
 *
 * HISTORY (every other status) keeps the window and is ordered newest first.
 */
async function readStatementLineItems(
  scoped: ReturnType<typeof createScopedClient>,
  options: StatementReadOptions,
): Promise<StatementRead> {
  const { unitId, startDate, endDate, limit } = options;

  const assessmentBase: SQL[] = unitId === undefined ? [] : [eq(assessmentLineItems.unitId, unitId)];
  const assessmentWindow: SQL[] = [
    ...(startDate !== undefined ? [gte(assessmentLineItems.dueDate, startDate)] : []),
    ...(endDate !== undefined ? [lte(assessmentLineItems.dueDate, endDate)] : []),
  ];
  const assessmentOutstanding = andAll([
    ...assessmentBase,
    inArray(assessmentLineItems.status, ASSESSMENT_OUTSTANDING_STATUSES),
  ]);
  const assessmentHistory = andAll([
    ...assessmentBase,
    notInArray(assessmentLineItems.status, ASSESSMENT_OUTSTANDING_STATUSES),
    ...assessmentWindow,
  ]);

  const rentBase: SQL[] = unitId === undefined ? [] : [eq(rentObligations.unitId, unitId)];
  const rentWindow: SQL[] = [
    ...(startDate !== undefined ? [gte(rentObligations.dueDate, startDate)] : []),
    ...(endDate !== undefined ? [lte(rentObligations.dueDate, endDate)] : []),
  ];
  const rentOutstanding = andAll([...rentBase, inArray(rentObligations.status, RENT_OUTSTANDING_STATUSES)]);
  const rentHistory = andAll([
    ...rentBase,
    notInArray(rentObligations.status, RENT_OUTSTANDING_STATUSES),
    ...rentWindow,
  ]);

  const [assessmentOutstandingRows, assessmentHistoryRows, [assessmentSummary]] = await Promise.all([
    scoped
      .selectFrom<AssessmentLineItemRecord>(assessmentLineItems, {}, assessmentOutstanding)
      .orderBy(asc(assessmentLineItems.dueDate), asc(assessmentLineItems.id))
      .limit(limit + 1),
    scoped
      .selectFrom<AssessmentLineItemRecord>(assessmentLineItems, {}, assessmentHistory)
      .orderBy(desc(assessmentLineItems.dueDate), desc(assessmentLineItems.id))
      .limit(limit + 1),
    scoped.selectFrom<StatementSummaryRow>(
      assessmentLineItems,
      {
        totalDueCents: sql<string>`coalesce(sum(${assessmentLineItems.amountCents} + ${assessmentLineItems.lateFeeCents}), 0)::bigint`,
        overdueCount: sql<number>`(count(*) filter (where ${assessmentLineItems.status} = 'overdue'))::int`,
        outstandingCount: sql<number>`count(*)::int`,
      },
      assessmentOutstanding,
    ),
  ]);

  // rent_obligations may not exist in older environments (42P01): no rent.
  let rentOutstandingRows: RentObligationRecord[] = [];
  let rentHistoryRows: RentObligationRecord[] = [];
  let rentSummary: StatementSummaryRow | undefined;
  try {
    [rentOutstandingRows, rentHistoryRows, [rentSummary]] = await Promise.all([
      scoped
        .selectFrom<RentObligationRecord>(rentObligations, {}, rentOutstanding)
        .orderBy(asc(rentObligations.dueDate), asc(rentObligations.id))
        .limit(limit + 1),
      scoped
        .selectFrom<RentObligationRecord>(rentObligations, {}, rentHistory)
        .orderBy(desc(rentObligations.dueDate), desc(rentObligations.id))
        .limit(limit + 1),
      scoped.selectFrom<StatementSummaryRow>(
        rentObligations,
        {
          // Rent carries no late fee on a statement (forced to 0 below).
          totalDueCents: sql<string>`coalesce(sum(${rentObligations.amountCents}), 0)::bigint`,
          overdueCount: sql<number>`(count(*) filter (where ${rentObligations.status} = 'overdue'))::int`,
          outstandingCount: sql<number>`count(*)::int`,
        },
        rentOutstanding,
      ),
    ]);
  } catch (err) {
    if (!isMissingRelationError(err)) {
      throw err;
    }
  }

  const fromAssessment = (row: AssessmentLineItemRecord): StatementLineItem => ({
    id: row.id,
    assessmentId: row.assessmentId,
    unitId: row.unitId,
    dueDate: row.dueDate,
    status: assertLineItemStatus(row.status),
    amountCents: row.amountCents,
    lateFeeCents: row.lateFeeCents,
    paidAt: row.paidAt,
    paymentIntentId: row.paymentIntentId,
  });
  const fromRent = (row: RentObligationRecord): StatementLineItem => ({
    id: row.id,
    assessmentId: null,
    unitId: row.unitId,
    dueDate: row.dueDate,
    status: row.status,
    amountCents: row.amountCents,
    lateFeeCents: 0,
    paidAt: null,
    paymentIntentId: null,
  });

  // Stable sorts: same-date ties keep assessments before rent.
  const outstanding = [...assessmentOutstandingRows.map(fromAssessment), ...rentOutstandingRows.map(fromRent)]
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const history = [...assessmentHistoryRows.map(fromAssessment), ...rentHistoryRows.map(fromRent)]
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate));

  const count = (value: number | string | null | undefined): number => Number(value ?? 0);
  return {
    outstanding: outstanding.slice(0, limit),
    history: history.slice(0, limit),
    summary: {
      totalDueCents: count(assessmentSummary?.totalDueCents) + count(rentSummary?.totalDueCents),
      overdueCount: count(assessmentSummary?.overdueCount) + count(rentSummary?.overdueCount),
      outstandingCount: count(assessmentSummary?.outstandingCount) + count(rentSummary?.outstandingCount),
    },
    truncated: outstanding.length > limit || history.length > limit,
    outstandingRows: outstanding.length,
    historyRows: history.length,
  };
}

export async function buildUnitStatement(
  communityId: number,
  unitId: number,
  startDate?: string,
  endDate?: string,
  options: { limit?: number } = {},
): Promise<UnitStatement> {
  const scoped = createScopedClient(communityId);
  const limit = options.limit ?? STATEMENT_LINE_ITEM_LIMIT;
  const read = await readStatementLineItems(scoped, { unitId, startDate, endDate, limit });

  const ledgerEntriesForUnit = await listLedgerEntries(scoped, {
    unitId,
    startDate,
    endDate,
    limit: 500,
  });
  const balanceCents = await getUnitLedgerBalance(scoped, unitId);

  // A capped list still looks complete to its reader, so never cap it
  // silently: flag it for the page and report it (roadmap 3.8).
  if (read.truncated) {
    captureMessage('unit_statement_truncated', {
      level: 'warning',
      extra: {
        communityId,
        unitId,
        outstandingRows: read.outstandingRows,
        historyRows: read.historyRows,
        limit,
      },
    });
  }

  return {
    unitId,
    balanceCents,
    ledgerEntries: ledgerEntriesForUnit,
    lineItems: [...read.outstanding, ...read.history],
    summary: read.summary,
    truncated: read.truncated,
  };
}

export interface CommunityStatementLineItem extends StatementLineItem {
  unitNumber: string;
}

export interface CommunityStatement {
  balanceCents: number;
  ledgerEntries: Awaited<ReturnType<typeof listLedgerEntries>>;
  /** Outstanding items (oldest due first), then history in the window (newest first). */
  lineItems: CommunityStatementLineItem[];
  summary: StatementSummary;
  /** True when either list had more than `limit` items; `summary` is still exact. */
  truncated: boolean;
}

/**
 * Builds a community-wide statement for the management tier — property_manager
 * / root_manager, admitted by `requirePermission(membership, 'finances', 'read')`
 * on the `manager` matrix row.
 *
 * NOT board members: `resolveMatrixRole` never reads `designation`, so a
 * board-designated user is still `resident` and is routed to
 * `buildUnitStatement` (owner) or refused (tenant).
 *
 * Lists every unit's outstanding items (any due date) and payment history in
 * the window, via the same reader as the unit statement. Each line item
 * includes both `unitId` and `unitNumber` so staff can identify which unit
 * each entry belongs to.
 */
export async function buildCommunityStatement(
  communityId: number,
  startDate?: string,
  endDate?: string,
  options: { limit?: number } = {},
): Promise<CommunityStatement> {
  const scoped = createScopedClient(communityId);
  const limit = options.limit ?? STATEMENT_LINE_ITEM_LIMIT;

  // Unit lookup — used to hydrate unitNumber on every line item.
  interface UnitLookupRow {
    [key: string]: unknown;
    id: number;
    unitNumber: string;
  }
  const unitRows = await scoped.selectFrom<UnitLookupRow>(
    units,
    { id: units.id, unitNumber: units.unitNumber },
  );
  const unitNumberById = new Map<number, string>();
  for (const row of unitRows) {
    unitNumberById.set(row.id, row.unitNumber);
  }

  const read = await readStatementLineItems(scoped, { startDate, endDate, limit });

  const ledgerEntriesForCommunity = await listLedgerEntries(scoped, {
    startDate,
    endDate,
    limit: 500,
  });

  // Community balance = sum of per-unit balances across all known units.
  let balanceCents = 0;
  for (const row of unitRows) {
    balanceCents += await getUnitLedgerBalance(scoped, row.id);
  }

  // The likelier of the two to fire: a ~70-unit community on monthly
  // assessments passes 200 history items in the default 90-day window.
  if (read.truncated) {
    captureMessage('community_statement_truncated', {
      level: 'warning',
      extra: {
        communityId,
        outstandingRows: read.outstandingRows,
        historyRows: read.historyRows,
        limit,
      },
    });
  }

  return {
    balanceCents,
    ledgerEntries: ledgerEntriesForCommunity,
    lineItems: [...read.outstanding, ...read.history].map((item) => ({
      ...item,
      unitNumber: unitNumberById.get(item.unitId) ?? '',
    })),
    summary: read.summary,
    truncated: read.truncated,
  };
}

export async function listDelinquentUnits(
  communityId: number,
  lienThresholdDays: number,
): Promise<Array<{
  unitId: number;
  overdueAmountCents: number;
  daysOverdue: number;
  lineItemCount: number;
  lienEligible: boolean;
}>> {
  const scoped = createScopedClient(communityId);
  const today = format(new Date(), 'yyyy-MM-dd');
  // Strictly before today — the same predicate processOverdueTransitions uses.
  // An installment due today is not late yet, so it is not delinquent.
  // `pending` stays in the set so an item the daily cron has not yet flipped to
  // `overdue` still counts once it is past due.
  const overdueItems = await scoped.selectFrom<AssessmentLineItemRecord>(
    assessmentLineItems,
    {},
    and(
      inArray(assessmentLineItems.status, ['pending', 'overdue']),
      lt(assessmentLineItems.dueDate, today),
    ),
  );

  const bucket = new Map<number, { overdueAmountCents: number; daysOverdue: number; lineItemCount: number }>();
  for (const item of overdueItems) {
    const dueDate = new Date(`${item.dueDate}T00:00:00.000Z`);
    const daysOverdue = Math.max(0, differenceInCalendarDays(new Date(), dueDate));
    const current = bucket.get(item.unitId) ?? {
      overdueAmountCents: 0,
      daysOverdue: 0,
      lineItemCount: 0,
    };
    current.overdueAmountCents += item.amountCents + item.lateFeeCents;
    current.daysOverdue = Math.max(current.daysOverdue, daysOverdue);
    current.lineItemCount += 1;
    bucket.set(item.unitId, current);
  }

  return [...bucket.entries()]
    .map(([unitId, value]) => ({
      unitId,
      overdueAmountCents: value.overdueAmountCents,
      daysOverdue: value.daysOverdue,
      lineItemCount: value.lineItemCount,
      lienEligible: value.daysOverdue >= lienThresholdDays,
    }))
    .sort((a, b) => b.overdueAmountCents - a.overdueAmountCents);
}

export async function waiveLateFeesForUnit(
  communityId: number,
  unitId: number,
  actorUserId: string,
  requestId?: string | null,
): Promise<{ waivedCount: number; waivedAmountCents: number }> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom<AssessmentLineItemRecord>(
    assessmentLineItems,
    {},
    and(
      eq(assessmentLineItems.unitId, unitId),
      inArray(assessmentLineItems.status, ['pending', 'overdue']),
    ),
  );

  const candidates = rows.filter((row) => row.lateFeeCents > 0);
  if (candidates.length === 0) {
    return { waivedCount: 0, waivedAmountCents: 0 };
  }

  let waivedAmountCents = 0;
  for (const candidate of candidates) {
    waivedAmountCents += candidate.lateFeeCents;
    await scoped.update(
      assessmentLineItems,
      { lateFeeCents: 0 },
      eq(assessmentLineItems.id, candidate.id),
    );

    await postLedgerEntry(scoped, {
      entryType: 'adjustment',
      amountCents: -Math.abs(candidate.lateFeeCents),
      description: `Late fee waived for line item #${candidate.id}`,
      sourceType: 'manual',
      sourceId: String(candidate.id),
      unitId: candidate.unitId,
      userId: actorUserId,
      metadata: {
        lineItemId: candidate.id,
        notes: 'Late fee waiver',
      },
      createdByUserId: actorUserId,
      requestId: requestId ?? undefined,
    });
  }

  await logAuditEvent({
    userId: actorUserId,
    action: 'update',
    resourceType: 'assessment_line_item',
    resourceId: String(unitId),
    communityId,
    newValues: { waivedCount: candidates.length, waivedAmountCents },
    metadata: { requestId: requestId ?? null },
  });

  return { waivedCount: candidates.length, waivedAmountCents };
}

export async function exportLedgerCsv(
  communityId: number,
  unitId?: number,
  startDate?: string,
  endDate?: string,
): Promise<string> {
  const scoped = createScopedClient(communityId);
  const rows = await listLedgerEntries(scoped, {
    unitId,
    startDate,
    endDate,
    limit: 10_000,
  });

  const payload = rows.map((row) => ({
    id: row.id,
    effectiveDate: row.effectiveDate,
    entryType: row.entryType,
    amountDollars: (row.amountCents / 100).toFixed(2),
    description: row.description,
    sourceType: row.sourceType,
    sourceId: row.sourceId ?? '',
    unitId: row.unitId ?? '',
  }));

  return generateCSV(FINANCE_EXPORT_HEADERS, payload);
}

export async function exportStatementPdf(
  communityId: number,
  unitId: number,
  startDate?: string,
  endDate?: string,
): Promise<Uint8Array> {
  const statement = await buildUnitStatement(communityId, unitId, startDate, endDate, {
    limit: STATEMENT_EXPORT_LIMIT,
  });
  return generateFinanceStatementPdf(statement);
}

export async function exportCommunityStatementPdf(
  communityId: number,
  startDate?: string,
  endDate?: string,
): Promise<Uint8Array> {
  const statement = await buildCommunityStatement(communityId, startDate, endDate, {
    limit: STATEMENT_EXPORT_LIMIT,
  });
  return generateCommunityFinanceStatementPdf({
    communityId,
    balanceCents: statement.balanceCents,
    ledgerEntries: statement.ledgerEntries,
    lineItems: statement.lineItems.map((item) => ({
      unitNumber: item.unitNumber,
      dueDate: item.dueDate,
      status: item.status,
      amountCents: item.amountCents,
      lateFeeCents: item.lateFeeCents,
    })),
    truncated: statement.truncated,
  });
}

function getStripeBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

/**
 * Initiates Stripe Connect Standard onboarding via OAuth.
 *
 * Instead of creating an Express account, we redirect the user to
 * Stripe's OAuth authorization page where they connect (or create)
 * their own Standard Stripe account.
 */
export async function startConnectOnboarding(
  communityId: number,
  actorUserId: string,
  requestId?: string | null,
): Promise<{ onboardingUrl: string }> {
  const clientId = process.env.STRIPE_CONNECT_CLIENT_ID;
  if (!clientId) {
    // Two distinct jobs here, and neither one covers the other.
    //
    // 1. The THROW is typed so the admin sees "payments aren't set up" instead
    //    of a bare error page. A plain `Error` reaches the client as a generic
    //    500 INTERNAL_ERROR, which reads as "the app is broken" rather than
    //    "this environment is missing a key".
    //
    // 2. The CAPTURE is explicit because `withErrorHandler` returns early for
    //    every `AppError` — BEFORE it reaches `Sentry.captureException`, which
    //    only runs for unknown errors. So typing this error would otherwise
    //    have made a real misconfiguration *less* visible than the untyped
    //    `Error` it replaced: better UX, zero operator signal. Capturing at
    //    the throw site keeps both.
    //
    // Not routed through the readiness probe on purpose: resident payments are
    // gated off per community (`assessmentPaymentsEnabled`), so a readiness
    // entry would hold production at 'degraded' indefinitely for a feature
    // nobody has switched on — which is how a probe gets ignored.
    captureMessage('stripe_connect_client_id_missing', {
      level: 'error',
      extra: { communityId, requestId: requestId ?? null },
    });
    throw new AppError(
      'Resident payments are not configured for this environment.',
      503,
      'PAYMENTS_NOT_CONFIGURED',
    );
  }

  const baseUrl = getStripeBaseUrl();
  const payload = JSON.stringify({ communityId, userId: actorUserId, ts: Date.now() });
  const sig = signPayload(payload);
  const state = Buffer.from(JSON.stringify({ p: payload, s: sig })).toString('base64url');
  const redirectUri = `${baseUrl}/settings/payments/connected`;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: 'read_write',
    redirect_uri: redirectUri,
    state,
  });

  const onboardingUrl = `https://connect.stripe.com/oauth/authorize?${params.toString()}`;

  await logAuditEvent({
    userId: actorUserId,
    action: 'create',
    resourceType: 'stripe_connect_oauth_start',
    resourceId: String(communityId),
    communityId,
    metadata: { requestId: requestId ?? null },
  });

  return { onboardingUrl };
}

const CONNECT_STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Validates the HMAC-signed OAuth state parameter returned from Stripe
 * Connect. Throws on forgery, expiry, or community/user mismatch.
 */
export function validateConnectOAuthState(
  stateParam: string | null,
  expectedCommunityId: number,
  expectedUserId: string,
): void {
  if (!stateParam) {
    throw new BadRequestError('Missing OAuth state parameter');
  }

  let outer: { p: string; s: string };
  try {
    outer = JSON.parse(Buffer.from(stateParam, 'base64url').toString());
  } catch {
    throw new BadRequestError('Invalid OAuth state parameter');
  }

  if (!outer.p || !outer.s || !verifySignature(outer.p, outer.s)) {
    throw new ForbiddenError('OAuth state signature invalid');
  }

  let parsed: { communityId: number; userId: string; ts: number };
  try {
    parsed = JSON.parse(outer.p);
  } catch {
    throw new BadRequestError('Invalid OAuth state payload');
  }

  if (parsed.communityId !== expectedCommunityId) {
    throw new ForbiddenError('OAuth state communityId mismatch');
  }
  if (parsed.userId !== expectedUserId) {
    throw new ForbiddenError('OAuth state userId mismatch');
  }
  if (Date.now() - parsed.ts > CONNECT_STATE_MAX_AGE_MS) {
    throw new BadRequestError('OAuth state has expired — please try connecting again');
  }
}

/**
 * Completes Stripe Connect Standard onboarding by exchanging the OAuth
 * authorization code for the connected account ID.
 */
export async function completeConnectOnboarding(
  communityId: number,
  code: string,
  actorUserId: string,
  requestId?: string | null,
): Promise<{ stripeAccountId: string; chargesEnabled: boolean; payoutsEnabled: boolean }> {
  const stripe = getStripeClient();
  const response = await stripe.oauth.token({
    grant_type: 'authorization_code',
    code,
  });

  const stripeAccountId = response.stripe_user_id;
  if (!stripeAccountId) {
    throw new Error('Stripe OAuth did not return a stripe_user_id');
  }

  // Retrieve the account to check capabilities and type
  const account = await stripe.accounts.retrieve(stripeAccountId);

  if (account.type !== 'standard') {
    throw new BadRequestError(
      `Only Standard Stripe accounts are supported. Got: ${account.type}`,
    );
  }

  const onboardingComplete = !!account.details_submitted;
  const chargesEnabled = account.charges_enabled;
  const payoutsEnabled = account.payouts_enabled;

  const scoped = createScopedClient(communityId);
  const existingRows = await scoped.selectFrom<StripeConnectedAccountRecord>(stripeConnectedAccounts, {});

  if (existingRows[0]) {
    // Update existing record with new account
    await scoped.update(
      stripeConnectedAccounts,
      {
        stripeAccountId,
        onboardingComplete,
        chargesEnabled,
        payoutsEnabled,
      },
      eq(stripeConnectedAccounts.id, existingRows[0].id),
    );
  } else {
    await scoped.insert(stripeConnectedAccounts, {
      stripeAccountId,
      onboardingComplete,
      chargesEnabled,
      payoutsEnabled,
    });
  }

  await logAuditEvent({
    userId: actorUserId,
    action: 'create',
    resourceType: 'stripe_connected_account',
    resourceId: stripeAccountId,
    communityId,
    metadata: { requestId: requestId ?? null },
  });

  return { stripeAccountId, chargesEnabled, payoutsEnabled };
}

export async function getConnectStatus(
  communityId: number,
): Promise<{
  connected: boolean;
  stripeAccountId: string | null;
  onboardingComplete: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
}> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom<StripeConnectedAccountRecord>(stripeConnectedAccounts, {});
  const record = rows[0];
  if (!record) {
    return {
      connected: false,
      stripeAccountId: null,
      onboardingComplete: false,
      chargesEnabled: false,
      payoutsEnabled: false,
    };
  }

  const stripe = getStripeClient();
  const account = await stripe.accounts.retrieve(record.stripeAccountId);
  const onboardingComplete = !!account.details_submitted;
  const chargesEnabled = account.charges_enabled;
  const payoutsEnabled = account.payouts_enabled;

  await scoped.update(
    stripeConnectedAccounts,
    {
      onboardingComplete,
      chargesEnabled,
      payoutsEnabled,
    },
    eq(stripeConnectedAccounts.id, record.id),
  );

  return {
    connected: true,
    stripeAccountId: record.stripeAccountId,
    onboardingComplete,
    chargesEnabled,
    payoutsEnabled,
  };
}

/**
 * An event whose finance fence row already exists reached processing again.
 *
 * This is NOT treated as "already processed, skip". The fence is inserted
 * BEFORE the payable update, ledger postings, rent-payment insert and fine
 * update, and none of that runs in one transaction with it — so an existing
 * fence cannot tell "fully processed" from "failed halfway". Skipping would
 * silently drop whatever the failed attempt never wrote; re-processing would
 * double-post the ledger (`ledger_entries` has no unique key). Failing loudly
 * keeps the platform fence's `processedAt` null, so the event stays visible
 * (Sentry, 500s, Stripe's retry dashboard) for a human to reconcile.
 *
 * ponytail: the real fix is fence + writes in one transaction. Deferred to the
 * finance characterization work (roadmap 3.T2), which must land before any
 * finance restructuring. Trigger: 3.T2 lands, or the first live finance event
 * (`finance_stripe_webhook_events` held 0 rows in production on 2026-09-28).
 */
export class FinanceWebhookFenceConflict extends Error {
  constructor(readonly eventId: string) {
    super(`Finance webhook event ${eventId} was already fenced; refusing to skip or re-process it`);
    this.name = 'FinanceWebhookFenceConflict';
  }
}

async function recordFinanceStripeEvent(
  communityId: number,
  event: Stripe.Event,
): Promise<void> {
  const scoped = createScopedClient(communityId);
  try {
    await scoped.insert(financeStripeWebhookEvents, {
      stripeEventId: event.id,
      eventType: event.type,
      payload: {
        id: event.id,
        type: event.type,
        created: event.created,
      },
    });
  } catch (err) {
    if (isNamedUniqueViolation(err, 'finance_stripe_webhook_events_event_id_unique')) {
      logFinanceWebhookEvent('error', 'Finance webhook event already fenced; needs reconciliation', {
        eventId: event.id,
        eventType: event.type,
        communityId,
        errorCode: FINANCE_WEBHOOK_ERROR_CODES.DUPLICATE_EVENT,
        category: 'idempotency',
        metricName: 'finance_webhook_event',
        outcome: 'failure',
      });
      throw new FinanceWebhookFenceConflict(event.id);
    }
    throw err;
  }
}

/**
 * Fire-and-forget payment confirmation email to the payer.
 * Failures are logged but never block webhook processing.
 */
async function sendPaymentConfirmationEmail(
  communityId: number,
  payerUserId: string,
  amountCents: number,
  lineItem: Pick<AssessmentLineItemRecord, 'assessmentId' | 'unitId' | 'dueDate'>,
  receipt: PaymentReceiptDetails = {},
): Promise<void> {
  const scoped = createScopedClient(communityId);

  // Look up payer email/name (users table has no community_id — scoped client
  // applies only deletedAt IS NULL, which is correct)
  const userRows = await scoped.selectFrom<{ email: string; fullName: string | null }>(
    users,
    { email: users.email, fullName: users.fullName },
    eq(users.id, payerUserId),
  );
  const payer = userRows[0];
  if (!payer?.email) return;

  // Look up community name
  const communityRows = await scoped.selectFrom<{ name: string }>(
    communities,
    { name: communities.name },
  );
  const communityName = communityRows[0]?.name ?? 'Your Community';

  // Look up assessment title (if linked)
  let assessmentTitle = 'Assessment';
  if (lineItem.assessmentId) {
    const assessmentRows = await scoped.selectFrom<{ title: string }>(
      assessments,
      { title: assessments.title },
      eq(assessments.id, lineItem.assessmentId),
    );
    assessmentTitle = assessmentRows[0]?.title ?? 'Assessment';
  }

  // Compute remaining balance
  const balanceCents = await getUnitLedgerBalance(scoped, lineItem.unitId);

  const portalUrl = `${getBaseUrl()}/payments?communityId=${communityId}`;
  const paymentDate = format(new Date(), 'MMM d, yyyy');
  const dueDate = lineItem.dueDate
    ? format(new Date(`${lineItem.dueDate}T00:00:00.000Z`), 'MMM d, yyyy')
    : 'N/A';

  await sendEmail({
    to: payer.email,
    subject: `Payment of $${centsToDollars(amountCents)} received — ${communityName}`,
    category: 'transactional',
    react: createElement(AssessmentPaymentReceivedEmail, {
      branding: { communityName },
      recipientName: payer.fullName ?? payer.email,
      amountPaid: `$${centsToDollars(amountCents)}`,
      assessmentTitle,
      dueDate,
      paymentDate,
      remainingBalance: `$${centsToDollars(Math.abs(balanceCents))}`,
      portalUrl,
      paymentMethod: receipt.paymentMethod,
      confirmationNumber: receipt.confirmationNumber,
    }),
  });
}

export interface PaymentReceiptDetails {
  paymentMethod?: string;
  confirmationNumber?: string;
}

const CARD_BRAND_LABELS: Record<string, string> = {
  amex: 'American Express',
  diners: 'Diners Club',
  discover: 'Discover',
  eftpos_au: 'eftpos',
  jcb: 'JCB',
  mastercard: 'Mastercard',
  unionpay: 'UnionPay',
  visa: 'Visa',
};

/**
 * What the payment receipt email can truthfully say about how and under what
 * reference a payment was made — built only from the Stripe objects the
 * webhook already holds.
 *
 * - Method: card brand + last four from the charge, else the bank account's
 *   last four, else just the method type recorded in the intent's metadata.
 * - Reference: Stripe's receipt number when one has been issued, else the
 *   PaymentIntent id — the same id the ledger entry records as `sourceId`, so
 *   a manager can find the payment from what the owner quotes.
 */
export function describePaymentForReceipt(
  charge: Pick<Stripe.Charge, 'payment_method_details' | 'receipt_number'> | null,
  paymentIntentId: string,
  metadataMethod: 'card' | 'us_bank_account' | null,
): PaymentReceiptDetails {
  const details = charge?.payment_method_details ?? null;
  let paymentMethod: string | undefined;
  if (details?.card?.last4) {
    const brand = details.card.brand ? CARD_BRAND_LABELS[details.card.brand] ?? 'Card' : 'Card';
    paymentMethod = `${brand} ending in ${details.card.last4}`;
  } else if (details?.us_bank_account?.last4) {
    paymentMethod = `Bank account ending in ${details.us_bank_account.last4}`;
  } else if (metadataMethod === 'card') {
    paymentMethod = 'Card';
  } else if (metadataMethod === 'us_bank_account') {
    paymentMethod = 'Bank account';
  }

  const receiptNumber = charge?.receipt_number?.trim();
  return { paymentMethod, confirmationNumber: receiptNumber || paymentIntentId };
}

/**
 * Request options for re-reading a webhook's own objects from Stripe.
 *
 * ⚠️ Load-bearing under direct charges (F-15). A Connect event carries
 * `event.account`, and the objects it describes live on THAT account — a bare
 * `retrieve` against the platform account raises `No such payment_intent`. The
 * failure mode is the bad kind: Stripe reports the payment as succeeded, the
 * resident sees a receipt, and the ledger never records it, because the webhook
 * threw on a lookup rather than on the payment.
 *
 * Returns `undefined` for a platform-account event so the same call sites keep
 * working for anything not routed through a connected account.
 */
function connectRequestOptions(event: Stripe.Event): { stripeAccount: string } | undefined {
  return event.account ? { stripeAccount: event.account } : undefined;
}

async function handlePaymentIntentSucceeded(event: Stripe.Event): Promise<void> {
  const stripe = getStripeClient();
  const requestOptions = connectRequestOptions(event);
  const stripePaymentIntent = event.data.object as Stripe.PaymentIntent;
  const freshIntent = await stripe.paymentIntents.retrieve(
    stripePaymentIntent.id,
    undefined,
    requestOptions,
  );
  const metadata = freshIntent.metadata ?? {};
  const communityId = parseMetadataInt(metadata, 'communityId');
  const payableType = parsePayableType(metadata);
  const payableId = payableType ? parsePayableId(metadata, payableType) : null;
  const unitId = parseMetadataInt(metadata, 'unitId');
  const payerUserId = parseMetadataString(metadata, 'userId');

  if (!communityId || !payableType || !payableId || !unitId || !payerUserId) {
    logFinanceWebhookEvent('warn', 'Skipping payment_intent.succeeded due to missing metadata', {
      eventId: event.id,
      eventType: event.type,
      communityId: communityId ?? null,
      payableType,
      payableId,
      errorCode: FINANCE_WEBHOOK_ERROR_CODES.MISSING_REQUIRED_METADATA,
      category: 'validation',
      metricName: 'finance_webhook_event',
      outcome: 'skipped',
      payloadSnippet: {
        paymentIntentId: stripePaymentIntent.id,
        hasCommunityId: Boolean(communityId),
        hasPayableType: Boolean(payableType),
        hasPayableId: Boolean(payableId),
        hasUnitId: Boolean(unitId),
        hasUserId: Boolean(payerUserId),
      },
    });
    return;
  }

  await recordFinanceStripeEvent(communityId, event);

  // Out-of-order defense: if the latest charge is already fully refunded, a delayed
  // payment_intent.succeeded event must not flip the line item back to paid.
  const latestChargeId = typeof freshIntent.latest_charge === 'string'
    ? freshIntent.latest_charge
    : freshIntent.latest_charge?.id ?? null;

  let stripeFeeActualCents: number | undefined;
  let latestCharge: Stripe.Charge | null = null;
  if (latestChargeId) {
    latestCharge = await stripe.charges.retrieve(
      latestChargeId,
      { expand: ['balance_transaction'] },
      requestOptions,
    );
    if (latestCharge.amount_refunded >= latestCharge.amount) {
      return;
    }
    // Record actual Stripe processing fee for admin reporting
    const balanceTxn = latestCharge.balance_transaction;
    if (typeof balanceTxn === 'object' && balanceTxn !== null && 'fee' in balanceTxn) {
      stripeFeeActualCents = (balanceTxn as Stripe.BalanceTransaction).fee;
    }
  }

  const payable = await getPayableById(communityId, payableType, payableId);
  if (!payable) {
    logFinanceWebhookEvent('warn', 'Skipping payment_intent.succeeded; payable not found', {
      eventId: event.id,
      eventType: event.type,
      communityId,
      payableType,
      payableId,
      errorCode: FINANCE_WEBHOOK_ERROR_CODES.PAYABLE_NOT_FOUND,
      category: 'reconciliation',
      metricName: 'finance_webhook_event',
      outcome: 'skipped',
      payloadSnippet: { paymentIntentId: freshIntent.id, unitId },
    });
    return;
  }

  const scoped = createScopedClient(communityId);
  if (payable.payableType === 'assessment_line_item') {
    await scoped.update(
      assessmentLineItems,
      {
        status: 'paid',
        paidAt: new Date(),
        paymentIntentId: freshIntent.id,
      },
      eq(assessmentLineItems.id, payable.payableId),
    );
  } else {
    await scoped.update(
      rentObligations,
      { status: 'paid' },
      eq(rentObligations.id, payable.payableId),
    );
  }

  const convenienceFeeCents = parseMetadataInt(metadata, 'convenienceFeeCents') ?? 0;
  const paymentMethod = parseMetadataString(metadata, 'paymentMethod') as 'card' | 'us_bank_account' | null;
  const paymentAmount = freshIntent.amount_received > 0 ? freshIntent.amount_received : freshIntent.amount;

  await postLedgerEntry(scoped, {
    entryType: 'payment',
    amountCents: -Math.abs(paymentAmount),
    description: `Payment received for payable #${payable.payableId}`,
    sourceType: 'payment',
    sourceId: freshIntent.id,
    unitId,
    userId: payerUserId,
    metadata: {
      payableType,
      payableId,
      payableSourceType: payable.payableSourceType,
      payableSourceId: payable.payableSourceId,
      lineItemId: payable.payableId,
      assessmentLineItemId: payable.payableId,
      assessmentId: payable.assessmentId ?? undefined,
      stripePaymentIntentId: freshIntent.id,
      stripeFeeActualCents,
      paymentMethod: paymentMethod ?? undefined,
    },
    createdByUserId: payerUserId,
  });

  if (payable.payableType === 'rent_obligation' && payable.leaseId) {
    await scoped.insert(rentPayments, {
      leaseId: payable.leaseId,
      obligationId: payable.payableId,
      unitId,
      residentId: payerUserId,
      amountCents: paymentAmount,
      paymentMethod: paymentMethod ?? null,
      externalReference: freshIntent.id,
      notes: 'Recorded via Stripe webhook',
    });
  }

  // Post a separate convenience fee ledger entry when the owner paid a fee
  if (convenienceFeeCents > 0) {
    await postLedgerEntry(scoped, {
      entryType: 'fee',
      amountCents: convenienceFeeCents,
      description: 'Convenience fee for online payment',
      sourceType: 'payment',
      sourceId: freshIntent.id,
      unitId,
      userId: payerUserId,
      metadata: {
        payableType,
        payableId,
        payableSourceType: payable.payableSourceType,
        payableSourceId: payable.payableSourceId,
        lineItemId: payable.payableId,
        assessmentLineItemId: payable.payableId,
        stripePaymentIntentId: freshIntent.id,
        convenienceFeeCents,
        paymentMethod: paymentMethod ?? undefined,
      },
      createdByUserId: payerUserId,
    });
  }

  await markMatchingViolationFinePaid(communityId, unitId, paymentAmount, payerUserId);

  // Fire-and-forget payment confirmation email — never block webhook processing
  sendPaymentConfirmationEmail(
    communityId,
    payerUserId,
    paymentAmount,
    {
      assessmentId: payable.assessmentId,
      unitId: payable.unitId,
      dueDate: payable.dueDate,
    },
    describePaymentForReceipt(latestCharge, freshIntent.id, paymentMethod),
  ).catch(() => {
    // Swallowed intentionally — email failure must not block webhook
  });
}

async function handleChargeRefunded(event: Stripe.Event): Promise<void> {
  const stripe = getStripeClient();
  const requestOptions = connectRequestOptions(event);
  const charge = event.data.object as Stripe.Charge;
  const freshCharge = await stripe.charges.retrieve(
    charge.id,
    { expand: ['payment_intent'] },
    requestOptions,
  );
  const paymentIntent = typeof freshCharge.payment_intent === 'string'
    ? await stripe.paymentIntents.retrieve(freshCharge.payment_intent, undefined, requestOptions)
    : freshCharge.payment_intent;

  const metadata = paymentIntent?.metadata ?? {};
  const communityId = parseMetadataInt(metadata, 'communityId');
  const payableType = parsePayableType(metadata);
  const payableId = payableType ? parsePayableId(metadata, payableType) : null;
  const unitId = parseMetadataInt(metadata, 'unitId');
  const payerUserId = parseMetadataString(metadata, 'userId');
  if (!communityId || !payableType || !payableId || !unitId || !payerUserId) {
    logFinanceWebhookEvent('warn', 'Skipping charge.refunded due to missing metadata', {
      eventId: event.id,
      eventType: event.type,
      communityId: communityId ?? null,
      payableType,
      payableId,
      errorCode: FINANCE_WEBHOOK_ERROR_CODES.MISSING_REQUIRED_METADATA,
      category: 'validation',
      metricName: 'finance_webhook_event',
      outcome: 'skipped',
      payloadSnippet: {
        chargeId: charge.id,
        hasCommunityId: Boolean(communityId),
        hasPayableType: Boolean(payableType),
        hasPayableId: Boolean(payableId),
        hasUnitId: Boolean(unitId),
        hasUserId: Boolean(payerUserId),
      },
    });
    return;
  }

  await recordFinanceStripeEvent(communityId, event);

  const payable = await getPayableById(communityId, payableType, payableId);
  if (!payable) {
    logFinanceWebhookEvent('warn', 'Skipping charge.refunded; payable not found', {
      eventId: event.id,
      eventType: event.type,
      communityId,
      payableType,
      payableId,
      errorCode: FINANCE_WEBHOOK_ERROR_CODES.PAYABLE_NOT_FOUND,
      category: 'reconciliation',
      metricName: 'finance_webhook_event',
      outcome: 'skipped',
      payloadSnippet: { chargeId: charge.id, unitId },
    });
    return;
  }
  const scoped = createScopedClient(communityId);

  // Use the event snapshot for deterministic behavior — not the fresh retrieve,
  // which may include refunds from concurrent events.
  const isFullRefund = charge.amount_refunded >= charge.amount;

  // Compute the INCREMENTAL refund amount for this event, not the cumulative total.
  // Stripe's charge.amount_refunded is cumulative — using it directly overcredits on
  // the second+ partial refund. previous_attributes.amount_refunded gives us the
  // prior cumulative so we can compute the delta.
  const prevAttrs = (event.data as unknown as Record<string, unknown>).previous_attributes as
    | Record<string, unknown>
    | undefined;
  const hasPreviousRefunded = typeof prevAttrs?.amount_refunded === 'number';
  const previousRefunded = hasPreviousRefunded ? (prevAttrs!.amount_refunded as number) : 0;
  const incrementalRefundCents = charge.amount_refunded - previousRefunded;

  if (!hasPreviousRefunded && charge.amount_refunded > 0) {
    // previous_attributes should always be present on charge.refunded events.
    // If missing, we fall back to cumulative which is correct for first refund
    // but would overcredit on subsequent refunds. Log so we can investigate.
    logFinanceWebhookEvent('warn', 'Refund previous_attributes.amount_refunded missing', {
      eventId: event.id,
      eventType: event.type,
      communityId,
      payableType,
      payableId,
      errorCode: FINANCE_WEBHOOK_ERROR_CODES.REFUND_PREVIOUS_ATTRIBUTES_MISSING,
      category: 'reconciliation',
      metricName: 'finance_webhook_refund_delta',
      outcome: 'failure',
      payloadSnippet: {
        chargeId: charge.id,
        cumulativeAmountRefunded: charge.amount_refunded,
      },
    });
  }

  if (incrementalRefundCents <= 0) {
    // Defensive: if delta is zero or negative (shouldn't happen), log and skip
    // rather than post a nonsensical amount or modify line item state with bad data.
    logFinanceWebhookEvent('error', 'Skipping charge.refunded due to invalid incremental refund amount', {
      eventId: event.id,
      eventType: event.type,
      communityId,
      payableType,
      payableId,
      errorCode: FINANCE_WEBHOOK_ERROR_CODES.REFUND_INVALID_INCREMENTAL_AMOUNT,
      category: 'reconciliation',
      metricName: 'finance_webhook_refund_delta',
      outcome: 'failure',
      payloadSnippet: {
        chargeId: charge.id,
        incrementalRefundCents,
        cumulativeAmountRefunded: charge.amount_refunded,
        previousRefunded,
      },
    });
    return;
  }

  // Only reset payable status AFTER validating the refund amount — avoid modifying
  // state if the event data is corrupt.
  if (isFullRefund) {
    if (payable.payableType === 'assessment_line_item') {
      await scoped.update(
        assessmentLineItems,
        {
          status: 'pending',
          paidAt: null,
        },
        eq(assessmentLineItems.id, payable.payableId),
      );
    } else {
      await scoped.update(
        rentObligations,
        { status: 'pending' },
        eq(rentObligations.id, payable.payableId),
      );
    }
  }

  const convenienceFeeCents = parseMetadataInt(metadata, 'convenienceFeeCents') ?? 0;

  await postLedgerEntry(scoped, {
    entryType: 'refund',
    amountCents: Math.abs(incrementalRefundCents),
    description: `Refund posted for payable #${payable.payableId}.`,
    sourceType: 'payment',
    sourceId: charge.id,
    unitId,
    userId: payerUserId,
    metadata: {
      payableType,
      payableId,
      payableSourceType: payable.payableSourceType,
      payableSourceId: payable.payableSourceId,
      lineItemId: payable.payableId,
      assessmentLineItemId: payable.payableId,
      assessmentId: payable.assessmentId ?? undefined,
      stripeChargeId: charge.id,
    },
    createdByUserId: payerUserId,
  });

  if (payable.payableType === 'rent_obligation' && payable.leaseId) {
    await scoped.insert(rentPayments, {
      leaseId: payable.leaseId,
      obligationId: payable.payableId,
      unitId,
      residentId: payerUserId,
      amountCents: -Math.abs(incrementalRefundCents),
      paymentMethod: paymentIntent?.payment_method_types?.[0] ?? null,
      externalReference: charge.id,
      notes: `Refund reversal recorded via Stripe webhook (${event.id})`,
    });
  }

  // Reverse the convenience fee ledger entry on full refund so the owner's
  // balance doesn't show a phantom fee charge.
  if (isFullRefund && convenienceFeeCents > 0) {
    await postLedgerEntry(scoped, {
      entryType: 'adjustment',
      amountCents: -convenienceFeeCents,
      description: `Convenience fee reversal for refunded payment (payable #${payable.payableId})`,
      sourceType: 'payment',
      sourceId: charge.id,
      unitId,
      userId: payerUserId,
      metadata: {
        payableType,
        payableId,
        payableSourceType: payable.payableSourceType,
        payableSourceId: payable.payableSourceId,
        lineItemId: payable.payableId,
        assessmentLineItemId: payable.payableId,
        stripeChargeId: charge.id,
        convenienceFeeCents,
        reason: 'full_refund_fee_reversal',
      },
      createdByUserId: payerUserId,
    });
  }
}

async function handleChargeDisputeCreated(event: Stripe.Event): Promise<void> {
  const stripe = getStripeClient();
  const requestOptions = connectRequestOptions(event);
  const dispute = event.data.object as Stripe.Dispute;
  const freshDispute = await stripe.disputes.retrieve(dispute.id, undefined, requestOptions);
  const chargeId = typeof freshDispute.charge === 'string' ? freshDispute.charge : null;
  if (!chargeId) {
    logFinanceWebhookEvent('warn', 'Skipping charge.dispute.created because dispute charge is missing', {
      eventId: event.id,
      eventType: event.type,
      errorCode: FINANCE_WEBHOOK_ERROR_CODES.DISPUTE_CHARGE_ID_MISSING,
      category: 'validation',
      metricName: 'finance_webhook_event',
      outcome: 'skipped',
      payloadSnippet: { disputeId: dispute.id },
    });
    return;
  }

  const freshCharge = await stripe.charges.retrieve(
    chargeId,
    { expand: ['payment_intent'] },
    requestOptions,
  );
  const paymentIntent = typeof freshCharge.payment_intent === 'string'
    ? await stripe.paymentIntents.retrieve(freshCharge.payment_intent, undefined, requestOptions)
    : freshCharge.payment_intent;

  const metadata = paymentIntent?.metadata ?? {};
  const communityId = parseMetadataInt(metadata, 'communityId');
  const payableType = parsePayableType(metadata);
  const payableId = payableType ? parsePayableId(metadata, payableType) : null;
  const unitId = parseMetadataInt(metadata, 'unitId');
  const payerUserId = parseMetadataString(metadata, 'userId');
  if (!communityId || !unitId || !payerUserId) {
    logFinanceWebhookEvent('warn', 'Skipping charge.dispute.created due to missing metadata', {
      eventId: event.id,
      eventType: event.type,
      communityId: communityId ?? null,
      payableType,
      payableId,
      errorCode: FINANCE_WEBHOOK_ERROR_CODES.MISSING_REQUIRED_METADATA,
      category: 'validation',
      metricName: 'finance_webhook_event',
      outcome: 'skipped',
      payloadSnippet: {
        disputeId: dispute.id,
        chargeId,
        hasCommunityId: Boolean(communityId),
        hasUnitId: Boolean(unitId),
        hasUserId: Boolean(payerUserId),
      },
    });
    return;
  }

  await recordFinanceStripeEvent(communityId, event);

  const scoped = createScopedClient(communityId);
  await postLedgerEntry(scoped, {
    entryType: 'fee',
    amountCents: Math.abs(freshDispute.amount),
    description: `Dispute opened (${freshDispute.reason})`,
    sourceType: 'payment',
    sourceId: freshDispute.id,
    unitId,
    userId: payerUserId,
    metadata: {
      payableType: payableType ?? undefined,
      payableId: payableId ?? undefined,
      lineItemId: payableType === 'assessment_line_item' ? payableId ?? undefined : undefined,
      stripeChargeId: chargeId,
      notes: `Dispute reason: ${freshDispute.reason}`,
    },
    createdByUserId: payerUserId,
  });
}

export async function processFinanceStripeEvent(event: Stripe.Event): Promise<void> {
  if (!STRIPE_FINANCE_EVENT_TYPES.has(event.type)) {
    return;
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event);
        break;
      case 'charge.refunded':
        await handleChargeRefunded(event);
        break;
      case 'charge.dispute.created':
        await handleChargeDisputeCreated(event);
        break;
      default:
        break;
    }
  } catch (err) {
    logFinanceWebhookEvent('error', 'Unhandled finance webhook processing error', {
      eventId: event.id,
      eventType: event.type,
      errorCode: FINANCE_WEBHOOK_ERROR_CODES.UNHANDLED_EVENT_PROCESSING_ERROR,
      category: 'processing',
      metricName: 'finance_webhook_event',
      outcome: 'failure',
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

export async function listLedgerForCommunity(
  communityId: number,
  params: {
    unitId?: number;
    startDate?: string;
    endDate?: string;
    entryType?: LedgerEntryType;
    limit?: number;
  },
) {
  const scoped = createScopedClient(communityId);
  return listLedgerEntries(scoped, params);
}

export async function getLedgerBalanceForUnit(
  communityId: number,
  unitId: number,
): Promise<number> {
  const scoped = createScopedClient(communityId);
  return getUnitLedgerBalance(scoped, unitId);
}

export async function listActorUnitIdsForFinance(
  communityId: number,
  actorUserId: string,
): Promise<number[]> {
  const scoped = createScopedClient(communityId);
  const unitIds = await listActorUnitIds(scoped, actorUserId);
  return [...unitIds].sort((a, b) => a - b);
}

export function resolveStatementDateRange(
  startDateRaw: string | null,
  endDateRaw: string | null,
): { startDate?: string; endDate?: string } {
  const now = new Date();
  const defaultStart = format(addDays(now, -90), 'yyyy-MM-dd');
  const defaultEnd = format(now, 'yyyy-MM-dd');

  const startDate = startDateRaw ? parseDateOnly(startDateRaw, 'startDate') : defaultStart;
  const endDate = endDateRaw ? parseDateOnly(endDateRaw, 'endDate') : defaultEnd;

  if (startDate > endDate) {
    throw new BadRequestError('startDate must be less than or equal to endDate');
  }

  return { startDate, endDate };
}
