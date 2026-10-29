/**
 * P3-47: Server-side branding helpers for white-label settings.
 *
 * Read and write have DIFFERENT contracts — this is not one rule:
 *   - Reads (`getBrandingForCommunity`, `getCommunityPublicInfo`) are
 *     deliberately UNGATED. They serve the public site, public transparency,
 *     the sitemap, the auth-page branding resolver and the demo route, none of
 *     which has a session.
 *   - Writes (`updateBrandingForCommunity`, `markSiteOnboardingComplete`)
 *     require the caller to have already verified a management role
 *     (property_manager / root_manager) in the target community. See the
 *     per-function notes below.
 *
 * A new community's layout, colour set and colours are not written here: they
 * are its suggested look, published by `applyLookAtCreation`
 * (`@/lib/services/site-look-service`).
 */
import { cache } from 'react';
import { communities } from '@propertypro/db';
// Unsafe escape hatch: communities is the root tenant table (no communityId column),
// so getBrandingForCommunity must query by primary key directly.
// AUTHZ: P3-47: White-label branding — communities is the root tenant table (no communityId column); getBrandingForCommunity must query by primary key directly, and updateBrandingForCommunity's callers have already verified a management role (or template ownership) in the target community.
import { applyLiveBrandingPatchUnscoped, createUnscopedClient } from '@propertypro/db/unsafe';
import { eq, and, isNull } from '@propertypro/db/filters';
import type { CommunityBranding, CustomCssOverrides } from '@propertypro/shared';

/**
 * Public info about a community for the public site renderer.
 * Fetched via unscoped client because communities is the root tenant table.
 */
export interface CommunityPublicInfo {
  id: number;
  name: string;
  /**
   * Everyday form of `name` for headlines (`{{name}}` prefers it). Null when the
   * community has not set one.
   */
  shortName: string | null;
  slug: string;
  communityType: string;
  /**
   * The facts linked fields resolve from (`{{city}}`, `{{units}}`) and the public
   * site hands its layout. Null is "not given": sign-up collects a city, but a
   * community made another way may have none, and a unit count is unknown until
   * someone supplies it. Consumers must treat null as missing, never as blank or 0.
   */
  city: string | null;
  state: string | null;
  unitCount: number | null;
  sitePublishedAt: Date | null;
  /**
   * Website editor v3 Phase 7 — the urgent notice banner.
   *
   * Carried on this read rather than fetched separately: every public page
   * already SELECTs this row once per request, so the banner costs the
   * statutory public entry point nothing. Consumers must gate on
   * `isUrgentNoticeActive` — the stored row is deliberately NOT swept when it
   * expires, so a non-null `urgentNoticeText` does not mean "show this".
   */
  urgentNoticeText: string | null;
  urgentNoticeExpiresAt: Date | null;
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
      shortName: communities.shortName,
      slug: communities.slug,
      communityType: communities.communityType,
      city: communities.city,
      state: communities.state,
      unitCount: communities.unitCount,
      sitePublishedAt: communities.sitePublishedAt,
      urgentNoticeText: communities.urgentNoticeText,
      urgentNoticeExpiresAt: communities.urgentNoticeExpiresAt,
    })
    .from(communities)
    .where(and(eq(communities.id, communityId), isNull(communities.deletedAt)))
    .limit(1);

  return rows[0] ?? null;
});

/**
 * Read the current branding for a community.
 * Returns null if no branding has been saved yet.
 *
 * Wrapped in React.cache for the same reason as getCommunityPublicInfo above:
 * since Phase 8 both `generateMetadata` and the page body need branding (for
 * the SEO overrides and the footer respectively), and without this the public
 * site would issue two identical SELECTs per request on a statutory entry
 * point.
 *
 * NOTE the return type is a CAST, not a parse — `communities.branding` is
 * untyped jsonb and can hold any shape at all. Callers that index into nested
 * objects must go through the total resolvers in
 * `@/lib/site-editor/site-settings`, never trust this signature.
 */
export const getBrandingForCommunity = cache(async (
  communityId: number,
): Promise<CommunityBranding | null> => {
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
});

/**
 * Read the site-onboarding completion timestamp for a community.
 * Returns `null` when the wizard has never been completed (the prod default
 * for every existing row). Callers use null-vs-set to decide whether to
 * surface the "customize your site" prompts (dashboard banner,
 * communities-table "Site" pill).
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
 * Stamp `site_onboarding_completed_at = now()` for a community, ONCE.
 *
 * The UPDATE is conditional on the column still being NULL, in the same
 * statement, so a community that already has a completion moment keeps it: a
 * repeat call is a no-op, and two calls racing stamp once (a read-then-write
 * would let both through). Nothing is returned or thrown to say which happened;
 * no caller needs to know.
 *
 * Once, because the column is WHEN a manager first finished choosing a look:
 * "time to choose a look" is `site_onboarding_completed_at - communities.created_at`,
 * and every later call (a second wizard publish, "Keep this look" again) would
 * move it. Every other reader only asks whether it is set.
 *
 * Called from the publish route when the wizard's final-step "Publish my
 * site" action carries `markOnboardingComplete: true`, and from the look
 * route's `keepCurrent`.
 *
 * Callers must have already verified a management role (property_manager /
 * root_manager) in the target community. Both routes do this through their
 * `ensurePmAccess` (`requireRole(membership, PM_MANAGER_ROLES)` plus
 * `requirePlanFeature('hasSiteEditor')`) before invoking.
 */
export async function markSiteOnboardingComplete(
  communityId: number,
): Promise<void> {
  const db = createUnscopedClient();
  await db
    .update(communities)
    .set({ siteOnboardingCompletedAt: new Date() })
    .where(and(eq(communities.id, communityId), isNull(communities.siteOnboardingCompletedAt)));
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
  /**
   * Website editor v3 Phase 8 — SEO overrides and public-site footer. Written
   * by `site-settings-service.ts`'s atomic `mergeBranding`, not through here.
   */
  siteSettings?: CommunityBranding['siteSettings'];
  siteFooter?: CommunityBranding['siteFooter'];
}

/**
 * Write branding fields LIVE, atomically, and return the branding as stored.
 *
 * Delegates to `applyLiveBrandingPatchUnscoped` (packages/db), one UPDATE that
 * merges inside Postgres. It used to read (request-cached), spread in JS and
 * write the whole object back, which erased anything written in between,
 * including a manager's draft. Writing a look field live also removes any
 * pending draft of that field, so the next Publish cannot revert it.
 *
 * The returned object is the row as this write left it, not the cached read:
 * a `getBrandingForCommunity` call later in the same request still returns
 * the PRE-write value.
 *
 * Callers validate the patch and authorize the write; this trusts both.
 */
export async function updateBrandingForCommunity(
  communityId: number,
  patch: BrandingPatch,
  options: { remove?: readonly (keyof CommunityBranding)[] } = {},
): Promise<CommunityBranding> {
  const { after } = await applyLiveBrandingPatchUnscoped(communityId, patch, options);
  return after ?? {};
}
