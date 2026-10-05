/**
 * Unsigned public URLs for community logos. Pure: it imports only bucket
 * constants, never the database client, so a route or component that only
 * needs a public URL does not load `@propertypro/db` at module scope (see
 * `branding-image-url.ts` for the signed, server-only counterpart).
 */
import { COMMUNITY_ASSETS_BUCKET } from '@propertypro/db/constants';

/**
 * A PUBLIC, unsigned URL for a community's square logo, or null. For lists of
 * communities (the switcher), where signing one URL per community per request
 * would cost a storage call each.
 *
 * Prefers the 96x96 PNG the branding route writes for email
 * (`{id}/email/…`), else an admin-uploaded logo (`{id}/site/…`); both live in
 * the public `community-assets` bucket. A logo only in the private bucket has
 * no public copy, so it gets null and the caller shows the initial instead.
 */
export function publicCommunityLogoUrl(
  communityId: number,
  paths: { emailLogoPath: string | null | undefined; logoPath: string | null | undefined },
): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  const safe = (path: string | null | undefined, prefix: string) =>
    path &&
    path.startsWith(prefix) &&
    !path.includes('\\') &&
    !path.split('/').some((s) => s === '..' || s === '.')
      ? path
      : null;
  const path =
    safe(paths.emailLogoPath, `${communityId}/email/`) ?? safe(paths.logoPath, `${communityId}/site/`);
  return path ? `${base}/storage/v1/object/public/${COMMUNITY_ASSETS_BUCKET}/${path}` : null;
}
