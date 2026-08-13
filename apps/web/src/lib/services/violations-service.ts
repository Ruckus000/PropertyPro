import { addDays, format } from 'date-fns';
import {
  arcSubmissions,
  assessmentLineItems,
  communities,
  createScopedClient,
  documents,
  ledgerEntries,
  logAuditEvent,
  paginate,
  postLedgerEntry,
  units,
  violationFines,
  violations,
} from '@propertypro/db';
import { and, desc, eq, gte, inArray, lte } from '@propertypro/db/filters';
import type { ArcSubmissionStatus, ViolationFineStatus, ViolationSeverity, ViolationStatus } from '@propertypro/db';
import { AppError, BadRequestError, ForbiddenError, NotFoundError, UnprocessableEntityError } from '@/lib/api/errors';
import { parseDateOnly } from '@/lib/finance/common';
import { createNotificationsForEvent, sendNotification } from '@/lib/services/notification-service';

export interface ViolationRecord {
  [key: string]: unknown;
  id: number;
  communityId: number;
  unitId: number;
  reportedByUserId: string | null;
  category: string;
  description: string;
  status: ViolationStatus;
  severity: ViolationSeverity;
  evidenceDocumentIds: number[];
  noticeDate: string | null;
  hearingDate: Date | null;
  resolutionDate: Date | null;
  resolutionNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ViolationFineRecord {
  [key: string]: unknown;
  id: number;
  communityId: number;
  violationId: number;
  amountCents: number;
  ledgerEntryId: number | null;
  status: ViolationFineStatus;
  issuedAt: Date;
  paidAt: Date | null;
  waivedAt: Date | null;
  waivedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ArcSubmissionRecord {
  [key: string]: unknown;
  id: number;
  communityId: number;
  unitId: number;
  submittedByUserId: string;
  title: string;
  description: string;
  projectType: string;
  estimatedStartDate: string | null;
  estimatedCompletionDate: string | null;
  attachmentDocumentIds: number[];
  status: ArcSubmissionStatus;
  reviewNotes: string | null;
  decidedByUserId: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateViolationInput {
  unitId: number;
  category: string;
  description: string;
  severity?: ViolationSeverity;
  evidenceDocumentIds?: number[];
}

export interface UpdateViolationInput {
  category?: string;
  description?: string;
  severity?: ViolationSeverity;
  status?: ViolationStatus;
  evidenceDocumentIds?: number[];
  noticeDate?: string | null;
  hearingDate?: string | null;
  resolutionNotes?: string | null;
}

export interface CreateViolationFineInput {
  amountCents: number;
  dueDate?: string;
  graceDays?: number;
  notes?: string | null;
}

export interface CreateArcSubmissionInput {
  unitId: number;
  title: string;
  description: string;
  projectType: string;
  estimatedStartDate?: string | null;
  estimatedCompletionDate?: string | null;
  attachmentDocumentIds?: number[];
}

export interface ReviewArcSubmissionInput {
  reviewNotes?: string | null;
}

export interface DecideArcSubmissionInput {
  decision: 'approved' | 'denied';
  reviewNotes?: string | null;
}

const VALID_VIOLATION_STATUSES: readonly ViolationStatus[] = [
  'reported',
  'noticed',
  'hearing_scheduled',
  'fined',
  'resolved',
  'dismissed',
];

const VALID_VIOLATION_SEVERITIES: readonly ViolationSeverity[] = ['minor', 'moderate', 'major'];

/**
 * Allowed status transitions for violations.
 * Terminal states (resolved, dismissed) have no outgoing transitions.
 */
const VALID_STATUS_TRANSITIONS: Record<ViolationStatus, readonly ViolationStatus[]> = {
  reported: ['noticed', 'dismissed'],
  noticed: ['hearing_scheduled', 'fined', 'resolved', 'dismissed'],
  hearing_scheduled: ['fined', 'resolved', 'dismissed'],
  fined: ['resolved'],
  resolved: [],
  dismissed: [],
};

function assertValidStatusTransition(from: ViolationStatus, to: ViolationStatus): void {
  const allowed = VALID_STATUS_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new UnprocessableEntityError(
      `Cannot transition violation from '${from}' to '${to}'. Allowed transitions: ${allowed.length > 0 ? allowed.join(', ') : 'none (terminal state)'}`,
    );
  }
}

const VALID_VIOLATION_FINE_STATUSES: readonly ViolationFineStatus[] = ['pending', 'paid', 'waived'];

const VALID_ARC_SUBMISSION_STATUSES: readonly ArcSubmissionStatus[] = [
  'submitted',
  'under_review',
  'approved',
  'denied',
  'withdrawn',
];

function assertViolationStatus(value: string): ViolationStatus {
  if (!VALID_VIOLATION_STATUSES.includes(value as ViolationStatus)) {
    throw new UnprocessableEntityError(`Invalid violation status: ${value}`);
  }
  return value as ViolationStatus;
}

function assertViolationSeverity(value: string): ViolationSeverity {
  if (!VALID_VIOLATION_SEVERITIES.includes(value as ViolationSeverity)) {
    throw new UnprocessableEntityError(`Invalid violation severity: ${value}`);
  }
  return value as ViolationSeverity;
}

function assertViolationFineStatus(value: string): ViolationFineStatus {
  if (!VALID_VIOLATION_FINE_STATUSES.includes(value as ViolationFineStatus)) {
    throw new UnprocessableEntityError(`Invalid violation fine status: ${value}`);
  }
  return value as ViolationFineStatus;
}

function assertArcSubmissionStatus(value: string): ArcSubmissionStatus {
  if (!VALID_ARC_SUBMISSION_STATUSES.includes(value as ArcSubmissionStatus)) {
    throw new UnprocessableEntityError(`Invalid ARC submission status: ${value}`);
  }
  return value as ArcSubmissionStatus;
}

function assertIdArray(values: number[] | undefined, label: string): number[] {
  if (!values) return [];
  if (!Array.isArray(values) || values.some((value) => !Number.isInteger(value) || value <= 0)) {
    throw new BadRequestError(`${label} must be an array of positive integers`);
  }
  return values;
}

async function assertDocumentsBelongToCommunity(
  communityId: number,
  documentIds: number[],
): Promise<void> {
  if (documentIds.length === 0) return;
  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom<{ id: number }>(
    documents,
    {},
    inArray(documents.id, documentIds),
  );
  const foundIds = new Set(rows.map((r) => r.id));
  const missing = documentIds.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    throw new BadRequestError(
      `Evidence document(s) not found in this community: ${missing.join(', ')}`,
    );
  }
}

export function mapViolationRow(row: ViolationRecord): ViolationRecord {
  return {
    ...row,
    status: assertViolationStatus(row.status),
    severity: assertViolationSeverity(row.severity),
    evidenceDocumentIds: Array.isArray(row.evidenceDocumentIds) ? row.evidenceDocumentIds : [],
  };
}

function mapViolationFineRow(row: ViolationFineRecord): ViolationFineRecord {
  return {
    ...row,
    status: assertViolationFineStatus(row.status),
  };
}

export function mapArcRow(row: ArcSubmissionRecord): ArcSubmissionRecord {
  return {
    ...row,
    status: assertArcSubmissionStatus(row.status),
    attachmentDocumentIds: Array.isArray(row.attachmentDocumentIds) ? row.attachmentDocumentIds : [],
  };
}

async function notifyViolationNotice(
  communityId: number,
  violation: ViolationRecord,
  actorUserId: string,
): Promise<void> {
  try {
    await sendNotification(
      communityId,
      {
        type: 'compliance_alert',
        alertTitle: 'Violation Notice Issued',
        alertDescription: `Violation #${violation.id} has been marked as noticed.`,
        severity: 'warning',
        sourceType: 'compliance',
        sourceId: String(violation.id),
      },
      violation.reportedByUserId
        ? { type: 'specific_user', userId: violation.reportedByUserId }
        : 'owners_only',
      actorUserId,
    );

    void createNotificationsForEvent(
      communityId,
      {
        category: 'violation',
        title: 'Violation Notice Issued',
        body: `Violation #${violation.id} has been noticed.`,
        actionUrl: `/violations/${violation.id}`,
        sourceType: 'violation',
        sourceId: String(violation.id),
        priority: 'high',
      },
      violation.reportedByUserId
        ? { type: 'specific_user', userId: violation.reportedByUserId }
        : 'owners_only',
      actorUserId,
    ).catch((err: unknown) => {
      console.error('[violations] in-app violation notice failed', { communityId, violationId: violation.id, error: err instanceof Error ? err.message : String(err) });
    });
  } catch (error) {
    console.error('[violations-service] failed to send violation notice notification', {
      communityId,
      violationId: violation.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function notifyArcDecision(
  communityId: number,
  submission: ArcSubmissionRecord,
  actorUserId: string,
): Promise<void> {
  try {
    const approved = submission.status === 'approved';
    await sendNotification(
      communityId,
      {
        type: 'compliance_alert',
        alertTitle: approved ? 'ARC Application Approved' : 'ARC Application Decision',
        alertDescription: approved
          ? `Your ARC application #${submission.id} was approved.`
          : `Your ARC application #${submission.id} was denied.`,
        severity: approved ? 'info' : 'warning',
        sourceType: 'compliance',
        sourceId: String(submission.id),
      },
      { type: 'specific_user', userId: submission.submittedByUserId },
      actorUserId,
    );

    void createNotificationsForEvent(
      communityId,
      {
        category: 'violation',
        title: approved ? 'ARC Application Approved' : 'ARC Application Denied',
        body: `Your ARC application #${submission.id} was ${approved ? 'approved' : 'denied'}.`,
        actionUrl: `/arc/${submission.id}`,
        sourceType: 'violation',
        sourceId: `violation-arc:${submission.id}:${submission.status}`,
        priority: approved ? 'normal' : 'high',
      },
      { type: 'specific_user', userId: submission.submittedByUserId },
      actorUserId,
    ).catch((err: unknown) => {
      console.error('[violations] in-app ARC decision failed', { communityId, arcSubmissionId: submission.id, error: err instanceof Error ? err.message : String(err) });
    });
  } catch (error) {
    console.error('[violations-service] failed to send ARC decision notification', {
      communityId,
      arcSubmissionId: submission.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * List violations for a community.
 *
 * Note (Plan B3): the `/api/v1/violations` route NO LONGER uses this helper —
 * it owns its where construction inline and calls `paginate()` directly. This
 * helper is kept for the resident-self-view page
 * (`apps/web/src/app/(authenticated)/violations/report/page.tsx`), which
 * fetches its own small list of "my reports" without needing pagination.
 */
export async function listViolationsForCommunity(
  communityId: number,
  filters: {
    status?: ViolationStatus;
    unitId?: number;
    allowedUnitIds?: number[];
    createdAfter?: string;
    createdBefore?: string;
  },
): Promise<ViolationRecord[]> {
  const scoped = createScopedClient(communityId);
  const whereFilters = [];

  if (filters.status) {
    whereFilters.push(eq(violations.status, filters.status));
  }
  if (filters.unitId !== undefined) {
    whereFilters.push(eq(violations.unitId, filters.unitId));
  }
  if (filters.allowedUnitIds) {
    if (filters.allowedUnitIds.length === 0) {
      return [];
    }
    whereFilters.push(inArray(violations.unitId, filters.allowedUnitIds));
  }
  if (filters.createdAfter) {
    whereFilters.push(gte(violations.createdAt, new Date(filters.createdAfter)));
  }
  if (filters.createdBefore) {
    whereFilters.push(lte(violations.createdAt, new Date(filters.createdBefore)));
  }

  const whereClause = whereFilters.length === 0
    ? undefined
    : whereFilters.length === 1
      ? whereFilters[0]
      : and(...whereFilters);

  const rows = await scoped
    .selectFrom<ViolationRecord>(violations, {}, whereClause)
    .orderBy(desc(violations.createdAt), desc(violations.id));

  return rows.map(mapViolationRow);
}

export async function getViolationForCommunity(
  communityId: number,
  violationId: number,
  allowedUnitIds?: number[],
): Promise<ViolationRecord> {
  const scoped = createScopedClient(communityId);
  const whereFilters = [eq(violations.id, violationId)];

  if (allowedUnitIds) {
    if (allowedUnitIds.length === 0) {
      throw new NotFoundError('Violation not found');
    }
    whereFilters.push(inArray(violations.unitId, allowedUnitIds));
  }

  const whereClause = whereFilters.length === 1 ? whereFilters[0] : and(...whereFilters);
  const rows = await scoped.selectFrom<ViolationRecord>(violations, {}, whereClause);
  const record = rows[0];
  if (!record) {
    throw new NotFoundError('Violation not found');
  }
  return mapViolationRow(record);
}

export interface ViolationNoticeCommunityHeader {
  /** Defaults to `'Community Association'` when the row is missing or `name` is null. */
  name: string;
  /**
   * Comma-joined `addressLine1, city, state, zipCode` (skipping any falsy
   * components). Empty string when the community row is missing or all
   * address fields are unset — matches the routes' pre-A3 behavior.
   */
  address: string;
  /** True when the community row was found; false when not. */
  found: boolean;
}

/**
 * Fetch the community-header projection used by the violation notice + hearing
 * notice PDFs (name + composed address line). Both routes need exactly the
 * same projection and the same defensive defaulting; this helper gives them
 * one source of truth.
 *
 * Returns the typed header even when the community row is missing
 * (`{ name: 'Community Association', address: '', found: false }`) so the
 * notice route can short-circuit gracefully — but the hearing-notice route
 * checks `found === false` and throws NotFoundError for stricter behavior.
 */
export async function getViolationNoticeCommunityHeader(
  communityId: number,
): Promise<ViolationNoticeCommunityHeader> {
  const scoped = createScopedClient(communityId);
  const rows = (await scoped.selectFrom(
    communities,
    {},
    eq(communities.id, communityId),
  )) as unknown as Record<string, unknown>[];
  const community = rows[0];
  if (!community) {
    return { name: 'Community Association', address: '', found: false };
  }
  const name = (community['name'] as string | null | undefined) ?? 'Community Association';
  const addressParts = [
    community['addressLine1'] as string | null | undefined,
    community['city'] as string | null | undefined,
    community['state'] as string | null | undefined,
    community['zipCode'] as string | null | undefined,
  ].filter(Boolean) as string[];
  const address = addressParts.length > 0 ? addressParts.join(', ') : '';
  return { name, address, found: true };
}

export async function createViolationForCommunity(
  communityId: number,
  actorUserId: string,
  input: CreateViolationInput,
  requestId?: string | null,
): Promise<ViolationRecord> {
  const validatedDocIds = assertIdArray(input.evidenceDocumentIds, 'evidenceDocumentIds');
  await assertDocumentsBelongToCommunity(communityId, validatedDocIds);

  const scoped = createScopedClient(communityId);
  const [inserted] = await scoped.insert(violations, {
    unitId: input.unitId,
    reportedByUserId: actorUserId,
    category: input.category.trim(),
    description: input.description.trim(),
    status: 'reported',
    severity: input.severity ?? 'minor',
    evidenceDocumentIds: validatedDocIds,
  });

  if (!inserted) {
    throw new Error('Failed to create violation');
  }

  const record = mapViolationRow(inserted as unknown as ViolationRecord);
  await logAuditEvent({
    userId: actorUserId,
    action: 'create',
    resourceType: 'violation',
    resourceId: String(record.id),
    communityId,
    newValues: record,
    metadata: { requestId: requestId ?? null },
  });

  return record;
}

export async function updateViolationForCommunity(
  communityId: number,
  violationId: number,
  actorUserId: string,
  input: UpdateViolationInput,
  requestId?: string | null,
): Promise<ViolationRecord> {
  const scoped = createScopedClient(communityId);
  const existing = await getViolationForCommunity(communityId, violationId);
  const updates: Record<string, unknown> = {};

  if (input.category !== undefined) updates['category'] = input.category.trim();
  if (input.description !== undefined) updates['description'] = input.description.trim();
  if (input.severity !== undefined) updates['severity'] = input.severity;
  if (input.status !== undefined) {
    assertValidStatusTransition(existing.status, input.status);
    updates['status'] = input.status;
  }
  if (input.evidenceDocumentIds !== undefined) {
    const validatedDocIds = assertIdArray(input.evidenceDocumentIds, 'evidenceDocumentIds');
    await assertDocumentsBelongToCommunity(communityId, validatedDocIds);
    updates['evidenceDocumentIds'] = validatedDocIds;
  }
  if (input.noticeDate !== undefined) {
    updates['noticeDate'] = input.noticeDate === null ? null : parseDateOnly(input.noticeDate, 'noticeDate');
  }
  if (input.hearingDate !== undefined) {
    updates['hearingDate'] = input.hearingDate === null ? null : new Date(input.hearingDate);
  }
  if (input.resolutionNotes !== undefined) {
    updates['resolutionNotes'] = input.resolutionNotes;
  }
  if (input.status === 'resolved' || input.status === 'dismissed') {
    updates['resolutionDate'] = new Date();
  }

  if (Object.keys(updates).length === 0) {
    return existing;
  }

  const [updated] = await scoped.update(
    violations,
    updates,
    and(
      eq(violations.id, violationId),
      eq(violations.status, existing.status),
    ),
  );
  if (!updated) {
    throw new AppError(
      'Violation was modified by another user. Please refresh and try again.',
      409,
      'CONFLICT',
    );
  }

  const record = mapViolationRow(updated as unknown as ViolationRecord);
  await logAuditEvent({
    userId: actorUserId,
    action: 'update',
    resourceType: 'violation',
    resourceId: String(violationId),
    communityId,
    oldValues: existing,
    newValues: record,
    metadata: {
      requestId: requestId ?? null,
      ...(record.resolutionDate && !existing.resolutionDate
        ? { resolutionAutoTimestamp: record.resolutionDate.toISOString() }
        : {}),
    },
  });

  if (existing.status !== 'noticed' && record.status === 'noticed') {
    await notifyViolationNotice(communityId, record, actorUserId);
  }

  return record;
}

export async function imposeViolationFineForCommunity(
  communityId: number,
  violationId: number,
  actorUserId: string,
  input: CreateViolationFineInput,
  requestId?: string | null,
): Promise<{
  fine: ViolationFineRecord;
  ledgerEntryId: number;
  lineItemId: number;
}> {
  const scoped = createScopedClient(communityId);
  const violation = await getViolationForCommunity(communityId, violationId);
  if (!['noticed', 'hearing_scheduled'].includes(violation.status)) {
    throw new UnprocessableEntityError('Violation must be noticed or hearing_scheduled before imposing a fine');
  }
  if (input.amountCents <= 0) {
    throw new BadRequestError('amountCents must be a positive integer');
  }

  const dueDate = input.dueDate
    ? parseDateOnly(input.dueDate, 'dueDate')
    : format(addDays(new Date(), Math.max(1, input.graceDays ?? 14)), 'yyyy-MM-dd');

  // Validate status transition before starting multi-step operation
  assertValidStatusTransition(violation.status, 'fined');

  // Multi-step operation: ledger → fine → line item → status update.
  // The scoped client does not expose database transactions, so we use
  // compensating soft-deletes on failure to avoid orphaned records.
  let ledgerEntryId: number | undefined;
  let fine: ViolationFineRecord | undefined;
  let fineId: number | undefined;
  let lineItemId: number | undefined;

  try {
    const ledgerResult = await postLedgerEntry(scoped, {
      entryType: 'fine',
      amountCents: input.amountCents,
      description: `Fine imposed for violation #${violationId}`,
      sourceType: 'violation',
      sourceId: String(violationId),
      unitId: violation.unitId,
      userId: violation.reportedByUserId ?? undefined,
      metadata: {
        violationId,
        notes: input.notes ?? undefined,
      },
      createdByUserId: actorUserId,
      requestId: requestId ?? undefined,
    });
    ledgerEntryId = ledgerResult.id;

    const [fineInserted] = await scoped.insert(violationFines, {
      violationId,
      amountCents: input.amountCents,
      ledgerEntryId,
      status: 'pending',
    });
    if (!fineInserted) {
      throw new Error('Failed to create violation fine');
    }
    fine = mapViolationFineRow(fineInserted as unknown as ViolationFineRecord);
    fineId = fine.id;

    const [lineItem] = await scoped.insert(assessmentLineItems, {
      assessmentId: null,
      unitId: violation.unitId,
      amountCents: input.amountCents,
      dueDate,
      status: 'pending',
      lateFeeCents: 0,
      paidAt: null,
      paymentIntentId: null,
    });
    if (!lineItem) {
      throw new Error('Failed to create one-off fine line item');
    }
    lineItemId = Number(lineItem['id']);
  } catch (error) {
    if (fineId) {
      await scoped
        .update(violationFines, { deletedAt: new Date() }, eq(violationFines.id, fineId))
        .catch(() => {});
    }
    if (ledgerEntryId) {
      await scoped
        .update(ledgerEntries, { deletedAt: new Date() }, eq(ledgerEntries.id, ledgerEntryId))
        .catch(() => {});
    }
    console.error('[violations-service] fine creation rollback executed', {
      fineId,
      ledgerEntryId,
      violationId,
      communityId,
    });
    throw error;
  }

  if (!fine || !ledgerEntryId || !lineItemId) {
    throw new Error('Failed to create violation fine');
  }

  await scoped.update(
    violations,
    { status: 'fined' },
    eq(violations.id, violationId),
  );

  await logAuditEvent({
    userId: actorUserId,
    action: 'create',
    resourceType: 'violation_fine',
    resourceId: String(fine.id),
    communityId,
    newValues: {
      violationId,
      amountCents: fine.amountCents,
      ledgerEntryId,
      lineItemId,
      dueDate,
    },
    metadata: { requestId: requestId ?? null },
  });

  return {
    fine,
    ledgerEntryId,
    lineItemId,
  };
}

export async function resolveViolationForCommunity(
  communityId: number,
  violationId: number,
  actorUserId: string,
  resolutionNotes?: string | null,
  requestId?: string | null,
): Promise<ViolationRecord> {
  return updateViolationForCommunity(
    communityId,
    violationId,
    actorUserId,
    {
      status: 'resolved',
      resolutionNotes: resolutionNotes ?? null,
    },
    requestId,
  );
}

export async function dismissViolationForCommunity(
  communityId: number,
  violationId: number,
  actorUserId: string,
  resolutionNotes?: string | null,
  requestId?: string | null,
): Promise<ViolationRecord> {
  return updateViolationForCommunity(
    communityId,
    violationId,
    actorUserId,
    {
      status: 'dismissed',
      resolutionNotes: resolutionNotes ?? null,
    },
    requestId,
  );
}

/**
 * Single ARC submission, scoped per UNIT for residents — see the visibility
 * note on `paginateArcSubmissionsForCommunity` (#955). Read scope here must
 * stay identical to the list's, or a row hidden from the list would still be
 * reachable by guessing its id.
 *
 * Note this is READ scope only. Acting on a submission is narrower:
 * `withdrawArcSubmissionForCommunity` additionally requires
 * `existing.submittedByUserId === actorUserId`, so a co-resident can see a
 * request but cannot withdraw it.
 */
export async function getArcSubmissionForCommunity(
  communityId: number,
  submissionId: number,
  allowedUnitIds?: number[],
): Promise<ArcSubmissionRecord> {
  const scoped = createScopedClient(communityId);
  const whereFilters = [eq(arcSubmissions.id, submissionId)];

  if (allowedUnitIds) {
    if (allowedUnitIds.length === 0) {
      throw new NotFoundError('ARC submission not found');
    }
    whereFilters.push(inArray(arcSubmissions.unitId, allowedUnitIds));
  }

  const whereClause = whereFilters.length === 1 ? whereFilters[0] : and(...whereFilters);
  const rows = await scoped.selectFrom<ArcSubmissionRecord>(arcSubmissions, {}, whereClause);
  const record = rows[0];
  if (!record) {
    throw new NotFoundError('ARC submission not found');
  }
  return mapArcRow(record);
}

export async function createArcSubmissionForCommunity(
  communityId: number,
  actorUserId: string,
  input: CreateArcSubmissionInput,
  requestId?: string | null,
): Promise<ArcSubmissionRecord> {
  const scoped = createScopedClient(communityId);
  const [inserted] = await scoped.insert(arcSubmissions, {
    unitId: input.unitId,
    submittedByUserId: actorUserId,
    title: input.title.trim(),
    description: input.description.trim(),
    projectType: input.projectType.trim(),
    estimatedStartDate: input.estimatedStartDate ? parseDateOnly(input.estimatedStartDate, 'estimatedStartDate') : null,
    estimatedCompletionDate: input.estimatedCompletionDate ? parseDateOnly(input.estimatedCompletionDate, 'estimatedCompletionDate') : null,
    attachmentDocumentIds: assertIdArray(input.attachmentDocumentIds, 'attachmentDocumentIds'),
    status: 'submitted',
  });

  if (!inserted) {
    throw new Error('Failed to create ARC submission');
  }

  const record = mapArcRow(inserted as unknown as ArcSubmissionRecord);
  await logAuditEvent({
    userId: actorUserId,
    action: 'create',
    resourceType: 'arc_submission',
    resourceId: String(record.id),
    communityId,
    newValues: record,
    metadata: { requestId: requestId ?? null },
  });

  return record;
}

export async function reviewArcSubmissionForCommunity(
  communityId: number,
  submissionId: number,
  actorUserId: string,
  input: ReviewArcSubmissionInput,
  requestId?: string | null,
): Promise<ArcSubmissionRecord> {
  const scoped = createScopedClient(communityId);
  const existing = await getArcSubmissionForCommunity(communityId, submissionId);
  if (existing.status !== 'submitted' && existing.status !== 'under_review') {
    throw new UnprocessableEntityError('Only submitted ARC applications can be reviewed');
  }

  const [updated] = await scoped.update(
    arcSubmissions,
    {
      status: 'under_review',
      reviewNotes: input.reviewNotes ?? existing.reviewNotes,
    },
    eq(arcSubmissions.id, submissionId),
  );
  if (!updated) {
    throw new NotFoundError('ARC submission not found');
  }

  const record = mapArcRow(updated as unknown as ArcSubmissionRecord);
  await logAuditEvent({
    userId: actorUserId,
    action: 'update',
    resourceType: 'arc_submission',
    resourceId: String(submissionId),
    communityId,
    oldValues: existing,
    newValues: record,
    metadata: { requestId: requestId ?? null },
  });

  // Notification is sent at the decide step, not the review step
  return record;
}

export async function decideArcSubmissionForCommunity(
  communityId: number,
  submissionId: number,
  actorUserId: string,
  input: DecideArcSubmissionInput,
  requestId?: string | null,
): Promise<ArcSubmissionRecord> {
  const scoped = createScopedClient(communityId);
  const existing = await getArcSubmissionForCommunity(communityId, submissionId);
  if (existing.status === 'withdrawn') {
    throw new UnprocessableEntityError('Withdrawn ARC submissions cannot be decided');
  }
  if (existing.status === 'approved' || existing.status === 'denied') {
    throw new UnprocessableEntityError('ARC submission is already decided');
  }

  // HB 1203: a denial must carry written reasons citing the rule or covenant
  // relied on. The route contract validates this too; this is the defence for
  // any other caller, and it accounts for `reviewNotes` falling back to the
  // notes left by an earlier `review` step just below.
  if (input.decision === 'denied') {
    const effectiveNotes = input.reviewNotes ?? existing.reviewNotes;
    if (!effectiveNotes || effectiveNotes.trim().length === 0) {
      throw new UnprocessableEntityError(
        'A denial must include written reasons citing the specific rule or covenant relied on.',
      );
    }
  }

  const [updated] = await scoped.update(
    arcSubmissions,
    {
      status: input.decision,
      reviewNotes: input.reviewNotes ?? existing.reviewNotes,
      decidedByUserId: actorUserId,
      decidedAt: new Date(),
    },
    eq(arcSubmissions.id, submissionId),
  );
  if (!updated) {
    throw new NotFoundError('ARC submission not found');
  }

  const record = mapArcRow(updated as unknown as ArcSubmissionRecord);
  await logAuditEvent({
    userId: actorUserId,
    action: 'update',
    resourceType: 'arc_submission',
    resourceId: String(submissionId),
    communityId,
    oldValues: existing,
    newValues: record,
    metadata: { requestId: requestId ?? null },
  });

  await notifyArcDecision(communityId, record, actorUserId);
  return record;
}

export async function withdrawArcSubmissionForCommunity(
  communityId: number,
  submissionId: number,
  actorUserId: string,
  allowedUnitIds?: number[],
  requestId?: string | null,
): Promise<ArcSubmissionRecord> {
  const existing = await getArcSubmissionForCommunity(communityId, submissionId, allowedUnitIds);
  if (existing.submittedByUserId !== actorUserId) {
    throw new ForbiddenError('Only the submitter can withdraw this ARC application');
  }
  if (existing.status === 'approved' || existing.status === 'denied') {
    throw new UnprocessableEntityError('Decided ARC submissions cannot be withdrawn');
  }

  const scoped = createScopedClient(communityId);
  const [updated] = await scoped.update(
    arcSubmissions,
    {
      status: 'withdrawn',
    },
    eq(arcSubmissions.id, submissionId),
  );
  if (!updated) {
    throw new NotFoundError('ARC submission not found');
  }

  const record = mapArcRow(updated as unknown as ArcSubmissionRecord);
  await logAuditEvent({
    userId: actorUserId,
    action: 'update',
    resourceType: 'arc_submission',
    resourceId: String(submissionId),
    communityId,
    oldValues: existing,
    newValues: record,
    metadata: { requestId: requestId ?? null },
  });
  return record;
}

export async function markMatchingViolationFinePaid(
  communityId: number,
  unitId: number,
  amountCents: number,
  actorUserId: string,
  requestId?: string | null,
  /** When provided, only match fines for this specific violation (avoids ambiguity with duplicate amounts). */
  violationId?: number,
): Promise<number | null> {
  const scoped = createScopedClient(communityId);
  const fineFilters = [
    eq(violationFines.status, 'pending'),
    eq(violationFines.amountCents, Math.abs(amountCents)),
  ];
  if (violationId !== undefined) {
    fineFilters.push(eq(violationFines.violationId, violationId));
  }
  const pendingFines = await scoped.selectFrom<ViolationFineRecord>(
    violationFines,
    {},
    and(...fineFilters),
  );
  if (pendingFines.length === 0) {
    return null;
  }

  const violationIds = pendingFines.map((fine) => fine.violationId);
  const relatedViolations = await scoped.selectFrom<ViolationRecord>(
    violations,
    {},
    inArray(violations.id, violationIds),
  );
  const violationById = new Map<number, ViolationRecord>();
  for (const violation of relatedViolations) {
    violationById.set(violation.id, violation);
  }

  const match = pendingFines
    .filter((fine) => violationById.get(fine.violationId)?.unitId === unitId)
    .sort((a, b) => b.issuedAt.getTime() - a.issuedAt.getTime())[0];

  if (!match) {
    return null;
  }

  await scoped.update(
    violationFines,
    {
      status: 'paid',
      paidAt: new Date(),
    },
    eq(violationFines.id, match.id),
  );

  await logAuditEvent({
    userId: actorUserId,
    action: 'update',
    resourceType: 'violation_fine',
    resourceId: String(match.id),
    communityId,
    oldValues: {
      status: match.status,
      paidAt: match.paidAt,
    },
    newValues: {
      status: 'paid',
      paidAt: new Date().toISOString(),
    },
    metadata: { requestId: requestId ?? null },
  });

  return match.id;
}

// ---------------------------------------------------------------------------
// ARC list helpers (used by /api/v1/arc GET)
// ---------------------------------------------------------------------------

export interface PaginatedArcSubmissions {
  data: ArcSubmissionRecord[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
    pageSize: number;
  };
}

/**
 * Cursor-paginated list of ARC submissions in a community. Filter pushdown:
 * - `status` → `eq(arcSubmissions.status, status)`
 * - `unitId` → `eq(arcSubmissions.unitId, unitId)`
 * - `allowedUnitIds` → `inArray(arcSubmissions.unitId, allowedUnitIds)`
 *
 * Resident-with-no-units short-circuit: drizzle forbids `inArray(col, [])`,
 * so when `allowedUnitIds` is an empty array (resident with zero units)
 * the helper returns an empty paginated envelope rather than calling
 * paginate. Caller should still pre-check this case to skip the SQL
 * round-trip entirely if possible.
 *
 * Rows are mapped through `mapArcRow` so callers don't have to.
 *
 * AUTHZ: tenant-scoped — caller MUST have already verified the actor's
 * community membership, ARC feature gate, and `arc_submissions:read`
 * permission. For resident roles, `allowedUnitIds` MUST be passed.
 *
 * ## Visibility is per UNIT, not per submitter — deliberately (#955)
 *
 * `listActorUnitIds` resolves a user's units from EITHER a `user_roles.unit_id`
 * assignment OR `units.owner_user_id`. So on a unit that has both an owner and
 * a tenant, each sees the other's ARC submissions — title, description, status
 * and `reviewNotes`.
 *
 * That is the intended scope, not an oversight:
 *
 * - An ARC application is a request to alter the PROPERTY. Under a Florida
 *   declaration the OWNER is the party bound by the covenants and liable for
 *   unapproved work, so an owner who could not see a request against their own
 *   unit would be the actual defect. Hiding it would also let a tenant commit
 *   the owner to a modification the owner never saw.
 * - It matches `paginateViolationsForCommunity` exactly, which scopes the same
 *   way for the same reason. Diverging here would give two adjacent
 *   property-scoped features two different mental models.
 *
 * The residual case — a tenant seeing their landlord's requests — is
 * low-consequence: the request concerns the home they live in and the work
 * would be visible to them anyway.
 *
 * Weighed and rejected: per-submitter scoping (`eq(submittedByUserId, actor)`),
 * and an asymmetric rule (owners see the unit, tenants see only their own).
 * The asymmetric version is the tighter design, but it buys privacy from a
 * party with no standing in the decision at the cost of diverging from
 * violations. Revisit only with a real requirement, not on the general
 * principle that narrower is safer.
 *
 * Pinned by `__tests__/violations/arc-visibility-scope.test.ts` so a future
 * change has to be deliberate.
 */
export async function paginateArcSubmissionsForCommunity(params: {
  communityId: number;
  cursor?: string;
  pageSize?: number;
  status?: ArcSubmissionStatus;
  unitId?: number;
  allowedUnitIds?: number[];
}): Promise<PaginatedArcSubmissions> {
  if (params.allowedUnitIds && params.allowedUnitIds.length === 0) {
    return {
      data: [],
      pagination: { nextCursor: null, hasMore: false, pageSize: params.pageSize ?? 50 },
    };
  }

  const filterClauses = [];
  if (params.status !== undefined) {
    filterClauses.push(eq(arcSubmissions.status, params.status));
  }
  if (params.unitId !== undefined) {
    filterClauses.push(eq(arcSubmissions.unitId, params.unitId));
  }
  if (params.allowedUnitIds && params.allowedUnitIds.length > 0) {
    filterClauses.push(inArray(arcSubmissions.unitId, params.allowedUnitIds));
  }
  const where =
    filterClauses.length === 0
      ? undefined
      : filterClauses.length === 1
        ? filterClauses[0]
        : and(...filterClauses);

  const scoped = createScopedClient(params.communityId);
  const result = await paginate<ArcSubmissionRecord>(
    scoped,
    arcSubmissions,
    { cursor: params.cursor, pageSize: params.pageSize },
    { where },
  );
  return {
    data: result.data.map(mapArcRow),
    pagination: result.pagination,
  };
}

// ---------------------------------------------------------------------------
// Violations list helpers (used by /api/v1/violations GET + POST)
// ---------------------------------------------------------------------------

import { hydrateReportedByRole, type WithReportedByRole } from '@/lib/violations/hydrate-reporter-role';

export interface PaginatedViolations {
  data: WithReportedByRole<ViolationRecord>[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
    pageSize: number;
  };
}

/**
 * Cursor-paginated list of violations in a community. Filter pushdown:
 * - `status` → `eq(violations.status, status)`
 * - `severity` → `eq(violations.severity, severity)`
 * - `unitId` → `eq(violations.unitId, unitId)`
 * - `allowedUnitIds` → `inArray(violations.unitId, allowedUnitIds)`
 * - `createdAfter` → `gte(violations.createdAt, parsed)`
 * - `createdBefore` → `lte(violations.createdAt, parsed)`
 *
 * Resident-with-no-units short-circuit: drizzle forbids `inArray(col, [])`,
 * so when `allowedUnitIds` is empty we return an empty paginated envelope.
 *
 * Rows are mapped through `mapViolationRow` then decorated with the
 * reporter's role via `hydrateReportedByRole` (one extra round-trip per
 * page; no per-row N+1).
 *
 * AUTHZ: tenant-scoped — caller MUST have already verified the actor's
 * community membership, violations feature gate, and `violations:read`
 * permission. For resident roles, `allowedUnitIds` MUST be passed.
 */
export async function paginateViolationsForCommunity(params: {
  communityId: number;
  cursor?: string;
  pageSize?: number;
  status?: ViolationStatus;
  severity?: ViolationSeverity;
  unitId?: number;
  allowedUnitIds?: number[];
  createdAfter?: string;
  createdBefore?: string;
}): Promise<PaginatedViolations> {
  if (params.allowedUnitIds && params.allowedUnitIds.length === 0) {
    return {
      data: [],
      pagination: { nextCursor: null, hasMore: false, pageSize: params.pageSize ?? 50 },
    };
  }

  const filterClauses = [];
  if (params.status !== undefined) {
    filterClauses.push(eq(violations.status, params.status));
  }
  if (params.severity !== undefined) {
    filterClauses.push(eq(violations.severity, params.severity));
  }
  if (params.unitId !== undefined) {
    filterClauses.push(eq(violations.unitId, params.unitId));
  }
  if (params.allowedUnitIds && params.allowedUnitIds.length > 0) {
    filterClauses.push(inArray(violations.unitId, params.allowedUnitIds));
  }
  if (params.createdAfter) {
    filterClauses.push(gte(violations.createdAt, new Date(params.createdAfter)));
  }
  if (params.createdBefore) {
    filterClauses.push(lte(violations.createdAt, new Date(params.createdBefore)));
  }
  const where =
    filterClauses.length === 0
      ? undefined
      : filterClauses.length === 1
        ? filterClauses[0]
        : and(...filterClauses);

  const scoped = createScopedClient(params.communityId);
  const result = await paginate<ViolationRecord>(
    scoped,
    violations,
    { cursor: params.cursor, pageSize: params.pageSize },
    { where },
  );

  const mapped = result.data.map(mapViolationRow);
  const hydrated = await hydrateReportedByRole(scoped, mapped);
  return {
    data: hydrated,
    pagination: result.pagination,
  };
}

/**
 * Confirm `unitId` exists in the community. Returns true/false; does not
 * throw. Replaces the route's prior inline `scoped.selectFrom(units, ...)`
 * call so the route doesn't need to import the `units` table.
 */
export async function unitExistsInCommunity(
  communityId: number,
  unitId: number,
): Promise<boolean> {
  const scoped = createScopedClient(communityId);
  const matches = await scoped.selectFrom<{ id: number }>(
    units,
    { id: units.id },
    eq(units.id, unitId),
  );
  return matches.length > 0;
}
