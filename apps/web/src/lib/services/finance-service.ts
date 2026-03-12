import { addDays, differenceInCalendarDays, endOfMonth, format, startOfMonth } from 'date-fns';
import {
  assessmentLineItems,
  assessments,
  createScopedClient,
  financeStripeWebhookEvents,
  getUnitLedgerBalance,
  listLedgerEntries,
  logAuditEvent,
  postLedgerEntry,
  stripeConnectedAccounts,
  units,
  userRoles,
} from '@propertypro/db';
import { and, asc, desc, eq, gte, inArray, lte } from '@propertypro/db/filters';
import type { LedgerEntryType } from '@propertypro/shared';
import type Stripe from 'stripe';
import { generateCSV } from '@/lib/services/csv-export';
import { getStripeClient } from '@/lib/services/stripe-service';
import { markMatchingViolationFinePaid } from '@/lib/services/violations-service';
import { BadRequestError, ForbiddenError, NotFoundError, UnprocessableEntityError } from '@/lib/api/errors';
import { parseDateOnly } from '@/lib/finance/common';
import { generateFinanceStatementPdf } from '@/lib/utils/finance-pdf';

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
  lineItemId: number;
  actorUserId: string;
  allowedUnitId?: number;
  requestId?: string | null;
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

function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === '23505';
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

function toLineItemDescription(assessment: AssessmentRecord, dueDate: string): string {
  return `${assessment.title} (${dueDate})`;
}

export async function listAssessmentsForCommunity(
  communityId: number,
): Promise<AssessmentRecord[]> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped
    .selectFrom<AssessmentRecord>(assessments, {})
    .orderBy(desc(assessments.isActive), desc(assessments.createdAt));

  return rows.map((row) => ({
    ...row,
    frequency: assertFrequency(row.frequency),
  }));
}

