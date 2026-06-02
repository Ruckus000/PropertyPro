/**
 * Pure helpers for community-site-assets storage paths.
 *
 * Path shape: {community_id}/{kind}/{uuid}-{filename}
 * where kind ∈ {logo, hero, content}. The community_id prefix matches the
 * Supabase Storage RLS policies in migration 0006 (storage.foldername(name)[1]).
 */
import { randomUUID } from 'node:crypto';

// Re-exported from the client-safe module so existing server-side importers of
// `SITE_ASSETS_BUCKET` / `buildPublicAssetUrl` keep their import path. Client
// components must import these from './public-url' directly to avoid pulling
// this module's node:crypto import into the browser bundle.
export { SITE_ASSETS_BUCKET, buildPublicAssetUrl } from './public-url';

const VALID_KINDS = ['logo', 'hero', 'content'] as const;
export type AssetKind = (typeof VALID_KINDS)[number];

function sanitizeFilename(name: string): string {
  if (name.includes('/') || name.includes('\\')) {
    throw new Error(`Filename must not contain path separators: ${name}`);
  }
  if (name.startsWith('.')) {
    throw new Error(`Filename must not start with a dot: ${name}`);
  }
  return name.toLowerCase().replace(/[^a-z0-9._-]/g, '_');
}

export function buildSiteAssetPath(
  communityId: number,
  kind: AssetKind,
  filename: string,
): string {
  if (!Number.isInteger(communityId) || communityId <= 0) {
    throw new Error(`communityId must be a positive integer; got ${communityId}`);
  }
  if (!(VALID_KINDS as readonly string[]).includes(kind)) {
    throw new Error(`Unknown asset kind: ${kind}`);
  }
  const safe = sanitizeFilename(filename);
  return `${communityId}/${kind}/${randomUUID()}-${safe}`;
}

export interface ParsedSiteAssetPath {
  communityId: number;
  kind: AssetKind;
  filename: string;
}

export function parseSiteAssetPath(path: string): ParsedSiteAssetPath | null {
  if (!path) return null;
  const parts = path.split('/');
  // Mirror buildSiteAssetPath's writer contract: exactly 3 segments,
  // single-segment filename with no path-traversal markers. The previous
  // permissive shape (`rest.join('/')`) accepted `42/hero/../../etc/passwd`
  // and `42/hero/uuid-foo/sub/dir/extra.webp`, breaking the parser/writer
  // symmetry asserted in this file's header doc. Supabase Storage uses
  // literal keys so this was never directly exploitable as cross-tenant
  // traversal, but rejecting these here keeps audit-log resourceId clean,
  // prevents storage namespace pollution, and matches the schema's intent.
  if (parts.length !== 3) return null;
  const [communityIdStr, kind, filename] = parts as [string, string, string];
  const communityId = Number(communityIdStr);
  if (!Number.isInteger(communityId) || communityId <= 0) return null;
  if (!(VALID_KINDS as readonly string[]).includes(kind)) return null;
  if (!filename || filename === '.' || filename === '..') return null;
  if (filename.includes('/') || filename.includes('\\')) return null;
  return { communityId, kind: kind as AssetKind, filename };
}
