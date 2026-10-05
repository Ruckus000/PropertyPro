/**
 * A URL the admin editor can show for a community's stored logo.
 *
 * `branding.logoPath` is a storage key, and two writers put it in two buckets:
 * the web app in the private `documents` bucket (`communities/{id}/…`, signed
 * here) and this console's upload route in the public `community-assets`
 * bucket (`{id}/site/…`). The editor used to show a logo only right after an
 * upload, so an existing logo looked like none.
 *
 * Mirrors the web app's `resolveBrandingImageUrl`: a path outside the
 * community's own prefix gets no URL.
 */
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { COMMUNITY_ASSETS_BUCKET, DOCUMENTS_BUCKET } from '@propertypro/db/constants';

const SIGNED_URL_TTL_SECONDS = 60 * 60;

export async function resolveLogoPreviewUrl(
  communityId: number,
  path: string | null | undefined,
): Promise<string | null> {
  if (!path) return null;
  if (path.includes('\\') || path.split('/').some((s) => s === '..' || s === '.')) return null;
  const storage = createAdminClient().storage;

  if (path.startsWith(`communities/${communityId}/`)) {
    const { data, error } = await storage
      .from(DOCUMENTS_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    return error || !data ? null : data.signedUrl;
  }

  if (path.startsWith(`${communityId}/`)) {
    return storage.from(COMMUNITY_ASSETS_BUCKET).getPublicUrl(path).data.publicUrl;
  }

  return null;
}
