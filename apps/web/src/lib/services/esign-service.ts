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
import { EsignReminderEmail, sendEmail } from '@propertypro/email';
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
  type EsignFieldDefinition,
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
  effectiveStatus?: EsignSubmissionStatus;
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
  lastReminderAt: Date | null;
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

export interface SubmitSignatureResult {
  success: boolean;
  signerStatus: 'completed';
  submissionStatus: EsignSubmissionStatus;
  message?: string;
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

function hasRenderableSourceDocument(
  template: Pick<EsignTemplateRecord, 'sourceDocumentPath'>,
): boolean {
  return (
    typeof template.sourceDocumentPath === 'string' &&
    template.sourceDocumentPath.trim().length > 0
  );
}

function requireRenderableSourceDocument(
  template: Pick<EsignTemplateRecord, 'sourceDocumentPath'>,
): void {
  if (!hasRenderableSourceDocument(template)) {
    throw new BadRequestError(
      'Template must have a source PDF before it can be sent for signing',
    );
  }
}

function getEffectiveSubmissionStatus(
  submission: Pick<EsignSubmissionRecord, 'status' | 'expiresAt'>,
): EsignSubmissionStatus {
  if (
    submission.status === 'pending' &&
    submission.expiresAt &&
    new Date(submission.expiresAt).getTime() < Date.now()
  ) {
    return 'expired';
  }

  return submission.status as EsignSubmissionStatus;
}

function withEffectiveStatus<T extends EsignSubmissionRecord>(
  submission: T,
): T & { effectiveStatus: EsignSubmissionStatus } {
  return {
    ...submission,
    effectiveStatus: getEffectiveSubmissionStatus(submission),
  };
}

function getAppBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, '');
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, '')}`;
  }

  return 'http://localhost:3000';
}

function buildSigningUrl(
  submissionExternalId: string,
  slug: string,
): string {
  return `${getAppBaseUrl()}/sign/${submissionExternalId}/${slug}`;
}

function formatReminderExpiresAt(
  expiresAt: Date | null,
  timeZone?: string | null,
): string | undefined {
  if (!expiresAt) {
    return undefined;
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'long',
    timeStyle: 'short',
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(expiresAt));
}

function fieldValueIsPresent(
  field: Pick<EsignFieldDefinition, 'type'>,
  value: string,
): boolean {
  if (field.type === 'checkbox') {
    return value === 'true' || value === 'checked';
  }

  return value.trim().length > 0;
}

function validateSignedValuesForSigner(
  signer: Pick<EsignSignerRecord, 'role'>,
  template: Pick<EsignTemplateRecord, 'fieldsSchema'>,
  signedValues: SubmitSignatureInput['signedValues'],
): void {
  const fieldsSchema = template.fieldsSchema;

  if (!fieldsSchema) {
    throw new BadRequestError('Template has no field definitions');
  }

  const signerFields = fieldsSchema.fields.filter(
    (field) => field.signerRole === signer.role,
  );

  if (signerFields.length === 0) {
    throw new BadRequestError('No fields are assigned to this signer');
  }

  const signedEntries = Object.values(signedValues);
  if (signedEntries.length === 0) {
    throw new BadRequestError('At least one signed field value is required');
  }

  const signerFieldsById = new Map(signerFields.map((field) => [field.id, field]));
  const seenFieldIds = new Set<string>();

  for (const entry of signedEntries) {
    const field = signerFieldsById.get(entry.fieldId);

    if (!field) {
      throw new BadRequestError(
        `Field "${entry.fieldId}" is not available for signer role "${signer.role}"`,
      );
    }

    if (seenFieldIds.has(entry.fieldId)) {
      throw new BadRequestError(`Field "${entry.fieldId}" was submitted more than once`);
    }

    if (entry.type !== field.type) {
      throw new BadRequestError(
        `Field "${entry.fieldId}" must use type "${field.type}"`,
      );
    }

    if (!fieldValueIsPresent(field, entry.value)) {
      throw new BadRequestError(`Field "${entry.fieldId}" requires a value`);
    }

    seenFieldIds.add(entry.fieldId);
  }

  for (const field of signerFields) {
    if (field.required && !seenFieldIds.has(field.id)) {
      throw new BadRequestError(`Field "${field.id}" is required`);
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
    lastReminderAt: row.last_reminder_at ?? null,
    reminderCount: row.reminder_count ?? 0,
    createdAt: row.created_at,
  };
}

function mapSubmissionRow(row: AnyRow): EsignSubmissionRecord {
  return withEffectiveStatus({
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
  });
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
  requireRenderableSourceDocument(template);

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

  const signerValues = input.signers.map((signerInput) => ({
    communityId,
    submissionId: submission.id,
    externalId: generateExternalId(),
    userId: signerInput.userId ?? null,
    email: signerInput.email,
    name: signerInput.name,
    role: signerInput.role,
    slug: generateSigningSlug(),
    sortOrder: signerInput.sortOrder,
    status: 'pending' as const,
    prefilledFields: signerInput.prefilledFields ?? null,
  }));

  const signerRecords = (await scoped.insert(esignSigners, signerValues)) as EsignSignerRecord[];

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
  const rows = (await scoped.selectFrom(esignSubmissions, {})) as EsignSubmissionRecord[];
  const submissions = rows.map((row) => withEffectiveStatus(row));

  if (!filters?.status) {
    return submissions;
  }

  return submissions.filter((row) => row.effectiveStatus === filters.status);
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
  const submission = withEffectiveStatus(subRows[0] as EsignSubmissionRecord);

  const signerRows = (await scoped.selectFrom(
    esignSigners,
    {},
    eq(esignSigners.submissionId, submissionId),
  )) as EsignSignerRecord[];

  const eventRows = await scoped.selectFrom(
    esignEvents,
    {},
    eq(esignEvents.submissionId, submissionId),
  );

  return {
    submission,
    signers: signerRows.map((signer) => ({
      ...signer,
      lastReminderAt: signer.lastReminderAt ?? null,
      reminderCount: signer.reminderCount ?? 0,
    })),
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

  if (submission.effectiveStatus !== 'pending') {
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
  const { submission, signers } = await getSubmission(communityId, submissionId);
  const template = await getTemplate(communityId, submission.templateId);

  if (signer.status !== 'pending' && signer.status !== 'opened') {
    throw new UnprocessableEntityError('Can only send reminders to pending or opened signers');
  }
  if (signer.reminderCount >= ESIGN_MAX_REMINDERS) {
    throw new UnprocessableEntityError(
      `Maximum of ${ESIGN_MAX_REMINDERS} reminders reached for this signer`,
    );
  }

  if (submission.effectiveStatus !== 'pending') {
    throw new UnprocessableEntityError('Can only send reminders for pending submissions');
  }
  if (!signer.slug) {
    throw new UnprocessableEntityError('Signer does not have a public signing link');
  }

  if (submission.signingOrder === 'sequential') {
    const blockedByPriorSigner = signers.some(
      (candidate) =>
        candidate.id !== signer.id &&
        candidate.sortOrder < signer.sortOrder &&
        candidate.status !== 'completed',
    );

    if (blockedByPriorSigner) {
      throw new UnprocessableEntityError(
        'Can only send reminders to signers whose turn is currently active',
      );
    }
  }

  const admin = getAdmin();
  const { data: communityRows } = await admin
    .from('communities')
    .select('name, timezone')
    .eq('id', communityId)
    .limit(1);

  const community = (communityRows?.[0] ?? null) as
    | { name?: string | null; timezone?: string | null }
    | null;
  const documentName = submission.messageSubject ?? template.name;
  const signingUrl = buildSigningUrl(submission.externalId, signer.slug);
  const reminderNumber = signer.reminderCount + 1;

  await sendEmail({
    to: signer.email,
    subject: `Reminder: Signature needed for ${documentName}`,
    category: 'transactional',
    react: EsignReminderEmail({
      branding: {
        communityName: community?.name ?? 'PropertyPro',
      },
      signerName: signer.name ?? signer.email,
      documentName,
      signingUrl,
      reminderNumber,
      expiresAt: formatReminderExpiresAt(
        submission.expiresAt,
        community?.timezone ?? undefined,
      ),
    }),
  });

  await scoped.update(
    esignSigners,
    {
      reminderCount: reminderNumber,
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
    eventData: { reminderNumber },
  });

  await logAuditEvent({
    userId,
    action: 'esign_reminder_sent',
    resourceType: 'esign_signer',
    resourceId: String(signerId),
    communityId,
    metadata: { reminderNumber, requestId: requestId ?? null },
  });
}

// ---------------------------------------------------------------------------
// Signing flow (token-authenticated — admin client for unscoped SELECTs, scoped client for mutations)
// ---------------------------------------------------------------------------

export async function getSignerContext(
  slug: string,
  expectedSubmissionExternalId?: string,
): Promise<{
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

  if (
    expectedSubmissionExternalId &&
    submission.externalId !== expectedSubmissionExternalId
  ) {
    throw new NotFoundError('Invalid or expired signing link');
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
  const isActiveSubmission = submission.effectiveStatus === 'pending';
  const isTerminalSignerState =
    signer.status === 'completed' || signer.status === 'declined';

  if (!isWaiting && isActiveSubmission && !isTerminalSignerState && signer.status === 'pending') {
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

function assertSignerContextCanAct(
  context: Awaited<ReturnType<typeof getSignerContext>>,
): void {
  const { signer, submission, isWaiting } = context;

  if (signer.status === 'completed') {
    throw new UnprocessableEntityError('You have already signed this document');
  }
  if (signer.status === 'declined') {
    throw new UnprocessableEntityError('You have declined to sign this document');
  }
  if (submission.effectiveStatus === 'cancelled') {
    throw new UnprocessableEntityError('This signing request has been cancelled');
  }
  if (submission.effectiveStatus === 'expired') {
    throw new UnprocessableEntityError('This signing request has expired');
  }
  if (isWaiting) {
    throw new UnprocessableEntityError(
      'This signing request is waiting for a previous signer to complete first',
    );
  }
}

export async function submitSignature(
  slug: string,
  input: SubmitSignatureInput,
  ipAddress: string,
  userAgent: string,
  expectedSubmissionExternalId?: string,
): Promise<SubmitSignatureResult> {
  const context = await getSignerContext(
    slug,
    expectedSubmissionExternalId,
  );
  assertSignerContextCanAct(context);
  const { signer, template } = context;

  validateSignedValuesForSigner(signer, template, input.signedValues);

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

  const completionResult = await checkAndCompleteSubmission(
    signer.communityId,
    signer.submissionId,
  );

  if (completionResult.status === 'processing_failed') {
    return {
      success: false,
      signerStatus: 'completed',
      submissionStatus: completionResult.status,
      message:
        completionResult.message ??
        'Your signature was captured, but the signed document could not be finalized.',
    };
  }

  if (completionResult.status === 'processing') {
    return {
      success: true,
      signerStatus: 'completed',
      submissionStatus: completionResult.status,
      message:
        'Your signature was captured and the signed document is still being finalized.',
    };
  }

  return {
    success: true,
    signerStatus: 'completed',
    submissionStatus: completionResult.status,
  };
}

export async function declineSigning(
  slug: string,
  reason?: string,
  expectedSubmissionExternalId?: string,
): Promise<{ success: boolean }> {
  const context = await getSignerContext(slug, expectedSubmissionExternalId);
  assertSignerContextCanAct(context);
  const { signer } = context;
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

interface SubmissionCompletionResult {
  status: Extract<
    EsignSubmissionStatus,
    'pending' | 'processing' | 'completed' | 'processing_failed'
  >;
  message?: string;
}

async function checkAndCompleteSubmission(
  communityId: number,
  submissionId: number,
): Promise<SubmissionCompletionResult> {
  const scoped = createScopedClient(communityId);

  const signerRows = await scoped.selectFrom(
    esignSigners,
    {},
    eq(esignSigners.submissionId, submissionId),
  );

  if (signerRows.length === 0) {
    return { status: 'pending' };
  }

  const allCompleted = signerRows.every(
    (s) => (s as Record<string, unknown>).status === 'completed',
  );
  if (!allCompleted) {
    return { status: 'pending' };
  }

  // Atomic guard: only one concurrent caller can claim the finalization slot
  const guardRows = await scoped.update(
    esignSubmissions,
    { status: 'processing', updatedAt: new Date() },
    and(eq(esignSubmissions.id, submissionId), eq(esignSubmissions.status, 'pending')),
  );

  const sub = guardRows[0] as Record<string, unknown> | undefined;
  if (!sub) {
    const currentRows = await scoped.selectFrom(
      esignSubmissions,
      {},
      eq(esignSubmissions.id, submissionId),
    );
    const currentStatus = (currentRows[0] as Record<string, unknown> | undefined)
      ?.status;

    if (
      currentStatus === 'processing' ||
      currentStatus === 'completed' ||
      currentStatus === 'processing_failed'
    ) {
      return {
        status: currentStatus,
      } as SubmissionCompletionResult;
    }

    return { status: 'pending' };
  }

  const tplRows = await scoped.selectFrom(
    esignTemplates,
    {},
    eq(esignTemplates.id, sub.templateId as number),
  );

  const tpl = tplRows[0] as EsignTemplateRecord | undefined;
  if (!tpl || !tpl.fieldsSchema || !hasRenderableSourceDocument(tpl)) {
    const message =
      'The signed document could not be finalized because the source PDF is unavailable.';

    await scoped.update(
      esignSubmissions,
      { status: 'processing_failed', updatedAt: new Date() },
      eq(esignSubmissions.id, submissionId),
    );

    await scoped.insert(esignEvents, {
      communityId,
      submissionId,
      eventType: 'submission_processing_failed',
      eventData: { message },
    });

    return { status: 'processing_failed', message };
  }

  try {
    const signers = signerRows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        role: row.role as string,
        signed_values: row.signedValues as Record<string, { fieldId: string; type: string; value: string; signedAt: string }> | null,
      };
    });

    const pdfBytes = await flattenSignedPdf(
      tpl.sourceDocumentPath!,
      signers,
      tpl.fieldsSchema,
    );

    const hash = computeDocumentHash(pdfBytes);
    const safeName = tpl.name.replace(/[^a-zA-Z0-9-_]/g, '_');
    const storagePath = await uploadSignedDocument(communityId, submissionId, pdfBytes, `${safeName}_signed.pdf`);

    await scoped.update(
      esignSubmissions,
      {
        status: 'completed',
        completedAt: new Date(),
        documentHash: hash,
        signedDocumentPath: storagePath,
        updatedAt: new Date(),
      },
      eq(esignSubmissions.id, submissionId),
    );

    await scoped.insert(esignEvents, {
      communityId,
      submissionId,
      eventType: 'submission_completed',
      eventData: { documentHash: hash, signerCount: signerRows.length },
    });

    return { status: 'completed' };
  } catch (error) {
    console.error('[esign-service] failed to finalize submission', {
      submissionId,
      error: error instanceof Error ? error.message : String(error),
    });

    const message =
      'The signature was captured, but we could not finalize the signed document.';

    await scoped.update(
      esignSubmissions,
      { status: 'processing_failed', updatedAt: new Date() },
      eq(esignSubmissions.id, submissionId),
    );

    await scoped.insert(esignEvents, {
      communityId,
      submissionId,
      eventType: 'submission_processing_failed',
      eventData: {
        message,
        error: error instanceof Error ? error.message : String(error),
      },
    });

    return { status: 'processing_failed', message };
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
