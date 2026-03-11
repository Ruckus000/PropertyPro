/**
 * E-signature business logic orchestrator.
 *
 * Coordinates between DocuSeal API, local database, and audit logging.
 * All functions require a communityId for tenant scoping.
 */
import { createScopedClient, logAuditEvent } from '@propertypro/db';
import type { AuditAction } from '@propertypro/db';
import {
  esignTemplates,
  esignSubmissions,
  esignSigners,
  esignEvents,
  esignConsent,
} from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import {
  buildTemplateExternalId,
  buildSubmissionExternalId,
  buildSignerExternalId,
  buildDocuSealFolderName,
  ESIGN_CONSENT_TEXT,
} from '@propertypro/shared';
import * as docuseal from './docuseal-client';
import { generateBuilderToken } from './docuseal-jwt';

// ---------------------------------------------------------------------------
// Inferred row types for scoped client results
// ---------------------------------------------------------------------------

type TemplateRow = typeof esignTemplates.$inferSelect;
type SubmissionRow = typeof esignSubmissions.$inferSelect;
type SignerRow = typeof esignSigners.$inferSelect;
type EventRow = typeof esignEvents.$inferSelect;
type ConsentRow = typeof esignConsent.$inferSelect;

/** Helper to audit-log esign actions (avoids repeating `as AuditAction` casts). */
function esignAudit(params: Omit<Parameters<typeof logAuditEvent>[0], 'action'> & { action: string }) {
  return logAuditEvent({ ...params, action: params.action as AuditAction });
}

// ---------------------------------------------------------------------------
// Template operations
// ---------------------------------------------------------------------------

export interface CreateTemplateInput {
  communityId: number;
  userId: string;
  name: string;
  description?: string;
  templateType?: string;
  sourceDocumentPath?: string;
  documentUrl?: string;
  html?: string;
}

export async function createTemplate(input: CreateTemplateInput) {
  const scoped = createScopedClient(input.communityId);
  const uuid = crypto.randomUUID();
  const externalId = buildTemplateExternalId(input.communityId, uuid);
  const folderName = buildDocuSealFolderName(input.communityId);

  let dsTemplate: docuseal.DocuSealTemplate;

  if (input.html) {
    dsTemplate = await docuseal.createTemplateFromHtml({
      name: input.name,
      external_id: externalId,
      folder_name: folderName,
      html: input.html,
    });
  } else if (input.documentUrl) {
    dsTemplate = await docuseal.createTemplateFromPdf({
      name: input.name,
      external_id: externalId,
      folder_name: folderName,
      documents: [{ name: input.name, file_url: input.documentUrl }],
    });
  } else {
    throw new Error('Either html or documentUrl must be provided');
  }

  const [template] = (await scoped.insert(esignTemplates, {
    docusealTemplateId: dsTemplate.id,
    externalId,
    name: input.name,
    description: input.description ?? null,
    sourceDocumentPath: input.sourceDocumentPath ?? null,
    templateType: input.templateType ?? null,
    fieldsSchema: dsTemplate.fields,
    status: 'active',
    createdBy: input.userId,
  })) as TemplateRow[];
  if (!template) throw new Error('Failed to insert template');

  await esignAudit({
    userId: input.userId,
    action: 'esign_template_created',
    resourceType: 'esign_template',
    resourceId: String(template.id),
    communityId: input.communityId,
    metadata: { docusealTemplateId: dsTemplate.id, name: input.name },
  });

  return template;
}

export async function listTemplates(communityId: number, status?: string) {
  const scoped = createScopedClient(communityId);
  const rows = (await scoped.query(esignTemplates)) as TemplateRow[];
  if (status) {
    return rows.filter((r) => r.status === status);
  }
  return rows;
}

export async function getTemplate(communityId: number, templateId: number) {
  const scoped = createScopedClient(communityId);
  const rows = (await scoped.query(esignTemplates)) as TemplateRow[];
  return rows.find((r) => r.id === templateId) ?? null;
}

export async function archiveTemplate(
  communityId: number,
  templateId: number,
  userId: string,
) {
  const scoped = createScopedClient(communityId);
  const template = await getTemplate(communityId, templateId);
  if (!template) return null;

  await docuseal.archiveTemplate(template.docusealTemplateId);
  const [updated] = (await scoped.update(
    esignTemplates,
    { status: 'archived' },
    eq(esignTemplates.id, templateId),
  )) as TemplateRow[];

  await esignAudit({
    userId,
    action: 'esign_template_archived',
    resourceType: 'esign_template',
    resourceId: String(templateId),
    communityId,
  });

  return updated;
}

