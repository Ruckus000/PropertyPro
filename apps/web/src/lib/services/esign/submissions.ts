/**
 * E-sign service — Submission lifecycle (incl. getSubmission / cancelSubmission / sendReminder, which sat below the my-pending banner in the monolith).
 *
 * Moved verbatim from `esign-service.ts` (SVC-08), which remains the public
 * entry point and re-exports this module's public names. Import from
 * `@/lib/services/esign-service`, not from here.
 */
import { EsignInvitationEmail, EsignReminderEmail, sendEmail } from '@propertypro/email';
import {
  createScopedClient,
  esignEvents,
  esignSigners,
  esignSubmissions,
  esignTemplates,
  logAuditEvent,
} from '@propertypro/db';
import { and, eq, inArray } from '@propertypro/db/filters';
import { ESIGN_MAX_REMINDERS, type EsignFieldsSchema, type EsignSubmissionStatus } from '@propertypro/shared';
import { BadRequestError, NotFoundError, UnprocessableEntityError } from '@/lib/api/errors';
import {
  type CreateSubmissionInput,
  type EsignEventRecord,
  type EsignSignerRecord,
  type EsignSubmissionRecord,
  type EsignTemplateRecord,
} from './types';
import {
  buildSigningUrl,
  formatReminderExpiresAt,
  generateExternalId,
  generateSigningSlug,
  getAdmin,
  requireRenderableSourceDocument,
  toEmailSigningOrder,
  validateFieldsSchema,
  withEffectiveStatus,
} from './helpers';
import { getTemplate } from './templates';

// ---------------------------------------------------------------------------
// Submission lifecycle
// ---------------------------------------------------------------------------

