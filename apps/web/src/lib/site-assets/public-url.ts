/**
 * Client-safe public-asset URL helpers.
 *
 * Kept separate from ./storage-paths.ts — that module imports `node:crypto`
 * (randomUUID) for write-side path generation, which cannot be bundled into a
 * browser/client bundle. Client components (e.g. the gallery editor form) need
 * `buildPublicAssetUrl` to render thumbnails, so it lives here with no Node
 * built-in imports. storage-paths.ts re-exports both names for server callers.
 */
export const SITE_ASSETS_BUCKET = 'community-site-assets';

/** Public CDN URL for a stored site asset (or a relative fallback in tests). */
export function buildPublicAssetUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return `/site-assets/${path}`;
  return `${base}/storage/v1/object/public/${SITE_ASSETS_BUCKET}/${path}`;
}
