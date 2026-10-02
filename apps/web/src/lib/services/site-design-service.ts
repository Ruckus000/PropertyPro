/**
 * Website builder v4 — the site's look (layout, colour set, colours, fonts,
 * custom colours) as a DRAFT that goes live on Publish.
 *
 * The look lives in `communities.branding`, outside the `site_blocks` draft
 * layer, so until now every change to it was public on the next request. The
 * draft is the `draftLook` key in the same jsonb (`SITE_LOOK_FIELDS` only):
 * live renderers read named fields and never see it, previews read it through
 * `effectiveLook`, and `publishCommunitySite` promotes it.
 *
 * Writes go through `mergeBranding`, one `jsonb_set` UPDATE, so a concurrent
 * site-settings or quota write is never lost to a read-merge-write.
 *
 * Callers gate first: PM manager role in the target community plus the
 * `hasSiteEditor` plan feature (the route's `ensurePmAccess`), and
 * `hasSiteCustomCss` before passing `customCssOverrides`.
 */
import { logAuditEvent } from '@propertypro/db';
import { pendingLook, liveLook, type CustomCssOverrides, type SiteLook } from '@propertypro/shared';
import { ValidationError } from '@/lib/api/errors';
import { getBrandingForCommunity } from '@/lib/api/branding';
import { listThemePresetsForWizard } from '@/lib/db/theme-preset-catalog';
import { isLayoutId } from '@/lib/public-site/layout-resolver';
import { applyPresetTokensToBranding } from '@/lib/public-site/preview-overrides';
import { mergeBranding } from '@/lib/services/site-settings-service';

export interface SiteDesign {
  /** What residents see now. */
  live: SiteLook;
  /** Unpublished changes only — empty when there is nothing to publish. */
  draft: SiteLook;
}

export interface DesignPatch {
  /** `null` returns to the community type's default layout. */
  layoutId?: string | null;
  /** `null` returns to the layout's default colour set. */
  themePresetSlug?: string | null;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  fontHeading?: string;
  fontBody?: string;
  /** `null` clears the custom colours (in the draft). */
  customCssOverrides?: CustomCssOverrides | null;
}

export async function getSiteDesign(communityId: number): Promise<SiteDesign> {
  const branding = await getBrandingForCommunity(communityId);
  return { live: liveLook(branding), draft: pendingLook(branding) };
}

/**
 * Save part of the look as a draft.
 *
 * Choosing a colour set writes that set's colours and fonts too. Storing only
 * its slug is how the wizard's choice never reached the live site:
 * `resolveTheme` reads the colour and font fields, not the slug. Colours or
 * fonts sent in the same patch win over the set's.
 */
export async function saveDraftDesign(
  communityId: number,
  patch: DesignPatch,
  opts: { actorUserId: string },
): Promise<SiteDesign> {
  if (patch.layoutId != null && !isLayoutId(patch.layoutId)) {
    throw new ValidationError('That template layout does not exist', {
      fields: [{ field: 'layoutId', message: 'Unknown layout' }],
    });
  }

  let draft: SiteLook = { ...patch };

  if (patch.themePresetSlug != null) {
    const presets = await listThemePresetsForWizard();
    const preset = presets.find((p) => p.slug === patch.themePresetSlug);
    if (!preset) {
      throw new ValidationError('That colour set does not exist', {
        fields: [{ field: 'themePresetSlug', message: 'Unknown colour set' }],
      });
    }
    const tokens = applyPresetTokensToBranding({}, preset.tokens) ?? {};
    draft = { ...tokens, ...draft } as SiteLook;
  }

  // One read: `getBrandingForCommunity` is request-cached, so a second read
  // after the write would return this same row. The result is computed the
  // way the UPDATE merges (`||`: draft keys over the stored draft).
  const branding = (await getBrandingForCommunity(communityId)) ?? {};
  const before = { live: liveLook(branding), draft: pendingLook(branding) };
  await mergeBranding(communityId, { draftLook: draft });
  const merged = { ...branding, draftLook: { ...(branding.draftLook ?? {}), ...draft } };
  const after = { live: liveLook(merged), draft: pendingLook(merged) };

  await logAuditEvent({
    userId: opts.actorUserId,
    communityId,
    action: 'site_design_draft_saved',
    resourceType: 'community',
    resourceId: String(communityId),
    oldValues: { draftLook: before.draft },
    newValues: { draftLook: after.draft },
  });

  return after;
}