export async function cloneTemplate(
  communityId: number,
  templateId: number,
  userId: string,
  newName: string,
) {
  const template = await getTemplate(communityId, templateId);
  if (!template) return null;

  const uuid = crypto.randomUUID();
  const externalId = buildTemplateExternalId(communityId, uuid);
  const folderName = buildDocuSealFolderName(communityId);

  const dsClone = await docuseal.cloneTemplate(
    template.docusealTemplateId,
    newName,
    externalId,
    folderName,
  );

  const scoped = createScopedClient(communityId);
  const [clone] = (await scoped.insert(esignTemplates, {
    docusealTemplateId: dsClone.id,
    externalId,
    name: newName,
    description: template.description,
    sourceDocumentPath: template.sourceDocumentPath,
    templateType: template.templateType,
    fieldsSchema: dsClone.fields,
    status: 'active',
    createdBy: userId,
  })) as TemplateRow[];
  if (!clone) throw new Error('Failed to insert cloned template');

  await esignAudit({
    userId,
    action: 'esign_template_cloned',
    resourceType: 'esign_template',
    resourceId: String(clone.id),
    communityId,
    metadata: { sourceTemplateId: templateId },
  });

  return clone;
}

// ---------------------------------------------------------------------------
// Builder JWT
// ---------------------------------------------------------------------------

export function getBuilderToken(
  communityId: number,
  userEmail: string,
  templateName?: string,
) {
  const uuid = crypto.randomUUID();
  return generateBuilderToken(userEmail, {
    externalId: buildTemplateExternalId(communityId, uuid),
    folderName: buildDocuSealFolderName(communityId),
    templateName,
  });
}

// ---------------------------------------------------------------------------
// Submission operations
// ---------------------------------------------------------------------------

export interface CreateSubmissionInput {
  communityId: number;
  userId: string;
  templateId: number;
  signers: Array<{
    email: string;
    name?: string;
    role: string;
    userId?: string;
    fields?: Array<{ name: string; default_value: string; readonly?: boolean }>;
  }>;
  sendEmail?: boolean;
  expiresAt?: string;
  message?: { subject: string; body: string };
}

export async function createSubmission(input: CreateSubmissionInput) {
  const template = await getTemplate(input.communityId, input.templateId);
  if (!template) {
    throw new Error('Template not found');
  }

  const scoped = createScopedClient(input.communityId);
  const submissionUuid = crypto.randomUUID();
  const submissionExternalId = buildSubmissionExternalId(
    input.communityId,
    submissionUuid,
  );

  // Prepare DocuSeal submitters with external IDs
  const signerUuids = input.signers.map(() => crypto.randomUUID());
  const dsSubmitters = input.signers.map((s, i) => ({
    email: s.email,
    name: s.name,
    role: s.role,
    external_id: buildSignerExternalId(input.communityId, signerUuids[i]!),
    fields: s.fields,
    send_email: input.sendEmail ?? false,
  }));

  const dsResult = await docuseal.createSubmission({
    template_id: template.docusealTemplateId,
    send_email: input.sendEmail ?? false,
    submitters: dsSubmitters,
    external_id: submissionExternalId,
    expire_at: input.expiresAt,
    message: input.message,
  });

  // Store submission locally
  const [submission] = (await scoped.insert(esignSubmissions, {
    templateId: input.templateId,
    docusealSubmissionId: dsResult[0]?.submission_id ?? null,
    externalId: submissionExternalId,
    status: 'pending',
    sendEmail: input.sendEmail ?? false,
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    messageSubject: input.message?.subject ?? null,
    messageBody: input.message?.body ?? null,
    createdBy: input.userId,
  })) as SubmissionRow[];
  if (!submission) throw new Error('Failed to insert submission');

  // Store signers locally
  const signerRecords: SignerRow[] = [];
  for (let i = 0; i < input.signers.length; i++) {
    const ds = dsResult[i];
    const inputSigner = input.signers[i]!;
    const [signer] = (await scoped.insert(esignSigners, {
      submissionId: submission.id,
      docusealSubmitterId: ds?.id ?? null,
      externalId: buildSignerExternalId(input.communityId, signerUuids[i]!),
      userId: inputSigner.userId ?? null,
      email: inputSigner.email,
      name: inputSigner.name ?? null,
      role: inputSigner.role,
      slug: ds?.slug ?? null,
      status: 'pending',
      prefilledFields: inputSigner.fields ?? null,
    })) as SignerRow[];
    if (signer) signerRecords.push(signer);
  }

  // Log creation event
  await scoped.insert(esignEvents, {
    submissionId: submission.id,
    eventType: 'created',
    eventData: {
      templateId: input.templateId,
      signerCount: input.signers.length,
    },
  });

  await esignAudit({
    userId: input.userId,
    action: 'esign_submission_created',
    resourceType: 'esign_submission',
    resourceId: String(submission.id),
    communityId: input.communityId,
    metadata: {
      templateId: input.templateId,
      signerEmails: input.signers.map((s) => s.email),
    },
  });

  return { submission, signers: signerRecords };
}

