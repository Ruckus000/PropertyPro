/**
 * Core e-sign service — template CRUD, submission lifecycle, signing flow, consent.
 *
 * Follows the violations-service.ts pattern:
 * - Typed interfaces for all records and inputs
 * - All tenant queries via createScopedClient(communityId)
 * - Audit events via logAuditEvent
 * - Signing flow uses createAdminClient for unscoped reads (slug lookup), scoped client for mutations
 */
import crypto from 'node:crypto';
import {
  createAdminClient,
  createScopedClient,
  esignConsent,
  esignEvents,
  esignSigners,
  esignSubmissions,
  esignTemplates,
  logAuditEvent,
} from '@propertypro/db';
import { and, eq, gte, inArray, isNull, or } from '@propertypro/db/filters';
import {
  ESIGN_CONSENT_TEXT,
  ESIGN_MAX_REMINDERS,
  type EsignFieldsSchema,
  type EsignFieldType,
  type EsignSigningOrder,
  type EsignSubmissionStatus,
  type EsignTemplateStatus,
  type EsignTemplateType,
} from '@propertypro/shared';
import { BadRequestError, NotFoundError, UnprocessableEntityError } from '@/lib/api/errors';
import { flattenSignedPdf, computeDocumentHash, uploadSignedDocument } from './esign-pdf-service';

// ---------------------------------------------------------------------------
// Record interfaces
// ---------------------------------------------------------------------------

