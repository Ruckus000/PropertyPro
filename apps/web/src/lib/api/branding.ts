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
 * Persist a branding patch.
 * Merges with existing branding so partial updates are safe.
 *
 * NOTE: Input validation is handled by the Zod schema in the API route
 * (apps/web/src/app/api/v1/pm/branding/route.ts). This function trusts
 * that its callers have already validated the patch.
 */
export async function updateBrandingForCommunity(
  communityId: number,
  patch: BrandingPatch,
): Promise<CommunityBranding> {
  const existing = await getBrandingForCommunity(communityId);
  const updated: CommunityBranding = {
    ...existing,
    ...patch,
  };

  const db = createUnscopedClient();
  await db.update(communities).set({ branding: updated }).where(eq(communities.id, communityId));

  return updated;
}
