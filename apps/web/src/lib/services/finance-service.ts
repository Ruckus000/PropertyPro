import { createElement } from 'react';
import { addDays, differenceInCalendarDays, endOfMonth, format, startOfMonth } from 'date-fns';
import {
  assessmentLineItems,
  assessments,
  communities,
  createScopedClient,
  financeStripeWebhookEvents,
  getUnitLedgerBalance,
  listLedgerEntries,
  logAuditEvent,
  postLedgerEntry,
  stripeConnectedAccounts,
  units,
  users,
  userRoles,
} from '@propertypro/db';
import { and, asc, desc, eq, gte, inArray, lte } from '@propertypro/db/filters';
import type { LedgerEntryType } from '@propertypro/shared';
import {
  type PaymentFeePolicy,
  DEFAULT_FEE_POLICY,
  calculateConvenienceFee,
  calculateStripeFeeEstimate,
} from '@propertypro/shared';
import type Stripe from 'stripe';
import { AssessmentPaymentReceivedEmail, sendEmail } from '@propertypro/email';
import { generateCSV } from '@/lib/services/csv-export';
import { getStripeClient } from '@/lib/services/stripe-service';
import { markMatchingViolationFinePaid } from '@/lib/services/violations-service';
import { BadRequestError, ForbiddenError, NotFoundError, UnprocessableEntityError } from '@/lib/api/errors';
import { signPayload, verifySignature } from '@/lib/services/calendar-sync-service';
import { centsToDollars, parseDateOnly } from '@/lib/finance/common';
import { listActorUnitIds } from '@/lib/units/actor-units';
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

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
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

export async function getCommunityFeePolicy(communityId: number): Promise<PaymentFeePolicy> {
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

/**
 * Pre-flight guard: verify that the given actor is the user who created the PI.
 * Used by the update-intent route to prevent cross-owner PI manipulation.
 */
export async function requireActorOwnsPi(
  paymentIntentId: string,
  actorUserId: string,
): Promise<void> {
  const stripe = getStripeClient();
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
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
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);

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

    await stripe.paymentIntents.update(paymentIntentId, {
      amount: totalChargeCents,
      application_fee_amount: convenienceFeeCents,
      metadata: {
        ...intent.metadata,
        convenienceFeeCents: String(convenienceFeeCents),
        paymentMethod,
      },
    });

    return { convenienceFeeCents, totalChargeCents };
  }

  // association_absorbs: owner pays base amount, association transfer is reduced
  const stripeFeeEstimate = calculateStripeFeeEstimate(baseAmountCents, paymentMethod);

  await stripe.paymentIntents.update(paymentIntentId, {
    amount: baseAmountCents,
    application_fee_amount: stripeFeeEstimate,
    metadata: {
      ...intent.metadata,
      convenienceFeeCents: '0',
      paymentMethod,
    },
  });

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
}

export async function createPaymentIntentForLineItem(
  communityId: number,
  input: CreatePaymentIntentInput,
): Promise<CreatePaymentIntentResult> {
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

  const feePolicy = await getCommunityFeePolicy(communityId);

  const intent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: 'usd',
    payment_method_types: ['card', 'us_bank_account'],
    metadata: {
      communityId: String(communityId),
      lineItemId: String(lineItem.id),
      unitId: String(lineItem.unitId),
      userId: input.actorUserId,
      baseAmountCents: String(amountCents),
      convenienceFeeCents: '0',
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
    convenienceFeeCents: 0,
    totalChargeCents: amountCents,
    currency: intent.currency,
    feePolicy,
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
    throw new Error('STRIPE_CONNECT_CLIENT_ID is not configured');
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

/**
 * Fire-and-forget payment confirmation email to the payer.
 * Failures are logged but never block webhook processing.
 */
async function sendPaymentConfirmationEmail(
  communityId: number,
  payerUserId: string,
  amountCents: number,
  lineItem: AssessmentLineItemRecord,
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
    ? format(new Date(lineItem.dueDate), 'MMM d, yyyy')
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
    }),
  });
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

  let stripeFeeActualCents: number | undefined;
  if (latestChargeId) {
    const latestCharge = await stripe.charges.retrieve(latestChargeId, {
      expand: ['balance_transaction'],
    });
    if (latestCharge.amount_refunded >= latestCharge.amount) {
      return;
    }
    // Record actual Stripe processing fee for admin reporting
    const balanceTxn = latestCharge.balance_transaction;
    if (typeof balanceTxn === 'object' && balanceTxn !== null && 'fee' in balanceTxn) {
      stripeFeeActualCents = (balanceTxn as Stripe.BalanceTransaction).fee;
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

  const convenienceFeeCents = parseMetadataInt(metadata, 'convenienceFeeCents') ?? 0;
  const paymentMethod = parseMetadataString(metadata, 'paymentMethod') as 'card' | 'us_bank_account' | null;
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
      stripeFeeActualCents,
      paymentMethod: paymentMethod ?? undefined,
    },
    createdByUserId: payerUserId,
  });

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
        lineItemId,
        stripePaymentIntentId: freshIntent.id,
        convenienceFeeCents,
        paymentMethod: paymentMethod ?? undefined,
      },
      createdByUserId: payerUserId,
    });
  }

  await markMatchingViolationFinePaid(communityId, unitId, paymentAmount, payerUserId);

  // Fire-and-forget payment confirmation email — never block webhook processing
  sendPaymentConfirmationEmail(communityId, payerUserId, paymentAmount, lineItem).catch(() => {
    // Swallowed intentionally — email failure must not block webhook
  });
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
    console.warn(
      `[finance] charge.refunded event ${event.id} missing previous_attributes.amount_refunded — ` +
      `using cumulative ${charge.amount_refunded} as incremental. Charge: ${charge.id}`,
    );
  }

  if (incrementalRefundCents <= 0) {
    // Defensive: if delta is zero or negative (shouldn't happen), log and skip
    // rather than post a nonsensical amount or modify line item state with bad data.
    console.error(
      `[finance] charge.refunded event ${event.id} computed non-positive incremental refund ` +
      `(${incrementalRefundCents}). cumulative=${charge.amount_refunded}, ` +
      `previous=${previousRefunded}. Charge: ${charge.id}. Skipping.`,
    );
    return;
  }

  // Only reset line item status AFTER validating the refund amount — avoid modifying
  // state if the event data is corrupt.
  if (isFullRefund) {
    await scoped.update(
      assessmentLineItems,
      {
        status: 'pending',
        paidAt: null,
      },
      eq(assessmentLineItems.id, lineItem.id),
    );
  }

  const convenienceFeeCents = parseMetadataInt(metadata, 'convenienceFeeCents') ?? 0;

  await postLedgerEntry(scoped, {
    entryType: 'refund',
    amountCents: Math.abs(incrementalRefundCents),
    description: `Refund posted for line item #${lineItemId}.`,
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

  // Reverse the convenience fee ledger entry on full refund so the owner's
  // balance doesn't show a phantom fee charge.
  if (isFullRefund && convenienceFeeCents > 0) {
    await postLedgerEntry(scoped, {
      entryType: 'adjustment',
      amountCents: -convenienceFeeCents,
      description: `Convenience fee reversal for refunded payment (line item #${lineItemId})`,
      sourceType: 'payment',
      sourceId: charge.id,
      unitId,
      userId: payerUserId,
      metadata: {
        lineItemId,
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
  const unitIds = await listActorUnitIds(scoped, actorUserId);
  return unitIds[0] ?? null;
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
