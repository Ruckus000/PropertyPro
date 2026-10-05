/**
 * Turn a stored branding image path (`branding.logoPath` / `siteLogoPath`) into
 * a URL a browser can load. Server-only: it signs with the service role.
 *
 * Two writers store logos, in two buckets, and the path shape tells them apart:
 *
 *   communities/{id}/…   the web app (PATCH /api/v1/pm/branding) — the
 *                        PRIVATE `documents` bucket, so it needs a signed URL.
 *   {id}/site/…          the admin console's upload route — the PUBLIC
 *                        `community-assets` bucket, so a plain public URL.
 *
 * Every reader used to assume the first, and two pages assumed a `branding`
 * bucket that has never existed, so an admin-uploaded logo rendered nowhere and
 * the welcome and demo pages rendered no logo at all.
 *
 * A path outside the community's own prefix resolves to null rather than a URL.
 * Both writers already constrain the path, so this is defence in depth: the
 * signed URL is minted with the service role, and a stray value must not turn
 * a public page into a reader of another community's private documents.
 */
import { createPresignedDownloadUrl } from '@propertypro/db';
import { COMMUNITY_ASSETS_BUCKET, DOCUMENTS_BUCKET } from '@propertypro/db/constants';

export async function resolveBrandingImageUrl(
  communityId: number,
  path: string | null | undefined,
): Promise<string | null> {
  if (!path) return null;
  if (path.includes('\\') || path.split('/').some((s) => s === '..' || s === '.')) return null;

  if (path.startsWith(`communities/${communityId}/`)) {
    try {
      return await createPresignedDownloadUrl(DOCUMENTS_BUCKET, path);
    } catch {
      // Non-fatal everywhere it is used: render without the logo.
      return null;
    }
  }

  if (path.startsWith(`${communityId}/`)) {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    return `${base}/storage/v1/object/public/${COMMUNITY_ASSETS_BUCKET}/${path}`;
  }

  return null;
}