export async function createAssessmentForCommunity(
  communityId: number,
  actorUserId: string,
  input: CreateAssessmentInput,
  requestId?: string | null,
): Promise<AssessmentRecord> {
  const scoped = createScopedClient(communityId);
  const [inserted] = await scoped.insert(assessments, {
    title: input.title.trim(),
    description: input.description ?? null,
    amountCents: input.amountCents,
    frequency: input.frequency,
    dueDay: input.dueDay ?? null,
    lateFeeAmountCents: input.lateFeeAmountCents ?? 0,
    lateFeeDaysGrace: input.lateFeeDaysGrace ?? 0,
    startDate: input.startDate ?? format(new Date(), 'yyyy-MM-dd'),
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
  actorUserId: string,
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
  const unitRows = await scoped.selectFrom<{ id: number }>(units, { id: units.id });
  if (unitRows.length === 0) {
    throw new UnprocessableEntityError('Cannot generate line items: no units found for this community');
  }

  const existingRows = await scoped.selectFrom<AssessmentLineItemRecord>(
    assessmentLineItems,
    {},
    and(
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

export async function createPaymentIntentForLineItem(
  communityId: number,
  input: CreatePaymentIntentInput,
): Promise<{ paymentIntentId: string; clientSecret: string; amountCents: number; currency: string }> {
  const scoped = createScopedClient(communityId);
  const [lineItem] = await scoped.selectFrom<AssessmentLineItemRecord>(
    assessmentLineItems,
    {},
    eq(assessmentLineItems.id, input.lineItemId),
  );

  if (!lineItem) {
    throw new NotFoundError('Assessment line item not found');
  }
  if (input.allowedUnitId !== undefined && lineItem.unitId !== input.allowedUnitId) {
    throw new ForbiddenError('You can only pay line items for your own unit');
  }
  if (lineItem.status === 'paid') {
    throw new UnprocessableEntityError('This line item is already paid');
  }

  const connectAccount = await requireConnectAccount(communityId);
  if (!connectAccount.onboardingComplete || !connectAccount.chargesEnabled) {
    throw new UnprocessableEntityError('Stripe Connect onboarding is incomplete for this community');
  }

  const stripe = getStripeClient();
  const amountCents = lineItem.amountCents + lineItem.lateFeeCents;
  if (amountCents <= 0) {
    throw new BadRequestError('Line item amount must be greater than zero');
  }

  const intent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: 'usd',
    automatic_payment_methods: { enabled: true },
    metadata: {
      communityId: String(communityId),
      lineItemId: String(lineItem.id),
      unitId: String(lineItem.unitId),
      userId: input.actorUserId,
    },
    transfer_data: {
      destination: connectAccount.stripeAccountId,
    },
  });

  if (!intent.client_secret) {
    throw new Error('Stripe did not return a client_secret for PaymentIntent');
  }

  await scoped.update(
    assessmentLineItems,
    { paymentIntentId: intent.id },
    eq(assessmentLineItems.id, lineItem.id),
  );

  await logAuditEvent({
    userId: input.actorUserId,
    action: 'update',
    resourceType: 'assessment_line_item',
    resourceId: String(lineItem.id),
    communityId,
    oldValues: {
      paymentIntentId: lineItem.paymentIntentId,
    },
    newValues: {
      paymentIntentId: intent.id,
      amountCents,
    },
    metadata: { requestId: input.requestId ?? null },
  });

  return {
    paymentIntentId: intent.id,
    clientSecret: intent.client_secret,
    amountCents,
    currency: intent.currency,
  };
}

export async function listPaymentHistoryForCommunity(
  communityId: number,
  unitId?: number,
): Promise<AssessmentLineItemRecord[]> {
  const scoped = createScopedClient(communityId);
  const whereClause = unitId !== undefined
    ? and(eq(assessmentLineItems.unitId, unitId), eq(assessmentLineItems.status, 'paid'))
    : eq(assessmentLineItems.status, 'paid');

  const rows = await scoped
    .selectFrom<AssessmentLineItemRecord>(assessmentLineItems, {}, whereClause)
    .orderBy(desc(assessmentLineItems.paidAt), desc(assessmentLineItems.id));

  return rows.map((row) => ({
    ...row,
    status: assertLineItemStatus(row.status),
  }));
}

export async function buildUnitStatement(
  communityId: number,
  unitId: number,
  startDate?: string,
  endDate?: string,
): Promise<{
  unitId: number;
  balanceCents: number;
  ledgerEntries: Awaited<ReturnType<typeof listLedgerEntries>>;
  lineItems: AssessmentLineItemRecord[];
}> {
  const scoped = createScopedClient(communityId);
  const lineItemFilters = [eq(assessmentLineItems.unitId, unitId)];

  if (startDate !== undefined) {
    lineItemFilters.push(gte(assessmentLineItems.dueDate, startDate));
  }
  if (endDate !== undefined) {
    lineItemFilters.push(lte(assessmentLineItems.dueDate, endDate));
  }

  const lineItemsWhere = lineItemFilters.length === 1 ? lineItemFilters[0] : and(...lineItemFilters);
  const lineItems = await scoped
    .selectFrom<AssessmentLineItemRecord>(assessmentLineItems, {}, lineItemsWhere)
    .orderBy(asc(assessmentLineItems.dueDate), asc(assessmentLineItems.id));

  const ledgerEntriesForUnit = await listLedgerEntries(scoped, {
    unitId,
    startDate,
    endDate,
    limit: 500,
  });
  const balanceCents = await getUnitLedgerBalance(scoped, unitId);

  return {
    unitId,
    balanceCents,
    ledgerEntries: ledgerEntriesForUnit,
    lineItems: lineItems.map((row) => ({ ...row, status: assertLineItemStatus(row.status) })),
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
  const overdueItems = await scoped.selectFrom<AssessmentLineItemRecord>(
    assessmentLineItems,
    {},
    and(
      inArray(assessmentLineItems.status, ['pending', 'overdue']),
      lte(assessmentLineItems.dueDate, today),
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
  const statement = await buildUnitStatement(communityId, unitId, startDate, endDate);
  return generateFinanceStatementPdf(statement);
}

function getStripeBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

export async function startConnectOnboarding(
  communityId: number,
  actorUserId: string,
  requestId?: string | null,
): Promise<{ stripeAccountId: string; onboardingUrl: string }> {
  const scoped = createScopedClient(communityId);
  const stripe = getStripeClient();
  const existingRows = await scoped.selectFrom<StripeConnectedAccountRecord>(stripeConnectedAccounts, {});

  let stripeAccountId: string;
  if (existingRows[0]) {
    stripeAccountId = existingRows[0].stripeAccountId;
  } else {
    const account = await stripe.accounts.create({
      type: 'express',
      metadata: {
        communityId: String(communityId),
      },
    });
    stripeAccountId = account.id;
    await scoped.insert(stripeConnectedAccounts, {
      stripeAccountId,
      onboardingComplete: !!account.details_submitted,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
    });
  }

  const baseUrl = getStripeBaseUrl();
  const accountLink = await stripe.accountLinks.create({
    account: stripeAccountId,
    refresh_url: `${baseUrl}/dashboard/settings/finance?communityId=${communityId}&connect=refresh`,
    return_url: `${baseUrl}/dashboard/settings/finance?communityId=${communityId}&connect=return`,
    type: 'account_onboarding',
  });

  await logAuditEvent({
    userId: actorUserId,
    action: 'create',
    resourceType: 'stripe_connected_account',
    resourceId: stripeAccountId,
    communityId,
    metadata: { requestId: requestId ?? null },
  });

  return {
    stripeAccountId,
    onboardingUrl: accountLink.url,
  };
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

async function recordFinanceStripeEvent(
  communityId: number,
  event: Stripe.Event,
): Promise<boolean> {
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
    return true;
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return false;
    }
    throw err;
  }
}

async function handlePaymentIntentSucceeded(event: Stripe.Event): Promise<void> {
  const stripe = getStripeClient();
  const stripePaymentIntent = event.data.object as Stripe.PaymentIntent;
  const freshIntent = await stripe.paymentIntents.retrieve(stripePaymentIntent.id);
  const metadata = freshIntent.metadata ?? {};
  const communityId = parseMetadataInt(metadata, 'communityId');
  const lineItemId = parseMetadataInt(metadata, 'lineItemId');
  const unitId = parseMetadataInt(metadata, 'unitId');
  const payerUserId = parseMetadataString(metadata, 'userId');

  if (!communityId || !lineItemId || !unitId || !payerUserId) {
    return;
  }

  const shouldProcess = await recordFinanceStripeEvent(communityId, event);
  if (!shouldProcess) {
    return;
  }

  // Out-of-order defense: if the latest charge is already fully refunded, a delayed
  // payment_intent.succeeded event must not flip the line item back to paid.
  const latestChargeId = typeof freshIntent.latest_charge === 'string'
    ? freshIntent.latest_charge
    : freshIntent.latest_charge?.id ?? null;
  if (latestChargeId) {
    const latestCharge = await stripe.charges.retrieve(latestChargeId);
    if (latestCharge.amount_refunded >= latestCharge.amount) {
      return;
    }
  }

  const scoped = createScopedClient(communityId);
  const lineItemRows = await scoped.selectFrom<AssessmentLineItemRecord>(
    assessmentLineItems,
    {},
    eq(assessmentLineItems.id, lineItemId),
  );
  const lineItem = lineItemRows[0];
  if (!lineItem) {
    return;
  }

  await scoped.update(
    assessmentLineItems,
    {
      status: 'paid',
      paidAt: new Date(),
      paymentIntentId: freshIntent.id,
    },
    eq(assessmentLineItems.id, lineItemId),
  );

  const paymentAmount = freshIntent.amount_received > 0 ? freshIntent.amount_received : freshIntent.amount;
  await postLedgerEntry(scoped, {
    entryType: 'payment',
    amountCents: -Math.abs(paymentAmount),
    description: `Payment received for line item #${lineItemId}`,
    sourceType: 'payment',
    sourceId: freshIntent.id,
    unitId,
    userId: payerUserId,
    metadata: {
      lineItemId,
      assessmentId: lineItem.assessmentId ?? undefined,
      stripePaymentIntentId: freshIntent.id,
    },
    createdByUserId: payerUserId,
  });

  await markMatchingViolationFinePaid(communityId, unitId, paymentAmount, payerUserId);
}

async function handleChargeRefunded(event: Stripe.Event): Promise<void> {
  const stripe = getStripeClient();
  const charge = event.data.object as Stripe.Charge;
  const freshCharge = await stripe.charges.retrieve(charge.id, { expand: ['payment_intent'] });
  const paymentIntent = typeof freshCharge.payment_intent === 'string'
    ? await stripe.paymentIntents.retrieve(freshCharge.payment_intent)
    : freshCharge.payment_intent;

  const metadata = paymentIntent?.metadata ?? {};
  const communityId = parseMetadataInt(metadata, 'communityId');
  const lineItemId = parseMetadataInt(metadata, 'lineItemId');
  const unitId = parseMetadataInt(metadata, 'unitId');
  const payerUserId = parseMetadataString(metadata, 'userId');
  if (!communityId || !lineItemId || !unitId || !payerUserId) {
    return;
  }

  const shouldProcess = await recordFinanceStripeEvent(communityId, event);
  if (!shouldProcess) {
    return;
  }

  const scoped = createScopedClient(communityId);
  const lineItemRows = await scoped.selectFrom<AssessmentLineItemRecord>(
    assessmentLineItems,
    {},
    eq(assessmentLineItems.id, lineItemId),
  );
  const lineItem = lineItemRows[0];
  if (!lineItem) {
    return;
  }

  if (freshCharge.amount_refunded >= freshCharge.amount) {
    await scoped.update(
      assessmentLineItems,
      {
        status: 'pending',
        paidAt: null,
      },
      eq(assessmentLineItems.id, lineItem.id),
    );
  }

  await postLedgerEntry(scoped, {
    entryType: 'refund',
    amountCents: Math.abs(freshCharge.amount_refunded),
    description: `Refund posted for line item #${lineItemId}`,
    sourceType: 'payment',
    sourceId: charge.id,
    unitId,
    userId: payerUserId,
    metadata: {
      lineItemId,
      assessmentId: lineItem.assessmentId ?? undefined,
      stripeChargeId: charge.id,
    },
    createdByUserId: payerUserId,
  });
}

async function handleChargeDisputeCreated(event: Stripe.Event): Promise<void> {
  const stripe = getStripeClient();
  const dispute = event.data.object as Stripe.Dispute;
  const freshDispute = await stripe.disputes.retrieve(dispute.id);
  const chargeId = typeof freshDispute.charge === 'string' ? freshDispute.charge : null;
  if (!chargeId) {
    return;
  }

  const freshCharge = await stripe.charges.retrieve(chargeId, { expand: ['payment_intent'] });
  const paymentIntent = typeof freshCharge.payment_intent === 'string'
    ? await stripe.paymentIntents.retrieve(freshCharge.payment_intent)
    : freshCharge.payment_intent;

  const metadata = paymentIntent?.metadata ?? {};
  const communityId = parseMetadataInt(metadata, 'communityId');
  const unitId = parseMetadataInt(metadata, 'unitId');
  const payerUserId = parseMetadataString(metadata, 'userId');
  if (!communityId || !unitId || !payerUserId) {
    return;
  }

  const shouldProcess = await recordFinanceStripeEvent(communityId, event);
  if (!shouldProcess) {
    return;
  }

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

export async function findActorUnitId(
  communityId: number,
  actorUserId: string,
): Promise<number | null> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom<{ unitId: number | null }>(
    userRoles,
    { unitId: userRoles.unitId },
    eq(userRoles.userId, actorUserId),
  );
  for (const row of rows) {
    if (typeof row.unitId === 'number' && Number.isFinite(row.unitId)) {
      return row.unitId;
    }
  }
  return null;
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
