/**
 * Pure helpers for community-site-assets storage paths.
 *
 * Path shape: {community_id}/{kind}/{uuid}-{filename}
 * where kind ∈ {logo, hero, content}. The community_id prefix matches the
 * Supabase Storage RLS policies in migration 0006 (storage.foldername(name)[1]).
 */
import { randomUUID } from 'node:crypto';

const VALID_KINDS = ['logo', 'hero', 'content'] as const;
export type AssetKind = (typeof VALID_KINDS)[number];

export const SITE_ASSETS_BUCKET = 'community-site-assets';

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
  if (parts.length < 3) return null;
  const [communityIdStr, kind, ...rest] = parts as [string, string, ...string[]];
  const communityId = Number(communityIdStr);
  if (!Number.isInteger(communityId) || communityId <= 0) return null;
  if (!(VALID_KINDS as readonly string[]).includes(kind)) return null;
  if (rest.length === 0 || rest[0] === '') return null;
  return { communityId, kind: kind as AssetKind, filename: rest.join('/') };
}

export function buildPublicAssetUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return `/site-assets/${path}`;
  return `${base}/storage/v1/object/public/${SITE_ASSETS_BUCKET}/${path}`;
}
