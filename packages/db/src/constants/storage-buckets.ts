/**
 * Supabase Storage bucket names.
 *
 * These were previously bare string literals scattered across route handlers and
 * the seed, which is how a typo becomes a silent "Bucket not found" at runtime
 * rather than a compile error.
 *
 * A typo turned out not to be the only way to get that error. `maintenance` and
 * `community-assets` produced it for a different reason — nobody had ever created
 * them. So this file is also the greppable inventory of buckets the app expects,
 * and `storage-buckets-migration.test.ts` asserts each name here appears in a
 * provisioning migration.
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
 * Resident-submitted maintenance photos and their generated thumbnails.
 * Paths are `maintenance/{communityId}/{requestId}/…`.
 *
 * Private with NO storage.objects policies, the `documents` / `community-exports`
 * model: storage.objects is default-deny, so a policy-less private bucket is
 * unreachable by anon/authenticated, and every read is a service-role signed URL.
 * Contents are photographs of private property.
 *
 * Provisioned by `0066_provision_maintenance_and_community_assets_buckets.sql` —
 * which was written because this bucket had NEVER existed. Every upload through
 * it 500'd with Supabase's `Bucket not found` from the day the feature shipped.
 */
export const MAINTENANCE_BUCKET = 'maintenance';

/**
 * Admin-console uploads for a community's public site — logos and site imagery.
 * Paths are `{communityId}/site/{uuid}.{ext}`.
 *
 * PUBLIC, because the upload route returns `getPublicUrl(...)` and the result is
 * rendered to unauthenticated site visitors. Still NO storage.objects policies,
 * and that is not an oversight: `/object/public/...` does not evaluate RLS, so a
 * SELECT policy would not gate reads — it would authorise LISTING, which is a
 * cross-tenant inventory leak. Migration 0041 dropped exactly such a policy from
 * `community-site-assets` for that reason (advisor lint 0025).
 *
 * Same provisioning migration, same history: it had never existed either.
 */
export const COMMUNITY_ASSETS_BUCKET = 'community-assets';

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
