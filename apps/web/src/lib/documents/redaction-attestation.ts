/**
 * Redaction attestation on document upload.
 *
 * §718.111(12)(c) obliges the association to redact protected personal
 * information before making official records available. The duty is the
 * association's — but PropertyPro builds the frictionless path from a scanned
 * PDF to an owner portal (and, in some configurations, a public page), and
 * before this there was no redaction affordance anywhere in the product.
 *
 * The attestation does not discharge the association's duty and does not
 * redact anything. What it does is convert the product's position from "we
 * published it" to "they attested, on this date, by name" — recorded in the
 * compliance audit log, which is the record that would matter later.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-02.
 */
import { logAuditEvent } from '@propertypro/db';
import { isRedactionSensitiveCategory, normalizeCategoryName } from '@propertypro/shared';
import { ValidationError } from '@/lib/api/errors';
import { getDocumentCategoryNames } from '@/lib/services/document-category-service';
import { REDACTION_ATTESTATION_TEXT } from './redaction-attestation-text';

// Re-exported from the import-free module so the client uploader can use the
// same sentence without dragging `@propertypro/db` into a browser bundle.
export { REDACTION_ATTESTATION_TEXT } from './redaction-attestation-text';

/**
 * Whether uploading into this category requires an attestation.
 *
 * Resolves the category's NAME first, because `categoryId` is per-community and
 * carries no meaning on its own. An id that resolves to no row is treated as
 * sensitive: a missing category is not evidence that a document is safe.
 */
export async function categoryRequiresRedactionAttestation(
  communityId: number,
  categoryId: number,
): Promise<boolean> {
  const names = await getDocumentCategoryNames(communityId, [categoryId]);
  const name = names.get(categoryId);
  if (!name) return true;
  return isRedactionSensitiveCategory(normalizeCategoryName(name));
}

/**
 * Enforce the attestation, and record it.
 *
 * Throws `ValidationError` (400) when the category needs an attestation and
 * none was given — server-side, so a client that omits the field is refused
 * rather than quietly publishing an unredacted record.
 */
export async function enforceRedactionAttestation(params: {
  communityId: number;
  categoryId: number;
  userId: string;
  title: string;
  attested: boolean | undefined;
}): Promise<void> {
  const required = await categoryRequiresRedactionAttestation(
    params.communityId,
    params.categoryId,
  );
  if (!required) return;

  if (params.attested !== true) {
    throw new ValidationError(
      'This document category commonly contains protected personal information. Confirm you have redacted it before uploading.',
      {
        fields: [{ field: 'redactionAttested', message: REDACTION_ATTESTATION_TEXT }],
      },
    );
  }

  // Actor + timestamp + what they attested to, verbatim. `logAuditEvent` stamps
  // the time; recording the attestation TEXT means a later change to the wording
  // does not rewrite what past uploaders actually agreed to.
  await logAuditEvent({
    userId: params.userId,
    action: 'create',
    resourceType: 'document_redaction_attestation',
    resourceId: String(params.categoryId),
    communityId: params.communityId,
    newValues: {
      attested: true,
      attestationText: REDACTION_ATTESTATION_TEXT,
      documentTitle: params.title,
      statute: '718.111(12)(c)',
    },
  });
}
