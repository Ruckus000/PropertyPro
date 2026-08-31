/**
 * Document category constants — extracted to avoid a circular import with
 * access-policies.ts.
 */

export const KNOWN_DOCUMENT_CATEGORY_KEYS = [
  'declaration',
  'rules',
  'inspection_reports',
  'meeting_minutes',
  'announcements',
  'maintenance_records',
  'lease_docs',
  'community_handbook',
  'move_in_out_docs',
  'financial_records',
  'contracts',
  'insurance',
  'elections',
] as const;

export const DOCUMENT_CATEGORY_KEYS = [
  ...KNOWN_DOCUMENT_CATEGORY_KEYS,
  'unknown',
] as const;

export type KnownDocumentCategoryKey = (typeof KNOWN_DOCUMENT_CATEGORY_KEYS)[number];
export type DocumentCategoryKey = (typeof DOCUMENT_CATEGORY_KEYS)[number];

/**
 * Categories that routinely contain protected personal information, and so
 * require a redaction attestation before upload.
 *
 * §718.111(12)(c) obliges the association to redact protected personal
 * information — social-security and driver-licence numbers, personal contact
 * details, medical and personnel records — before making official records
 * available. Boards upload scanned PDFs, and scanned ledgers, delinquency
 * reports, minutes and leases contain exactly this. The duty is the
 * association's, but the product is the frictionless path that publishes them,
 * so the upload asks.
 *
 * Deliberately NOT every category. A prompt on the declaration or the rules —
 * public documents with no personal information in them — is the fastest way to
 * train a board to click through the prompt without reading it, which would
 * make the attestation worthless exactly where it matters.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-02.
 */
export const REDACTION_SENSITIVE_CATEGORY_KEYS = [
  'financial_records',
  'meeting_minutes',
  'maintenance_records',
  'lease_docs',
  'move_in_out_docs',
  'elections',
] as const satisfies readonly KnownDocumentCategoryKey[];

export type RedactionSensitiveCategoryKey =
  (typeof REDACTION_SENSITIVE_CATEGORY_KEYS)[number];

/**
 * Whether a normalized category key requires a redaction attestation.
 *
 * An UNKNOWN category returns true. A community that renamed a category to
 * something the normalizer does not recognise still uploads the same
 * delinquency report, and defaulting an unrecognised name to "no attestation
 * needed" would let any rename silently switch the check off.
 */
export function isRedactionSensitiveCategory(key: DocumentCategoryKey): boolean {
  if (key === 'unknown') return true;
  return (REDACTION_SENSITIVE_CATEGORY_KEYS as readonly string[]).includes(key);
}
