/**
 * P3-47: Server-side branding helpers for white-label settings.
 *
 * All callers must have already verified the user holds property_manager_admin
 * in the target community before calling these functions.
 */
import { communities } from '@propertypro/db';
// Unsafe escape hatch: communities is the root tenant table (no communityId column),
// so getBrandingForCommunity must query by primary key directly.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { eq } from '@propertypro/db/filters';
import type { CommunityBranding } from '@propertypro/shared';
import { isValidHexColor } from '@propertypro/shared';
import { ALLOWED_FONTS } from '@propertypro/theme';
import { ValidationError } from '@/lib/api/errors';

/**
 * Read the current branding for a community.
 * Returns null if no branding has been saved yet.
 */
export async function getBrandingForCommunity(
  communityId: number,
): Promise<CommunityBranding | null> {
  // communities has no communityId column — query directly by primary key
  const db = createUnscopedClient();
  const rows = await db
    .select()
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const raw = row.branding;
  if (!raw || typeof raw !== 'object') return null;
  return raw as CommunityBranding;
}

export interface BrandingPatch {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  fontHeading?: string;
  fontBody?: string;
  /** Supabase Storage path of the already-processed 400×400 WebP logo */
  logoPath?: string;
}

/**
 * Validate and persist a branding patch.
 * Merges with existing branding so partial updates are safe.
 */
export async function updateBrandingForCommunity(
  communityId: number,
  patch: BrandingPatch,
): Promise<CommunityBranding> {
  if (patch.primaryColor !== undefined && !isValidHexColor(patch.primaryColor)) {
    throw new ValidationError('primaryColor must be a 6-digit hex color (e.g. #2563eb)');
  }
  if (patch.secondaryColor !== undefined && !isValidHexColor(patch.secondaryColor)) {
    throw new ValidationError('secondaryColor must be a 6-digit hex color (e.g. #6b7280)');
  }
  if (patch.accentColor !== undefined && !isValidHexColor(patch.accentColor)) {
    throw new ValidationError('accentColor must be a 6-digit hex color (e.g. #DBEAFE)');
  }
  if (patch.fontHeading !== undefined && !(ALLOWED_FONTS as readonly string[]).includes(patch.fontHeading)) {
    throw new ValidationError(`fontHeading must be one of the allowed Google Fonts families`);
  }
  if (patch.fontBody !== undefined && !(ALLOWED_FONTS as readonly string[]).includes(patch.fontBody)) {
    throw new ValidationError(`fontBody must be one of the allowed Google Fonts families`);
  }

  const existing = await getBrandingForCommunity(communityId);
  const updated: CommunityBranding = {
    ...existing,
    ...patch,
  };

  const db = createUnscopedClient();
  await db.update(communities).set({ branding: updated }).where(eq(communities.id, communityId));

  return updated;
}
