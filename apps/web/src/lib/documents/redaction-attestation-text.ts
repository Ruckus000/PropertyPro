/**
 * The exact wording a board member attests to when uploading a document that
 * commonly contains protected personal information.
 *
 * ⚠️ **Import-free on purpose.** The enforcement module next door
 * (`redaction-attestation.ts`) pulls in `@propertypro/db` for the audit write,
 * which throws `Missing DATABASE_URL` at module load and cannot be reached from
 * a client component. The uploader checkbox needs only the sentence.
 *
 * Changing this string changes what future uploaders agree to; past
 * attestations record their own wording in the audit log, so history is not
 * rewritten by an edit here.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-02.
 */
export const REDACTION_ATTESTATION_TEXT =
  'I have reviewed this document and redacted protected personal information as required by Fla. Stat. §718.111(12)(c).';
