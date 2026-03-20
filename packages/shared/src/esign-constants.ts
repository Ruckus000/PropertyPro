/**
 * E-signature shared types and constants.
 *
 * NOTE: These constants are retained for the upcoming native e-signature builder.
 * The DocuSeal CE integration has been removed. DocuSeal-specific helpers
 * (external ID builders, folder name builder) have been deleted.
 *
 * Used across web app, API routes, and shared packages.
 */

// ---------------------------------------------------------------------------
// Template types
// ---------------------------------------------------------------------------

export const ESIGN_TEMPLATE_TYPES = [
  'proxy',
  'consent',
  'lease_addendum',
  'maintenance_auth',
  'violation_ack',
  'assessment_agreement',
  'custom',
] as const;
export type EsignTemplateType = (typeof ESIGN_TEMPLATE_TYPES)[number];

// ---------------------------------------------------------------------------
// Statuses
// ---------------------------------------------------------------------------

export const ESIGN_TEMPLATE_STATUSES = ['active', 'archived'] as const;
export type EsignTemplateStatus = (typeof ESIGN_TEMPLATE_STATUSES)[number];

export const ESIGN_SUBMISSION_STATUSES = [
  'pending',
  'completed',
  'declined',
  'expired',
  'cancelled',
] as const;
export type EsignSubmissionStatus = (typeof ESIGN_SUBMISSION_STATUSES)[number];

export const ESIGN_SIGNER_STATUSES = [
  'pending',
  'opened',
  'completed',
  'declined',
] as const;
export type EsignSignerStatus = (typeof ESIGN_SIGNER_STATUSES)[number];

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export const ESIGN_EVENT_TYPES = [
  'created',
  'sent',
  'opened',
  'signed',
  'completed',
  'declined',
  'expired',
  'cancelled',
  'reminder_sent',
  'consent_given',
  'consent_revoked',
  'verified',
  'downloaded',
  'signer_completed',
  'submission_completed',
] as const;
export type EsignEventType = (typeof ESIGN_EVENT_TYPES)[number];

// ---------------------------------------------------------------------------
// Roles that can manage e-sign templates and submissions
// ---------------------------------------------------------------------------

export const ESIGN_ELEVATED_ROLES = [
  'board_member',
  'board_president',
  'cam',
  'property_manager_admin',
] as const;

// ---------------------------------------------------------------------------
// UETA consent text
// ---------------------------------------------------------------------------

export const ESIGN_CONSENT_TEXT =
  'I consent to conduct this transaction electronically pursuant to the ' +
  'Florida Uniform Electronic Transaction Act (§668.50, Florida Statutes) ' +
  'and the federal Electronic Signatures in Global and National Commerce Act ' +
  '(ESIGN Act). I understand that I may withdraw this consent at any time ' +
  'and request a paper-based process instead.';

// ---------------------------------------------------------------------------
// Signing orders
// ---------------------------------------------------------------------------

export const ESIGN_SIGNING_ORDERS = ['parallel', 'sequential'] as const;
export type EsignSigningOrder = (typeof ESIGN_SIGNING_ORDERS)[number];

// ---------------------------------------------------------------------------
// Field types and schema
// ---------------------------------------------------------------------------

export const ESIGN_FIELD_TYPES = ['signature', 'initials', 'date', 'text', 'checkbox'] as const;
export type EsignFieldType = (typeof ESIGN_FIELD_TYPES)[number];

/** A single placeable field on a PDF template page. */
export interface EsignFieldDefinition {
  id: string;               // client-generated UUID
  type: EsignFieldType;
  signerRole: string;        // which signer fills this field
  page: number;              // 0-indexed page number
  /** All position/size values are percentages (0-100) relative to the
   *  pdfjs-dist rendered viewport at scale=1 (CropBox).
   *  The PDF service translates to absolute MediaBox points when embedding. */
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
  label?: string;
}

export interface EsignFieldsSchema {
  version: 1;
  fields: EsignFieldDefinition[];
  signerRoles: string[];
}

// ---------------------------------------------------------------------------
// Reminder limits
// ---------------------------------------------------------------------------

export const ESIGN_MAX_REMINDERS = 3;
export const ESIGN_REMINDER_INTERVALS_DAYS = [7, 3, 1] as const;
