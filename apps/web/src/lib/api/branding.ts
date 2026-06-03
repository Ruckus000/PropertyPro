/**
 * P3-47: Server-side branding helpers for white-label settings.
 *
 * All callers must have already verified the user holds property_manager_admin
 * in the target community before calling these functions.
 */
import { cache } from 'react';
import { communities, siteLayoutMetadata } from '@propertypro/db';
// Unsafe escape hatch: communities is the root tenant table (no communityId column),
// so getBrandingForCommunity must query by primary key directly.
// AUTHZ: P3-47: White-label branding — communities is the root tenant table (no communityId column); getBrandingForCommunity must query by primary key directly.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { eq, and, isNull } from '@propertypro/db/filters';
import type { CommunityBranding, CustomCssOverrides } from '@propertypro/shared';

/**
 * Public info about a community for the public site renderer.
 * Fetched via unscoped client because communities is the root tenant table.
 */
export interface CommunityPublicInfo {
  id: number;
  name: string;
  slug: string;
  communityType: string;
  sitePublishedAt: Date | null;
}

/**
 * Fetch community public info by ID for the public site renderer.
 * Returns null if the community does not exist or is soft-deleted.
 *
 * Wrapped in React.cache so that generateMetadata and PublicSitePage share
 * a single DB read per request instead of issuing two identical SELECTs.
 */
export const getCommunityPublicInfo = cache(async (
  communityId: number,
): Promise<CommunityPublicInfo | null> => {
  const db = createUnscopedClient();
  const rows = await db
    .select({
      id: communities.id,
      name: communities.name,
      slug: communities.slug,
      communityType: communities.communityType,
      sitePublishedAt: communities.sitePublishedAt,
    })
    .from(communities)
    .where(and(eq(communities.id, communityId), isNull(communities.deletedAt)))
    .limit(1);

  return rows[0] ?? null;
});

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

/**
 * Read the site-onboarding completion timestamp for a community.
 * Returns `null` when the wizard has never been completed (the prod default
 * for every existing row). Callers use null-vs-set to decide whether to
 * surface the "customize your site" prompts (WizardEntryBanner, dashboard
 * banner, communities-table "Site" pill).
 *
 * communities is the root tenant table (no communityId column), so this
 * queries by primary key via the unscoped client — same contract as
 * getBrandingForCommunity above.
 */
export async function getSiteOnboardingCompletedAt(
  communityId: number,
): Promise<Date | null> {
  const db = createUnscopedClient();
  const rows = await db
    .select({ completedAt: communities.siteOnboardingCompletedAt })
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1);
  return rows[0]?.completedAt ?? null;
}

/**
 * Stamp `site_onboarding_completed_at = now()` for a community.
 *
 * Called from the publish route when the wizard's final-step "Publish my
 * site" action carries `markOnboardingComplete: true`. Writing it on every
 * wizard publish (rather than only the first) is intentional: re-running the
 * wizard to completion is a fresh completion event, and only null-vs-set
 * matters to the consumers. Idempotent in effect.
 *
 * Callers must have already verified pm_admin/cam membership in the target
 * community (the publish route does this before invoking).
 */
export async function markSiteOnboardingComplete(
  communityId: number,
): Promise<void> {
  const db = createUnscopedClient();
  await db
    .update(communities)
    .set({ siteOnboardingCompletedAt: new Date() })
    .where(eq(communities.id, communityId));
}

export interface BrandingPatch {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  fontHeading?: string;
  fontBody?: string;
  /** Supabase Storage path of the already-processed 400×400 WebP logo */
  logoPath?: string;
  /** Supabase Storage path of the already-processed wordmark site logo (≤600×180 WebP) */
  siteLogoPath?: string;
  /** Custom footer text for outbound emails */
  customEmailFooter?: string;
  /** Running total of site-asset bytes consumed by this community (managed by quota helpers) */
  assetsBytesUsed?: number;
  /** PR #5b Step 1 — wizard layout choice. Slug from site_layout_metadata. */
  layoutId?: string | null;
  /** PR #5b Step 2 — wizard preset choice. Slug from site_theme_presets. */
  themePresetSlug?: string | null;
  /** PR #5b Step 3 — community tagline. */
  tagline?: string | null;
  /** PR #11 — Pro+ custom CSS token overrides; null clears them. */
  customCssOverrides?: CustomCssOverrides | null;
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

/**
 * Maps a community type to its default public-site layout (spec §4.0).
 * condo_718 → tidewater · hoa_720 → boulevard · apartment → sable.
 */
const SITE_LAYOUT_BY_COMMUNITY_TYPE: Record<string, string> = {
  condo_718: 'tidewater',
  hoa_720: 'boulevard',
  apartment: 'sable',
};

/**
 * Seed the default site branding (layout + theme preset) for a freshly-created
 * community (spec §4.0 — "the site is always live").
 *
 * Derives `layoutId` from the community type, then reads that layout's
 * `default_preset_slug` from the platform-level `site_layout_metadata` catalog
 * for `themePresetSlug`. Merges into the community's branding jsonb.
 *
 * Idempotent: if branding already carries a `layoutId` (community already
 * customized, or this ran before), it no-ops so a re-run never clobbers a PM's
 * choice. Best-effort by contract — the caller (`createCommunityForPm`)
 * wraps it in try/catch so a catalog read failure never rolls back creation.
 *
 * NOTE: this only seeds branding; the starter-pack *blocks* are applied
 * separately by `applyStarterPackToCommunity`. Completion tracking
 * (`site_onboarding_completed_at`) is intentionally left null so the dashboard
 * prompts still surface — see [[getSiteOnboardingCompletedAt]].
 */
export async function seedDefaultSiteBranding(
  communityId: number,
  communityType: string,
): Promise<void> {
  const existing = await getBrandingForCommunity(communityId);
  if (existing?.layoutId) return; // already customized/seeded — never clobber

  const layoutId = SITE_LAYOUT_BY_COMMUNITY_TYPE[communityType];
  if (!layoutId) return; // unknown type → leave branding to the renderer default

  const db = createUnscopedClient();
  const rows = await db
    .select({ defaultPresetSlug: siteLayoutMetadata.defaultPresetSlug })
    .from(siteLayoutMetadata)
    .where(eq(siteLayoutMetadata.slug, layoutId))
    .limit(1);
  const themePresetSlug = rows[0]?.defaultPresetSlug ?? null;

  await updateBrandingForCommunity(communityId, { layoutId, themePresetSlug });
}