export async function listSubmissions(
  communityId: number,
  opts?: {
    status?: string;
    userId?: string;
    role?: string;
  },
) {
  const scoped = createScopedClient(communityId);
  let submissions = (await scoped.query(esignSubmissions)) as SubmissionRow[];

  if (opts?.status) {
    submissions = submissions.filter((s) => s.status === opts.status);
  }

  // For non-elevated roles, filter to only submissions where user is a signer
  if (opts?.userId && (opts?.role === 'owner' || opts?.role === 'tenant')) {
    const signers = (await scoped.query(esignSigners)) as SignerRow[];
    const userSubmissionIds = new Set(
      signers
        .filter((s) => s.userId === opts.userId)
        .map((s) => s.submissionId),
    );
    submissions = submissions.filter((s) => userSubmissionIds.has(s.id));
  }

  return submissions;
}

export async function getSubmission(communityId: number, submissionId: number) {
  const scoped = createScopedClient(communityId);
  const rows = (await scoped.query(esignSubmissions)) as SubmissionRow[];
  return rows.find((r) => r.id === submissionId) ?? null;
}

export async function getSubmissionSigners(
  communityId: number,
  submissionId: number,
) {
  const scoped = createScopedClient(communityId);
  const rows = (await scoped.query(esignSigners)) as SignerRow[];
  return rows.filter((r) => r.submissionId === submissionId);
}

export async function getSignerSlug(
  communityId: number,
  submissionId: number,
  userId: string,
) {
  const signers = await getSubmissionSigners(communityId, submissionId);
  const signer = signers.find((s) => s.userId === userId);
  if (!signer) return null;
  return signer.slug;
}

