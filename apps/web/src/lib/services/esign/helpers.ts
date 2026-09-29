/**
 * E-sign service — Helpers shared by the other e-sign modules (module-private to the esign/ directory).
 *
 * Moved verbatim from `esign-service.ts` (SVC-08), which remains the public
 * entry point and re-exports this module's public names. Import from
 * `@/lib/services/esign-service`, not from here.
 */
import crypto from 'node:crypto';
import { type EsignSigner } from '@propertypro/email';
import { findBlockingPriorSigner } from '@/lib/esign/submission-status';
// AUTHZ: reads sender name and community name/timezone for invitation and reminder emails; ids come from the gated caller
import { createAdminTypedClient } from '@propertypro/db/supabase/admin';
import { type EsignFieldDefinition, type EsignFieldsSchema, type EsignSubmissionStatus } from '@propertypro/shared';
import { BadRequestError } from '@/lib/api/errors';
import {
  type EsignSignerRecord,
  type EsignSubmissionRecord,
  type EsignTemplateRecord,
  type SubmitSignatureInput,
} from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = Record<string, any>;

export function generateExternalId(): string {
  return crypto.randomUUID();
}

export function generateSigningSlug(): string {
  return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
}

export function validateFieldsSchema(schema: EsignFieldsSchema): void {
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

export function requireRenderableSourceDocument(
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

export function withEffectiveStatus<T extends EsignSubmissionRecord>(
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

export function buildSigningUrl(
  submissionExternalId: string,
  slug: string,
): string {
  return `${getAppBaseUrl()}/sign/${submissionExternalId}/${slug}`;
}

/**
 * The signing order as the invitation / reminder email shows it.
 *
 * Every other signer on the submission is listed by NAME and role only — never
 * by email address, which would disclose one signer's contact details to the
 * rest. A signer with no name is shown by their role, as the in-app signer list
 * does. `recipientId` marks the reader's own row, which reads "Awaiting you"
 * only when it is actually their turn — the same `findBlockingPriorSigner` rule
 * the signing page, the Awaiting-you panel and `sendReminder` all apply. In a
 * sequential request every signer is emailed at creation, so a later signer's
 * own row must read Pending until the ones ahead of them have signed.
 */
export function toEmailSigningOrder(
  signers: ReadonlyArray<Pick<EsignSignerRecord, 'id' | 'name' | 'email' | 'role' | 'sortOrder' | 'status' | 'completedAt'>>,
  recipientId: number,
  signingOrder: string,
  timeZone?: string | null,
): EsignSigner[] {
  const recipient = signers.find((candidate) => candidate.id === recipientId);
  const recipientsTurn =
    recipient !== undefined && findBlockingPriorSigner(signingOrder, signers, recipient) === null;

  const humanRole = (role: string) => {
    const words = role.replace(/_/g, ' ').trim();
    return words ? words[0]!.toUpperCase() + words.slice(1) : undefined;
  };

  return [...signers]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
    .map((candidate) => {
      const role = humanRole(candidate.role);
      const isRecipient = candidate.id === recipientId;
      const name = candidate.name?.trim() || (isRecipient ? candidate.email : role) || 'Signer';
      if (candidate.status === 'completed') {
        return {
          name,
          role,
          status: 'signed' as const,
          signedAt: candidate.completedAt
            ? new Intl.DateTimeFormat('en-US', {
                month: 'short',
                day: 'numeric',
                ...(timeZone ? { timeZone } : {}),
              }).format(new Date(candidate.completedAt))
            : undefined,
        };
      }
      return {
        name,
        role,
        status: isRecipient && recipientsTurn ? ('awaiting_you' as const) : ('pending' as const),
      };
    });
}

export function formatReminderExpiresAt(
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

export function validateSignedValuesForSigner(
  signer: Pick<EsignSignerRecord, 'role'>,
  /**
   * The layout the request was SENT with, resolved by `getSignerContext`.
   * Validating against the template as it stands now would reject a signer
   * whose fields were edited away after they were sent the link.
   */
  fieldsSchema: EsignFieldsSchema | null,
  signedValues: SubmitSignatureInput['signedValues'],
): void {
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
    fieldsSchema: row.fields_schema ?? null,
    sourceDocumentPath: row.source_document_path ?? null,
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

export function getAdmin() {
  return createAdminTypedClient();
}
