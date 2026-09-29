/**
 * Core e-sign service — template CRUD, submission lifecycle, signing flow, consent.
 *
 * Follows the violations-service.ts pattern:
 * - Typed interfaces for all records and inputs
 * - All tenant queries via createScopedClient(communityId)
 * - Audit events via logAuditEvent
 * - Signing flow uses unscoped DB reads for public token lookup, scoped client for mutations
 *
 * Module layout (SVC-08): each banner section of this file now lives in its own
 * module under `./esign/`, and this file is the public barrel — it re-exports
 * exactly the names it exported before, so no importer (and no `vi.mock` of
 * this path) changes. Module-private helpers stay un-re-exported.
 *
 *   esign/types.ts — Record and input interfaces
 *   esign/helpers.ts — Helpers shared by the other e-sign modules (module-private to the esign/ directory)
 *   esign/templates.ts — Template CRUD
 *   esign/submissions.ts — Submission lifecycle (incl. getSubmission / cancelSubmission / sendReminder, which sat below the my-pending banner in the monolith)
 *   esign/my-pending.ts — My-pending: user-scoped pending signers (dashboard widget / non-admin view)
 *   esign/signing.ts — Signing flow (token-authenticated)
 *   esign/completion.ts — Completion logic (internal — not re-exported by the barrel)
 *   esign/consent.ts — Consent management
 */
export type {
  EsignTemplateRecord,
  EsignSubmissionRecord,
  EsignSignerRecord,
  EsignEventRecord,
  CreateTemplateInput,
  UpdateTemplateInput,
  CreateSubmissionInput,
  SubmitSignatureInput,
  SubmitSignatureResult,
} from './esign/types';
export {
  createTemplate,
  listTemplates,
  getTemplate,
  updateTemplate,
  archiveTemplate,
  cloneTemplate,
} from './esign/templates';
export type {
  EsignListSigner,
  EsignSubmissionListRow,
} from './esign/submissions';
export {
  createSubmission,
  listSubmissions,
  listSubmissionsWithSigners,
  getSubmission,
  cancelSubmission,
  sendReminder,
} from './esign/submissions';
export type {
  MyPendingSignerRecord,
} from './esign/my-pending';
export {
  listMyPendingSigners,
  listMyPendingForActor,
} from './esign/my-pending';
export {
  getSignerContext,
  submitSignature,
  declineSigning,
} from './esign/signing';
export {
  getConsentStatus,
  revokeConsent,
} from './esign/consent';
