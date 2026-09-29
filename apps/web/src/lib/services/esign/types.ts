/**
 * E-sign service — Record and input interfaces.
 *
 * Moved verbatim from `esign-service.ts` (SVC-08), which remains the public
 * entry point and re-exports this module's public names. Import from
 * `@/lib/services/esign-service`, not from here.
 */
import {
  type EsignFieldsSchema,
  type EsignFieldType,
  type EsignSigningOrder,
  type EsignSubmissionStatus,
  type EsignTemplateType,
} from '@propertypro/shared';

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
  /** Null for a one-off send, which carries its own schema and PDF. */
  templateId: number | null;
  /**
   * The field layout this request was SENT with. Null on rows written before
   * migration 0063, which fall back to their template.
   */
  fieldsSchema: EsignFieldsSchema | null;
  /** The PDF this request was sent with. Null falls back to the template's. */
  sourceDocumentPath: string | null;
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
  /** Send from a saved template. Mutually exclusive with `document`. */
  templateId?: number;
  /**
   * Send a document that has no template, which is what the builder's send
   * path produces: the request carries its own field layout and its own PDF
   * and nothing is saved for reuse. Mutually exclusive with `templateId`.
   */
  document?: {
    name: string;
    sourceDocumentPath: string;
    fieldsSchema: EsignFieldsSchema;
  };
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