export async function createSubmission(
  communityId: number,
  userId: string,
  input: CreateSubmissionInput,
  requestId?: string | null,
): Promise<{ submission: EsignSubmissionRecord; signers: EsignSignerRecord[] }> {
  // A request is sent either from a saved template or from a document that has
  // no template. Both end in the same row: the field layout and the PDF are
  // stored on the submission either way, so nothing downstream has to care
  // which one it came from.
  let template: EsignTemplateRecord | null = null;
  let fieldsSchema: EsignFieldsSchema;
  let sourceDocumentPath: string;
  let documentName: string;

  if (input.templateId !== undefined) {
    template = await getTemplate(communityId, input.templateId);
    if (!template.fieldsSchema) {
      throw new BadRequestError('Template has no field definitions');
    }
    requireRenderableSourceDocument(template);
    fieldsSchema = template.fieldsSchema;
    sourceDocumentPath = template.sourceDocumentPath as string;
    documentName = template.name;
  } else if (input.document) {
    // A saved template's layout is checked when the template is created. A
    // one-off layout is never saved, so this is its only check — and two of
    // the rules have no equivalent in the route contract: a field can sit
    // inside 0-100 on both axes and still run off the page once its width is
    // added, and a field can name a role the layout never declares, which no
    // signer can fill.
    validateFieldsSchema(input.document.fieldsSchema);
    fieldsSchema = input.document.fieldsSchema;
    sourceDocumentPath = input.document.sourceDocumentPath;
    documentName = input.document.name;
  } else {
    throw new BadRequestError('A signature request needs a template or a document');
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
    templateId: input.templateId ?? null,
    // Capture what this request is being sent with. The signing page reads the
    // snapshot, so a later template edit cannot change the document under the
    // people signing it — and a request with no template has nowhere else to
    // read its layout from.
    fieldsSchema,
    sourceDocumentPath,
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

  // --- Send invitation emails (fire-and-forget per signer) ---
  if (input.sendEmail && signerRecords.length > 0) {
    const admin = getAdmin();

    // Look up sender name (same pattern as sendReminder)
    const { data: senderRow } = await admin
      .from('users')
      .select('full_name, email')
      .eq('id', userId)
      .single();
    const senderName = senderRow?.full_name || senderRow?.email || 'PropertyPro';

    // Look up community name (same pattern as sendReminder)
    const { data: communityRows } = await admin
      .from('communities')
      .select('name')
      .eq('id', communityId)
      .limit(1);
    const communityName = (communityRows?.[0] as { name?: string } | undefined)?.name ?? 'PropertyPro';

    // A custom subject wins; otherwise the template's name or, for a request
    // with no template, the document's own file name.
    const emailSubjectName = submission.messageSubject ?? documentName;

    for (const signer of signerRecords) {
      try {
        const signingUrl = buildSigningUrl(submission.externalId!, signer.slug!);
        await sendEmail({
          to: signer.email,
          subject: `Signature requested: ${emailSubjectName}`,
          category: 'transactional',
          react: EsignInvitationEmail({
            branding: { communityName },
            signerName: signer.name || signer.email,
            senderName,
            documentName: emailSubjectName,
            signingUrl,
            expiresAt: input.expiresAt ?? undefined,
            messageBody: input.messageBody ?? undefined,
            signers: toEmailSigningOrder(signerRecords, signer.id, submission.signingOrder),
          }),
        });
      } catch (err) {
        console.error(`Failed to send invitation email to ${signer.email}:`, err);
        // Continue — email failure must not abort submission creation
      }
    }
  }

  await scoped.insert(esignEvents, {
    communityId,
    submissionId: submission.id,
    eventType: 'created',
    eventData: { templateName: documentName, signerCount: signerRecords.length },
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

  // 'expired' and 'pending' are computed from 'pending' rows in the DB.
  if (filters?.status === 'expired' || filters?.status === 'pending') {
    const rows = (await scoped.selectFrom(
      esignSubmissions,
      {},
      eq(esignSubmissions.status, 'pending'),
    )) as EsignSubmissionRecord[];
    return rows
      .map((row) => withEffectiveStatus(row))
      .filter((row) => row.effectiveStatus === filters.status);
  }

  // Stored statuses — push directly to SQL
  if (filters?.status) {
    const rows = (await scoped.selectFrom(
      esignSubmissions,
      {},
      eq(esignSubmissions.status, filters.status),
    )) as EsignSubmissionRecord[];
    return rows.map((row) => withEffectiveStatus(row));
  }

  // No filter — fetch all, compute effectiveStatus
  const rows = (await scoped.selectFrom(esignSubmissions, {})) as EsignSubmissionRecord[];
  return rows.map((row) => withEffectiveStatus(row));
}

/**
 * A signer as the E-Sign screen sees one.
 *
 * Deliberately NOT the raw row. `esign_signers.signed_values` holds what each
 * person entered, and for a signature field that is a base64 PNG of their
 * actual handwriting (see `esign-pdf-service.ts`, which decodes it to embed in
 * the PDF). The screen renders none of it, so it does not travel.
 */
export interface EsignListSigner {
  id: number;
  userId: string | null;
  name: string | null;
  email: string;
  role: string;
  status: string;
  sortOrder: number;
  slug: string | null;
  completedAt: Date | null;
  lastReminderAt: Date | null;
  reminderCount: number;
}

export interface EsignSubmissionListRow extends EsignSubmissionRecord {
  /** Null for a one-off send, which has no template to name. */
  templateName: string | null;
  signers: EsignListSigner[];
}

function toListSigner(row: EsignSignerRecord): EsignListSigner {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    sortOrder: row.sortOrder,
    slug: row.slug ?? null,
    completedAt: row.completedAt ?? null,
    lastReminderAt: row.lastReminderAt ?? null,
    reminderCount: row.reminderCount ?? 0,
  };
}

/**
 * The submissions list with every signer attached, plus the template's name.
 *
 * The E-Sign screen needs all of it before a row is expanded: the progress
 * column, the status counts, the Waiting-on view and its tab badge, and a text
 * filter that matches on a signer's name or email. Fetching signers per row on
 * expand would answer none of those.
 *
 * Two queries regardless of how many submissions come back — one for the
 * signers, one for the template names. Never one per row.
 */
export async function listSubmissionsWithSigners(
  communityId: number,
  filters?: { status?: EsignSubmissionStatus },
): Promise<EsignSubmissionListRow[]> {
  const submissions = await listSubmissions(communityId, filters);
  if (submissions.length === 0) {
    // drizzle rejects `inArray(col, [])`, and there is nothing to look up.
    return [];
  }

  const scoped = createScopedClient(communityId);

  const signerRows = (await scoped.selectFrom(
    esignSigners,
    {},
    inArray(
      esignSigners.submissionId,
      submissions.map((s) => s.id),
    ),
  )) as EsignSignerRecord[];

  const signersBySubmission = new Map<number, EsignListSigner[]>();
  for (const row of signerRows) {
    const list = signersBySubmission.get(row.submissionId) ?? [];
    list.push(toListSigner(row));
    signersBySubmission.set(row.submissionId, list);
  }
  for (const list of signersBySubmission.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  }

  const templateIds = [
    ...new Set(
      submissions
        .map((s) => s.templateId)
        .filter((id): id is number => typeof id === 'number'),
    ),
  ];

  const namesByTemplate = new Map<number, string>();
  if (templateIds.length > 0) {
    const templateRows = (await scoped.selectFrom(
      esignTemplates,
      {},
      inArray(esignTemplates.id, templateIds),
    )) as EsignTemplateRecord[];
    for (const row of templateRows) {
      namesByTemplate.set(row.id, row.name);
    }
  }

  return submissions.map((submission) => ({
    ...submission,
    templateName:
      submission.templateId == null
        ? null
        : namesByTemplate.get(submission.templateId) ?? null,
    signers: signersBySubmission.get(submission.id) ?? [],
  }));
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
  const template =
    submission.templateId != null
      ? await getTemplate(communityId, submission.templateId)
      : null;

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
  // A one-off send has no template, so its subject line is the document name.
  const documentName =
    submission.messageSubject ?? template?.name ?? 'Document for signature';
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
      signers: toEmailSigningOrder(signers, signer.id, submission.signingOrder, community?.timezone),
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
