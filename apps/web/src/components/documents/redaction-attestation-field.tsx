'use client';

import { isRedactionSensitiveCategory, normalizeCategoryName } from '@propertypro/shared';
import { REDACTION_ATTESTATION_TEXT } from '@/lib/documents/redaction-attestation-text';

/**
 * The upload-side redaction attestation, §718.111(12)(c).
 *
 * `POST /api/v1/documents` refuses (400) any upload into a redaction-sensitive
 * category without `redactionAttested: true` — see
 * `lib/documents/redaction-attestation.ts`. Before this component existed the
 * affordance lived only in `document-uploader.tsx`, which had ZERO importers,
 * so both live upload UIs sent nothing and every upload into a sensitive
 * category failed after the bytes were already in storage.
 *
 * One component rather than the block copied into two call sites: the rule and
 * the wording have to stay identical to the server's, and two copies is how
 * they drift.
 */

/**
 * Mirrors the server's rule so the uploader sees the prompt BEFORE submitting
 * rather than after a 400. The SERVER remains the enforcement point.
 *
 * Fails closed exactly as the server does: a category whose name does not
 * normalize to a known key is treated as sensitive, because an unrecognised
 * category is not evidence that a document is safe to publish unredacted.
 */
export function categoryRequiresRedactionAttestation(
  categoryName: string | null | undefined,
): boolean {
  return isRedactionSensitiveCategory(normalizeCategoryName(categoryName ?? null));
}

interface RedactionAttestationFieldProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Unique per rendered instance — two uploaders can be mounted at once. */
  id?: string;
}

export function RedactionAttestationField({
  checked,
  onChange,
  disabled = false,
  id = 'redaction-attested',
}: RedactionAttestationFieldProps) {
  return (
    <div className="rounded-md border border-status-warning-border bg-status-warning-bg p-3">
      <label htmlFor={id} className="flex items-start gap-3 text-sm text-content-secondary">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0"
        />
        <span>
          <span className="block font-medium text-content">
            Confirm redaction before uploading
          </span>
          {REDACTION_ATTESTATION_TEXT} Documents in this category commonly contain
          social-security or driver-licence numbers, personal contact details, or
          medical and personnel information.
        </span>
      </label>
    </div>
  );
}