export interface EsignTemplateRecord {
  [key: string]: unknown;
  id: number;
  communityId: number;
  externalId: string;
  name: string;
  description: string | null;
  sourceDocumentPath: string | null;
  templateType: string | null;
  fieldsSchema: EsignFieldsSchema | null;
  status: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface EsignSubmissionRecord {
  [key: string]: unknown;
  id: number;
  communityId: number;
  templateId: number;
  externalId: string;
  status: string;
  signingOrder: string;
  documentHash: string | null;
  sendEmail: boolean;
  expiresAt: Date | null;
  completedAt: Date | null;
  signedDocumentPath: string | null;
  messageSubject: string | null;
  messageBody: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface EsignSignerRecord {
  [key: string]: unknown;
  id: number;
  communityId: number;
  submissionId: number;
  externalId: string;
  userId: string | null;
  email: string;
  name: string | null;
  role: string;
  slug: string | null;
  sortOrder: number;
  status: string;
  openedAt: Date | null;
  completedAt: Date | null;
  signedValues: Record<string, unknown> | null;
  reminderCount: number;
  createdAt: Date;
}

export interface EsignEventRecord {
  [key: string]: unknown;
  id: number;
  communityId: number;
  submissionId: number;
  signerId: number | null;
  eventType: string;
  eventData: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Input interfaces
// ---------------------------------------------------------------------------

export interface CreateTemplateInput {
  name: string;
  description?: string;
  templateType: EsignTemplateType;
  sourceDocumentPath: string;
  fieldsSchema: EsignFieldsSchema;
}

export interface UpdateTemplateInput {
  name?: string;
  description?: string;
  fieldsSchema?: EsignFieldsSchema;
}

export interface CreateSubmissionInput {
  templateId: number;
  signers: Array<{
    email: string;
    name: string;
    role: string;
    sortOrder: number;
    userId?: string;
    prefilledFields?: Record<string, unknown>;
  }>;
  signingOrder: EsignSigningOrder;
  sendEmail: boolean;
  expiresAt?: string;
  messageSubject?: string;
  messageBody?: string;
  linkedDocumentId?: number;
}

export interface SubmitSignatureInput {
  signedValues: Record<string, {
    fieldId: string;
    type: EsignFieldType;
    value: string;
    signedAt: string;
  }>;
  consentGiven: true;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = Record<string, any>;

function generateExternalId(): string {
  return crypto.randomUUID();
}

function generateSigningSlug(): string {
  return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
}

function validateFieldsSchema(schema: EsignFieldsSchema): void {
  if (schema.version !== 1) {
    throw new BadRequestError('Unsupported fields schema version');
  }
  for (const field of schema.fields) {
    if (field.x < 0 || field.x > 100 || field.y < 0 || field.y > 100) {
      throw new BadRequestError(`Field ${field.id}: x/y must be between 0 and 100`);
    }
    if (field.width <= 0 || field.width > 100 || field.height <= 0 || field.height > 100) {
      throw new BadRequestError(`Field ${field.id}: width/height must be between 0 and 100`);
    }
    if (field.x + field.width > 100 || field.y + field.height > 100) {
      throw new BadRequestError(`Field ${field.id}: field extends beyond page bounds`);
    }
    if (!schema.signerRoles.includes(field.signerRole)) {
      throw new BadRequestError(`Field ${field.id}: signerRole "${field.signerRole}" not in template roles`);
    }
  }
}

/** Map a snake_case Supabase row to camelCase for our interfaces. */
function mapSignerRow(row: AnyRow): EsignSignerRecord {
  return {
    id: row.id,
    communityId: row.community_id,
    submissionId: row.submission_id,
    externalId: row.external_id,
    userId: row.user_id,
    email: row.email,
    name: row.name,
    role: row.role,
    slug: row.slug,
    sortOrder: row.sort_order ?? 0,
    status: row.status,
    openedAt: row.opened_at,
    completedAt: row.completed_at,
    signedValues: row.signed_values,
    reminderCount: row.reminder_count ?? 0,
    createdAt: row.created_at,
  };
}

function mapSubmissionRow(row: AnyRow): EsignSubmissionRecord {
  return {
    id: row.id,
    communityId: row.community_id,
    templateId: row.template_id,
    externalId: row.external_id,
    status: row.status,
    signingOrder: row.signing_order ?? 'parallel',
    documentHash: row.document_hash,
    sendEmail: row.send_email,
    expiresAt: row.expires_at,
    completedAt: row.completed_at,
    signedDocumentPath: row.signed_document_path,
    messageSubject: row.message_subject,
    messageBody: row.message_body,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTemplateRow(row: AnyRow): EsignTemplateRecord {
  return {
    id: row.id,
    communityId: row.community_id,
    externalId: row.external_id,
    name: row.name,
    description: row.description,
    sourceDocumentPath: row.source_document_path,
    templateType: row.template_type,
    fieldsSchema: row.fields_schema,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Returns the admin Supabase client with a typed helper for raw table access.
 * The untyped admin client's .from() returns `any`, which is fine for our
 * snake_case operations where we map results manually.
 */
function getAdmin() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createAdminClient() as any;
}

// ---------------------------------------------------------------------------
// Template CRUD
// ---------------------------------------------------------------------------

export async function createTemplate(
  communityId: number,
  userId: string,
  input: CreateTemplateInput,
  requestId?: string | null,
): Promise<EsignTemplateRecord> {
  validateFieldsSchema(input.fieldsSchema);

  const scoped = createScopedClient(communityId);
  const rows = await scoped.insert(esignTemplates, {
    communityId,
    externalId: generateExternalId(),
    name: input.name,
    description: input.description ?? null,
    sourceDocumentPath: input.sourceDocumentPath,
    templateType: input.templateType,
    fieldsSchema: input.fieldsSchema,
    status: 'active',
    createdBy: userId,
  });

  const record = rows[0] as EsignTemplateRecord;

  await logAuditEvent({
    userId,
    action: 'esign_template_created',
    resourceType: 'esign_template',
    resourceId: String(record.id),
    communityId,
    newValues: record,
    metadata: { requestId: requestId ?? null },
  });

  return record;
}

export async function listTemplates(
  communityId: number,
  filters?: { status?: EsignTemplateStatus; type?: EsignTemplateType },
): Promise<EsignTemplateRecord[]> {
  const scoped = createScopedClient(communityId);
  const conditions = [];

  if (filters?.status) {
    conditions.push(eq(esignTemplates.status, filters.status));
  }
  if (filters?.type) {
    conditions.push(eq(esignTemplates.templateType, filters.type));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = await scoped.selectFrom(esignTemplates, {}, whereClause);
  return rows as EsignTemplateRecord[];
}

export async function getTemplate(
  communityId: number,
  templateId: number,
): Promise<EsignTemplateRecord> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom(
    esignTemplates,
    {},
    eq(esignTemplates.id, templateId),
  );

  if (rows.length === 0) {
    throw new NotFoundError('Template not found');
  }

  return rows[0] as EsignTemplateRecord;
}

export async function updateTemplate(
  communityId: number,
  userId: string,
  templateId: number,
  input: UpdateTemplateInput,
  requestId?: string | null,
): Promise<EsignTemplateRecord> {
  const existing = await getTemplate(communityId, templateId);

  if (input.fieldsSchema) {
    validateFieldsSchema(input.fieldsSchema);
  }

  const scoped = createScopedClient(communityId);
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) updateData.name = input.name;
  if (input.description !== undefined) updateData.description = input.description;
  if (input.fieldsSchema !== undefined) updateData.fieldsSchema = input.fieldsSchema;

  const rows = await scoped.update(
    esignTemplates,
    updateData,
    eq(esignTemplates.id, templateId),
  );

  const record = rows[0] as EsignTemplateRecord;

  await logAuditEvent({
    userId,
    action: 'esign_template_updated',
    resourceType: 'esign_template',
    resourceId: String(record.id),
    communityId,
    oldValues: existing,
    newValues: record,
    metadata: { requestId: requestId ?? null },
  });

  return record;
}

export async function archiveTemplate(
  communityId: number,
  userId: string,
  templateId: number,
  requestId?: string | null,
): Promise<void> {
  const existing = await getTemplate(communityId, templateId);

  const scoped = createScopedClient(communityId);
  await scoped.update(
    esignTemplates,
    { status: 'archived', updatedAt: new Date() },
    eq(esignTemplates.id, templateId),
  );

  await logAuditEvent({
    userId,
    action: 'esign_template_archived',
    resourceType: 'esign_template',
    resourceId: String(templateId),
    communityId,
    oldValues: existing,
    metadata: { requestId: requestId ?? null },
  });
}

export async function cloneTemplate(
  communityId: number,
  userId: string,
  templateId: number,
  newName: string,
  requestId?: string | null,
): Promise<EsignTemplateRecord> {
  const source = await getTemplate(communityId, templateId);

  const scoped = createScopedClient(communityId);
  const rows = await scoped.insert(esignTemplates, {
    communityId,
    externalId: generateExternalId(),
    name: newName,
    description: source.description,
    sourceDocumentPath: source.sourceDocumentPath,
    templateType: source.templateType,
    fieldsSchema: source.fieldsSchema,
    status: 'active',
    createdBy: userId,
  });

  const record = rows[0] as EsignTemplateRecord;

  await logAuditEvent({
    userId,
    action: 'esign_template_cloned',
    resourceType: 'esign_template',
    resourceId: String(record.id),
    communityId,
    newValues: record,
    metadata: { sourceTemplateId: templateId, requestId: requestId ?? null },
  });

  return record;
}

// ---------------------------------------------------------------------------
// Submission lifecycle
// ---------------------------------------------------------------------------

export async function createSubmission(
  communityId: number,
  userId: string,
  input: CreateSubmissionInput,
  requestId?: string | null,
): Promise<{ submission: EsignSubmissionRecord; signers: EsignSignerRecord[] }> {
  const template = await getTemplate(communityId, input.templateId);
  const fieldsSchema = template.fieldsSchema;

  if (!fieldsSchema) {
    throw new BadRequestError('Template has no field definitions');
  }

  for (const signer of input.signers) {
    if (!fieldsSchema.signerRoles.includes(signer.role)) {
      throw new BadRequestError(`Signer role "${signer.role}" not defined in template`);
    }
  }

  const scoped = createScopedClient(communityId);
  const submissionExternalId = generateExternalId();

  const subRows = await scoped.insert(esignSubmissions, {
    communityId,
    templateId: input.templateId,
    externalId: submissionExternalId,
    status: 'pending',
    signingOrder: input.signingOrder,
    sendEmail: input.sendEmail,
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    messageSubject: input.messageSubject ?? null,
    messageBody: input.messageBody ?? null,
    linkedDocumentId: input.linkedDocumentId ?? null,
    createdBy: userId,
  });
  const submission = subRows[0] as EsignSubmissionRecord;

  const signerRecords: EsignSignerRecord[] = [];
  for (const signerInput of input.signers) {
    const signerRows = await scoped.insert(esignSigners, {
      communityId,
      submissionId: submission.id,
      externalId: generateExternalId(),
      userId: signerInput.userId ?? null,
      email: signerInput.email,
      name: signerInput.name,
      role: signerInput.role,
      slug: generateSigningSlug(),
      sortOrder: signerInput.sortOrder,
      status: 'pending',
      prefilledFields: signerInput.prefilledFields ?? null,
    });
    signerRecords.push(signerRows[0] as EsignSignerRecord);
  }

  await scoped.insert(esignEvents, {
    communityId,
    submissionId: submission.id,
    eventType: 'created',
    eventData: { templateName: template.name, signerCount: signerRecords.length },
  });

  await logAuditEvent({
    userId,
    action: 'esign_submission_created',
    resourceType: 'esign_submission',
    resourceId: String(submission.id),
    communityId,
    newValues: { ...submission, signerCount: signerRecords.length },
    metadata: { requestId: requestId ?? null },
  });

  return { submission, signers: signerRecords };
}

export async function listSubmissions(
  communityId: number,
  filters?: { status?: EsignSubmissionStatus },
): Promise<EsignSubmissionRecord[]> {
  const scoped = createScopedClient(communityId);
  const whereClause = filters?.status
    ? eq(esignSubmissions.status, filters.status)
    : undefined;

  const rows = await scoped.selectFrom(esignSubmissions, {}, whereClause);
  return rows as EsignSubmissionRecord[];
}

// ---------------------------------------------------------------------------
// My-pending: user-scoped pending signers (for dashboard widget / non-admin view)
// ---------------------------------------------------------------------------

export interface MyPendingSignerRecord {
  signerId: number;
  signerStatus: string;
  submissionId: number;
  submissionExternalId: string;
  messageSubject: string | null;
  templateName: string;
  templateType: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  slug: string | null;
}

/**
 * Returns pending signing requests for a specific user (by userId or email).
 * Used by the dashboard "Documents to Sign" widget and the /api/v1/esign/my-pending endpoint.
 */
export async function listMyPendingSigners(
  communityId: number,
  userId: string,
  userEmail: string,
): Promise<MyPendingSignerRecord[]> {
  const scoped = createScopedClient(communityId);

  // 1. Find signers matching the user that are still pending/opened
  const signerRows = await scoped.selectFrom(
    esignSigners,
    {},
    and(
      or(eq(esignSigners.userId, userId), eq(esignSigners.email, userEmail.toLowerCase())),
      or(eq(esignSigners.status, 'pending'), eq(esignSigners.status, 'opened')),
      isNull(esignSigners.deletedAt),
    ),
  );

  if (signerRows.length === 0) return [];

  // 2. Get associated submissions that are still pending and not expired
  const submissionIds = [
    ...new Set(signerRows.map((r) => r['submissionId'] as number)),
  ];
  const subRows = await scoped.selectFrom(
    esignSubmissions,
    {},
    and(
      inArray(esignSubmissions.id, submissionIds),
      eq(esignSubmissions.status, 'pending'),
      or(
        isNull(esignSubmissions.expiresAt),
        gte(esignSubmissions.expiresAt, new Date()),
      ),
      isNull(esignSubmissions.deletedAt),
    ),
  );

  if (subRows.length === 0) return [];

  const subsById = new Map(
    subRows.map((r) => [r['id'] as number, r as EsignSubmissionRecord]),
  );

  // 3. Get template names for those submissions
  const templateIds = [
    ...new Set(subRows.map((r) => r['templateId'] as number)),
  ];
  const templateRows = await scoped.selectFrom(
    esignTemplates,
    {},
    inArray(esignTemplates.id, templateIds),
  );
  const templatesById = new Map(
    templateRows.map((r) => [r['id'] as number, r as EsignTemplateRecord]),
  );

  // 4. Map, filter to valid submissions, sort, limit
  const results: MyPendingSignerRecord[] = [];
  for (const signer of signerRows) {
    const subId = signer['submissionId'] as number;
    const sub = subsById.get(subId);
    if (!sub) continue; // submission was filtered out (expired/cancelled/deleted)

    const template = templatesById.get(sub.templateId);
    results.push({
      signerId: signer['id'] as number,
      signerStatus: signer['status'] as string,
      submissionId: subId,
      submissionExternalId: sub.externalId,
      messageSubject: sub.messageSubject,
      templateName: template?.name ?? 'Unknown Template',
      templateType: template?.templateType ?? null,
      expiresAt: sub.expiresAt ? new Date(sub.expiresAt as unknown as string) : null,
      createdAt: new Date(signer['createdAt'] as unknown as string),
      slug: (signer['slug'] as string) ?? null,
    });
  }

  // Sort by createdAt descending, limit to 10
  results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return results.slice(0, 10);
}

export async function getSubmission(
  communityId: number,
  submissionId: number,
): Promise<{
  submission: EsignSubmissionRecord;
  signers: EsignSignerRecord[];
  events: EsignEventRecord[];
}> {
  const scoped = createScopedClient(communityId);

  const subRows = await scoped.selectFrom(
    esignSubmissions,
    {},
    eq(esignSubmissions.id, submissionId),
  );
  if (subRows.length === 0) {
    throw new NotFoundError('Submission not found');
  }
  const submission = subRows[0] as EsignSubmissionRecord;

  const signerRows = await scoped.selectFrom(
    esignSigners,
    {},
    eq(esignSigners.submissionId, submissionId),
  );

  const eventRows = await scoped.selectFrom(
    esignEvents,
    {},
    eq(esignEvents.submissionId, submissionId),
  );

  return {
    submission,
    signers: signerRows as EsignSignerRecord[],
    events: eventRows as EsignEventRecord[],
  };
}

export async function cancelSubmission(
  communityId: number,
  userId: string,
  submissionId: number,
  requestId?: string | null,
): Promise<void> {
  const { submission } = await getSubmission(communityId, submissionId);

  if (submission.status !== 'pending') {
    throw new UnprocessableEntityError('Only pending submissions can be cancelled');
  }

  const scoped = createScopedClient(communityId);
  await scoped.update(
    esignSubmissions,
    { status: 'cancelled', updatedAt: new Date() },
    eq(esignSubmissions.id, submissionId),
  );

  await scoped.insert(esignEvents, {
    communityId,
    submissionId,
    eventType: 'cancelled',
    eventData: { cancelledBy: userId },
  });

  await logAuditEvent({
    userId,
    action: 'esign_submission_cancelled',
    resourceType: 'esign_submission',
    resourceId: String(submissionId),
    communityId,
    metadata: { requestId: requestId ?? null },
  });
}

export async function sendReminder(
  communityId: number,
  userId: string,
  submissionId: number,
  signerId: number,
  requestId?: string | null,
): Promise<void> {
  const scoped = createScopedClient(communityId);

  const signerRows = await scoped.selectFrom(
    esignSigners,
    {},
    and(eq(esignSigners.id, signerId), eq(esignSigners.submissionId, submissionId)),
  );
  if (signerRows.length === 0) {
    throw new NotFoundError('Signer not found');
  }

  const signer = signerRows[0] as EsignSignerRecord;

  if (signer.status !== 'pending' && signer.status !== 'opened') {
    throw new UnprocessableEntityError('Can only send reminders to pending or opened signers');
  }

  if (signer.reminderCount >= ESIGN_MAX_REMINDERS) {
    throw new UnprocessableEntityError(
      `Maximum of ${ESIGN_MAX_REMINDERS} reminders reached for this signer`,
    );
  }

  await scoped.update(
    esignSigners,
    {
      reminderCount: signer.reminderCount + 1,
      lastReminderAt: new Date(),
      updatedAt: new Date(),
    },
    eq(esignSigners.id, signerId),
  );

  await scoped.insert(esignEvents, {
    communityId,
    submissionId: signer.submissionId,
    signerId: signer.id,
    eventType: 'reminder_sent',
    eventData: { reminderNumber: signer.reminderCount + 1 },
  });

  await logAuditEvent({
    userId,
    action: 'esign_reminder_sent',
    resourceType: 'esign_signer',
    resourceId: String(signerId),
    communityId,
    metadata: { reminderNumber: signer.reminderCount + 1, requestId: requestId ?? null },
  });
}

// ---------------------------------------------------------------------------
// Signing flow (token-authenticated — admin client for unscoped SELECTs, scoped client for mutations)
// ---------------------------------------------------------------------------

export async function getSignerContext(slug: string): Promise<{
  signer: EsignSignerRecord;
  submission: EsignSubmissionRecord;
  template: EsignTemplateRecord;
  isWaiting: boolean;
  waitingFor: string | null;
}> {
  const admin = getAdmin();

  const { data: signerRows, error: signerError } = await admin
    .from('esign_signers')
    .select('*')
    .eq('slug', slug)
    .is('deleted_at', null)
    .limit(1);

  if (signerError || !signerRows || signerRows.length === 0) {
    throw new NotFoundError('Invalid or expired signing link');
  }

  const signer = mapSignerRow(signerRows[0] as AnyRow);

  if (signer.status === 'completed') {
    throw new UnprocessableEntityError('You have already signed this document');
  }
  if (signer.status === 'declined') {
    throw new UnprocessableEntityError('You have declined to sign this document');
  }

  const { data: subRows } = await admin
    .from('esign_submissions')
    .select('*')
    .eq('id', signer.submissionId)
    .is('deleted_at', null)
    .limit(1);

  if (!subRows || subRows.length === 0) {
    throw new NotFoundError('Submission not found');
  }

  const submission = mapSubmissionRow(subRows[0] as AnyRow);

  if (submission.status === 'cancelled') {
    throw new UnprocessableEntityError('This signing request has been cancelled');
  }
  if (submission.status === 'expired' ||
    (submission.expiresAt && new Date(submission.expiresAt) < new Date())) {
    throw new UnprocessableEntityError('This signing request has expired');
  }

  const { data: tplRows } = await admin
    .from('esign_templates')
    .select('*')
    .eq('id', submission.templateId)
    .is('deleted_at', null)
    .limit(1);

  if (!tplRows || tplRows.length === 0) {
    throw new NotFoundError('Template not found');
  }

  const template = mapTemplateRow(tplRows[0] as AnyRow);

  // Check sequential signing
  let isWaiting = false;
  let waitingFor: string | null = null;

  if (submission.signingOrder === 'sequential') {
    const { data: priorSigners } = await admin
      .from('esign_signers')
      .select('*')
      .eq('submission_id', signer.submissionId)
      .lt('sort_order', signer.sortOrder)
      .is('deleted_at', null);

    const incompleteSigners = (priorSigners ?? []).filter(
      (s: AnyRow) => s.status !== 'completed',
    );

    if (incompleteSigners.length > 0) {
      isWaiting = true;
      waitingFor = (incompleteSigners[0] as AnyRow).name ?? 'a previous signer';
    }
  }

  // Mark as opened if first access — use scoped client for mutations
  if (signer.status === 'pending') {
    const scoped = createScopedClient(signer.communityId);

    await scoped.update(
      esignSigners,
      { status: 'opened', openedAt: new Date() },
      eq(esignSigners.id, signer.id),
    );

    await scoped.insert(esignEvents, {
      communityId: signer.communityId,
      submissionId: signer.submissionId,
      signerId: signer.id,
      eventType: 'opened',
      eventData: {},
    });

    signer.status = 'opened';
  }

  return { signer, submission, template, isWaiting, waitingFor };
}

export async function submitSignature(
  slug: string,
  input: SubmitSignatureInput,
  ipAddress: string,
  userAgent: string,
): Promise<{ success: boolean }> {
  const { signer } = await getSignerContext(slug);

  if (signer.status === 'completed') {
    throw new UnprocessableEntityError('You have already signed this document');
  }

  const scoped = createScopedClient(signer.communityId);

  // Atomic guard: only proceed if signer is still pending/opened (prevents double-sign race)
  const updated = await scoped.update(
    esignSigners,
    {
      signedValues: input.signedValues,
      status: 'completed',
      completedAt: new Date(),
    },
    and(
      eq(esignSigners.id, signer.id),
      or(eq(esignSigners.status, 'pending'), eq(esignSigners.status, 'opened')),
    ),
  );

  if (updated.length === 0) {
    throw new UnprocessableEntityError('You have already signed this document');
  }

  await scoped.insert(esignEvents, {
    communityId: signer.communityId,
    submissionId: signer.submissionId,
    signerId: signer.id,
    eventType: 'signer_completed',
    eventData: { fieldCount: Object.keys(input.signedValues).length },
    ipAddress,
    userAgent,
  });

  // Dual-path consent (§2.2)
  if (signer.userId) {
    const existing = await scoped.selectFrom(
      esignConsent,
      {},
      and(eq(esignConsent.userId, signer.userId), isNull(esignConsent.revokedAt)),
    );

    if (existing.length === 0) {
      await scoped.insert(esignConsent, {
        communityId: signer.communityId,
        userId: signer.userId,
        consentGiven: true,
        consentText: ESIGN_CONSENT_TEXT,
        ipAddress,
        userAgent,
      });
    }
  }

  await scoped.insert(esignEvents, {
    communityId: signer.communityId,
    submissionId: signer.submissionId,
    signerId: signer.id,
    eventType: 'consent_given',
    eventData: { consentText: ESIGN_CONSENT_TEXT },
    ipAddress,
    userAgent,
  });

  await checkAndCompleteSubmission(signer.communityId, signer.submissionId);

  return { success: true };
}

export async function declineSigning(
  slug: string,
  reason?: string,
): Promise<{ success: boolean }> {
  const { signer } = await getSignerContext(slug);
  const scoped = createScopedClient(signer.communityId);

  await scoped.update(
    esignSigners,
    { status: 'declined' },
    eq(esignSigners.id, signer.id),
  );

  await scoped.update(
    esignSubmissions,
    { status: 'declined' },
    eq(esignSubmissions.id, signer.submissionId),
  );

  await scoped.insert(esignEvents, {
    communityId: signer.communityId,
    submissionId: signer.submissionId,
    signerId: signer.id,
    eventType: 'declined',
    eventData: { reason: reason ?? null },
  });

  return { success: true };
}

// ---------------------------------------------------------------------------
// Completion logic (internal)
// ---------------------------------------------------------------------------

async function checkAndCompleteSubmission(
  communityId: number,
  submissionId: number,
): Promise<void> {
  const scoped = createScopedClient(communityId);

  const signerRows = await scoped.selectFrom(
    esignSigners,
    {},
    eq(esignSigners.submissionId, submissionId),
  );

  if (signerRows.length === 0) return;

  const allCompleted = signerRows.every(
    (s) => (s as Record<string, unknown>).status === 'completed',
  );
  if (!allCompleted) return;

  // Atomic guard: only one concurrent caller can claim the finalization slot
  const guardRows = await scoped.update(
    esignSubmissions,
    { status: 'completing' },
    and(eq(esignSubmissions.id, submissionId), eq(esignSubmissions.status, 'pending')),
  );

  const sub = guardRows[0] as Record<string, unknown> | undefined;
  if (!sub) return; // Another concurrent call already claimed finalization

  const tplRows = await scoped.selectFrom(
    esignTemplates,
    {},
    eq(esignTemplates.id, sub.templateId as number),
  );

  const tpl = tplRows[0] as Record<string, unknown> | undefined;
  if (!tpl) return;

  try {
    const fieldsSchema = tpl.fieldsSchema as EsignFieldsSchema;
    const signers = signerRows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        role: row.role as string,
        signed_values: row.signedValues as Record<string, { fieldId: string; type: string; value: string; signedAt: string }> | null,
      };
    });

    const pdfBytes = await flattenSignedPdf(
      tpl.sourceDocumentPath as string,
      signers,
      fieldsSchema,
    );

    const hash = computeDocumentHash(pdfBytes);
    const safeName = (tpl.name as string).replace(/[^a-zA-Z0-9-_]/g, '_');
    const storagePath = await uploadSignedDocument(communityId, submissionId, pdfBytes, `${safeName}_signed.pdf`);

    await scoped.update(
      esignSubmissions,
      {
        status: 'completed',
        completedAt: new Date(),
        documentHash: hash,
        signedDocumentPath: storagePath,
      },
      eq(esignSubmissions.id, submissionId),
    );

    await scoped.insert(esignEvents, {
      communityId,
      submissionId,
      eventType: 'submission_completed',
      eventData: { documentHash: hash, signerCount: signerRows.length },
    });
  } catch (error) {
    console.error('[esign-service] failed to finalize submission', {
      submissionId,
      error: error instanceof Error ? error.message : String(error),
    });

    // Revert to pending so the finalization can be retried — do NOT mark completed
    // without a signed document, as that would break the audit trail
    await scoped.update(
      esignSubmissions,
      { status: 'pending' },
      eq(esignSubmissions.id, submissionId),
    );
  }
}

// ---------------------------------------------------------------------------
// Consent management
// ---------------------------------------------------------------------------

export async function getConsentStatus(
  communityId: number,
  userId: string,
): Promise<{ hasActiveConsent: boolean; givenAt: Date | null }> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom(
    esignConsent,
    {},
    and(eq(esignConsent.userId, userId), isNull(esignConsent.revokedAt)),
  );

  if (rows.length === 0) {
    return { hasActiveConsent: false, givenAt: null };
  }

  const row = rows[0] as Record<string, unknown>;
  return {
    hasActiveConsent: true,
    givenAt: row.givenAt as Date | null,
  };
}

export async function revokeConsent(
  communityId: number,
  userId: string,
  requestId?: string | null,
): Promise<void> {
  const scoped = createScopedClient(communityId);

  await scoped.update(
    esignConsent,
    { revokedAt: new Date() },
    and(eq(esignConsent.userId, userId), isNull(esignConsent.revokedAt)),
  );

  await logAuditEvent({
    userId,
    action: 'esign_consent_revoked',
    resourceType: 'esign_consent',
    resourceId: userId,
    communityId,
    metadata: { requestId: requestId ?? null },
  });
}
