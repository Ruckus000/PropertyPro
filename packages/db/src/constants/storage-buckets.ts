/**
 * Supabase Storage bucket names.
 *
 * These were previously bare string literals scattered across route handlers and
 * the seed, which is how a typo becomes a silent "Bucket not found" at runtime
 * rather than a compile error.
 */

/**
 * Association documents — minutes, budgets, bylaws, uploaded PDFs.
 * Private; every read goes through a service-role signed URL.
 * Provisioned by `packages/db/migrations/0049_documents_storage_bucket.sql`.
 */
export const DOCUMENTS_BUCKET = 'documents';

/**
 * Generated community export archives.
 *
 * Deliberately NOT the `documents` bucket. An export object is a copy of an
 * entire association — every table plus every uploaded file, including resident
 * PII — so a signed-URL or policy mistake here is categorically worse than the
 * same mistake on one document. Separate bucket, separate blast radius,
 * separate retention (exports expire; documents are permanent).
 *
 * Private with NO storage.objects policies: storage.objects is default-deny, so
 * a policy-less private bucket is unreachable by anon/authenticated. Reads
 * happen only via the service-role admin client minting short-lived signed URLs.
 * See docs/audits/2026-08-09-legal-risk-audit.md F-07.
 */
export const COMMUNITY_EXPORTS_BUCKET = 'community-exports';

/**
 * How long a generated archive is retained before the reaper deletes it.
 *
 * The ToS promise is that an association can export "at any time" — which is
 * satisfied by re-requesting for free, not by hosting a given archive forever.
 * Keeping full-association PII copies indefinitely would be its own breach
 * surface.
 */
export const COMMUNITY_EXPORT_RETENTION_DAYS = 14;

/**
 * TTL for a download signed URL. Deliberately shorter than the 1 hour used for a
 * single document (`documents/[id]/download`), because the payload is the entire
 * association rather than one file.
 */
export const COMMUNITY_EXPORT_SIGNED_URL_TTL_SECONDS = 900;