export async function cancelSubmission(
  communityId: number,
  submissionId: number,
  userId: string,
) {
  const submission = await getSubmission(communityId, submissionId);
  if (!submission || submission.status !== 'pending') return null;

  const scoped = createScopedClient(communityId);
  const [updated] = (await scoped.update(
    esignSubmissions,
    { status: 'cancelled' },
    eq(esignSubmissions.id, submissionId),
  )) as SubmissionRow[];

  await scoped.insert(esignEvents, {
    submissionId,
    eventType: 'cancelled',
    eventData: { cancelledBy: userId },
  });

  await esignAudit({
    userId,
    action: 'esign_submission_cancelled',
    resourceType: 'esign_submission',
    resourceId: String(submissionId),
    communityId,
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Webhook idempotency
// ---------------------------------------------------------------------------

/**
 * Check if a webhook event has already been processed (idempotency fence).
 * Queries the esign_events table for an existing record with the given webhookEventId.
 */
export async function isWebhookEventProcessed(
  communityId: number,
  webhookEventId: string,
): Promise<boolean> {
  if (!webhookEventId) return false;
  const scoped = createScopedClient(communityId);
  const events = (await scoped.query(esignEvents)) as EventRow[];
  return events.some((e) => e.webhookEventId === webhookEventId);
}

// ---------------------------------------------------------------------------
// Webhook processing
// ---------------------------------------------------------------------------

export async function processFormCompleted(
  communityId: number,
  submitterId: number,
  values: Record<string, unknown>,
  webhookEventId?: string,
) {
  const scoped = createScopedClient(communityId);
  const signers = (await scoped.query(esignSigners)) as SignerRow[];
  const signer = signers.find(
    (s) => s.docusealSubmitterId === submitterId,
  );
  if (!signer) return null;

  await scoped.update(
    esignSigners,
    {
      status: 'completed',
      completedAt: new Date(),
      signedValues: values,
    },
    eq(esignSigners.id, signer.id),
  );

  await scoped.insert(esignEvents, {
    submissionId: signer.submissionId,
    signerId: signer.id,
    eventType: 'signer_completed',
    eventData: values,
    webhookEventId,
  });

  return signer;
}

export async function processSubmissionCompleted(
  communityId: number,
  docusealSubmissionId: number,
  webhookEventId?: string,
) {
  const scoped = createScopedClient(communityId);
  const submissions = (await scoped.query(esignSubmissions)) as SubmissionRow[];
  const submission = submissions.find(
    (s) => s.docusealSubmissionId === docusealSubmissionId,
  );
  if (!submission) return null;

  await scoped.update(
    esignSubmissions,
    {
      status: 'completed',
      completedAt: new Date(),
    },
    eq(esignSubmissions.id, submission.id),
  );

  await scoped.insert(esignEvents, {
    submissionId: submission.id,
    eventType: 'submission_completed',
    webhookEventId,
  });

  await esignAudit({
    userId: submission.createdBy,
    action: 'esign_submission_completed',
    resourceType: 'esign_submission',
    resourceId: String(submission.id),
    communityId,
  });

  return submission;
}

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

export async function getAuditTrail(
  communityId: number,
  submissionId: number,
) {
  const scoped = createScopedClient(communityId);
  const events = (await scoped.query(esignEvents)) as EventRow[];
  return events
    .filter((e) => e.submissionId === submissionId)
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
}

// ---------------------------------------------------------------------------
// Consent
// ---------------------------------------------------------------------------

export async function hasActiveConsent(
  communityId: number,
  userId: string,
): Promise<boolean> {
  const scoped = createScopedClient(communityId);
  const rows = (await scoped.query(esignConsent)) as ConsentRow[];
  return rows.some(
    (r) => r.userId === userId && r.consentGiven && !r.revokedAt,
  );
}

export async function grantConsent(
  communityId: number,
  userId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const scoped = createScopedClient(communityId);

  // Check for existing active consent
  const existing = (await scoped.query(esignConsent)) as ConsentRow[];
  const active = existing.find(
    (r) => r.userId === userId && r.consentGiven && !r.revokedAt,
  );
  if (active) return active; // Already has active consent

  const [consent] = (await scoped.insert(esignConsent, {
    userId,
    consentGiven: true,
    consentText: ESIGN_CONSENT_TEXT,
    ipAddress: ipAddress ?? null,
    userAgent: userAgent ?? null,
  })) as ConsentRow[];

  await scoped.insert(esignEvents, {
    submissionId: 0, // No submission yet — consent is user-level
    eventType: 'consent_given',
    eventData: { consentId: consent!.id },
    ipAddress: ipAddress ?? null,
    userAgent: userAgent ?? null,
  });

  return consent;
}

export async function revokeConsent(
  communityId: number,
  userId: string,
) {
  const scoped = createScopedClient(communityId);
  const existing = (await scoped.query(esignConsent)) as ConsentRow[];
  const active = existing.find(
    (r) => r.userId === userId && r.consentGiven && !r.revokedAt,
  );
  if (!active) return null;

  // Insert a new revoked record
  const [revoked] = (await scoped.insert(esignConsent, {
    userId,
    consentGiven: false,
    consentText: ESIGN_CONSENT_TEXT,
  })) as ConsentRow[];

  return revoked;
}

// ---------------------------------------------------------------------------
// Reminder
// ---------------------------------------------------------------------------

export async function sendReminder(
  communityId: number,
  submissionId: number,
  signerId: number,
  userId: string,
) {
  const scoped = createScopedClient(communityId);
  const signers = (await scoped.query(esignSigners)) as SignerRow[];
  const signer = signers.find((s) => s.id === signerId);
  if (!signer || signer.status !== 'pending') return null;

  if ((signer.reminderCount ?? 0) >= 3) {
    throw new Error('Maximum reminder count reached');
  }

  const newReminderCount = (signer.reminderCount ?? 0) + 1;

  await scoped.update(
    esignSigners,
    {
      lastReminderAt: new Date(),
      reminderCount: newReminderCount,
    },
    eq(esignSigners.id, signerId),
  );

  await scoped.insert(esignEvents, {
    submissionId,
    signerId,
    eventType: 'reminder_sent',
    eventData: { reminderCount: newReminderCount },
  });

  await esignAudit({
    userId,
    action: 'esign_reminder_sent',
    resourceType: 'esign_signer',
    resourceId: String(signerId),
    communityId,
  });

  return signer;
}
