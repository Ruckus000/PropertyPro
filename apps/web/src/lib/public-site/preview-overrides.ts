/**
 * Pure helpers for the live-preview route. They turn the in-wizard
 * layout/preset SELECTION (passed as query overrides) into the layout id +
 * branding that the real public-site layout renders with, and a look preview's
 * planned home page into the blocks the layout renders — without persisting
 * anything. Kept pure (no I/O) so they're unit-testable.
 */
import { LAYOUT_IDS, type LayoutId, type SiteBlock } from '@/components/public-site/layouts/types';
import { effectiveLook, type CommunityBranding, type CommunityType, type SiteLook } from '@propertypro/shared';
import { resolveLayoutId, type BrandingLayoutInput } from '@/lib/public-site/layout-resolver';
import type { LookDefinition, LookSwitchKind, SiteSection } from '@/lib/site-looks/looks';

export interface PresetTokens {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  headingFont?: string;
  bodyFont?: string;
}

/** Branding fields resolveTheme reads (color + font tokens). */
export interface PreviewBranding {
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
  fontHeading?: string | null;
  fontBody?: string | null;
}

function isLayoutId(v: unknown): v is LayoutId {
  return typeof v === 'string' && (LAYOUT_IDS as readonly string[]).includes(v);
}

/**
 * The layout to preview: the override slug when it's a valid layout id,
 * otherwise the community's resolved layout (saved branding → type default).
 */
export function resolvePreviewLayoutId(
  branding: BrandingLayoutInput | null | undefined,
  layoutOverride: string | null | undefined,
  communityType: CommunityType,
): LayoutId {
  if (isLayoutId(layoutOverride)) return layoutOverride;
  return resolveLayoutId(branding, communityType);
}

/**
 * Returns a branding object with the selected preset's tokens layered over the
 * saved branding (preset wins). When no preset tokens are supplied the saved
 * branding is returned unchanged. The result is fed straight to resolveTheme.
 * Preset token field names (headingFont/bodyFont) are mapped to branding field
 * names (fontHeading/fontBody).
 */
export function applyPresetTokensToBranding<T extends PreviewBranding>(
  branding: T | null,
  presetTokens: PresetTokens | null | undefined,
): T | PreviewBranding | null {
  if (!presetTokens) return branding;
  const base: PreviewBranding = branding ?? {};
  return {
    ...base,
    ...(presetTokens.primaryColor !== undefined ? { primaryColor: presetTokens.primaryColor } : {}),
    ...(presetTokens.secondaryColor !== undefined ? { secondaryColor: presetTokens.secondaryColor } : {}),
    ...(presetTokens.accentColor !== undefined ? { accentColor: presetTokens.accentColor } : {}),
    ...(presetTokens.headingFont !== undefined ? { fontHeading: presetTokens.headingFont } : {}),
    ...(presetTokens.bodyFont !== undefined ? { fontBody: presetTokens.bodyFont } : {}),
  };
}

/**
 * The `blocks` a layout renders for a page that is only a PLAN: the home page
 * as `planLookSwitch` would leave it, which a look preview shows instead of the
 * saved rows.
 *
 * The plan hands back sections in page order and no slots, so a block's order is
 * its place in the list. A section the plan kept from the page keeps its row id;
 * one a look supplied has no row, so it gets an id past every real one. A layout
 * needs only that the ids are unique on the page (React keys, the anchors Quick
 * links lands on); nothing looks a block up by it.
 */
export function plannedSectionsToBlocks(sections: readonly SiteSection[]): SiteBlock[] {
  let nextId = Math.max(0, ...sections.map((section) => section.id ?? 0)) + 1;
  return sections.map((section, index) => ({
    id: section.id ?? nextId++,
    blockType: section.blockType,
    blockOrder: index + 1,
    content: section.content,
  }));
}

/**
 * The branding a look preview paints: what a renderer would read after choosing
 * that look's card. `draftLookSwitch` writes by the plan's `kind`, and so does
 * this, so a card can never paint colours its choice would not leave. The one
 * that could lie is the live look's: its stock colour set is not the live site's
 * once a manager has published their own colours.
 *
 * - `switch`: the look's layout, colour set, colours and fonts, drafted over
 *   whatever is drafted. Custom colours are the manager's own and are never
 *   drafted by a switch, so they stay as the draft has them, else as live.
 * - `already-drafted`: nothing is written, so the draft as it stands, including
 *   a colour changed after picking the look.
 * - `live-look`: nothing is written, and no other layout is drafted: the live
 *   look. A colour edit that is only pending stays pending (choosing this card
 *   does not touch it) but is not what is live, and this is the card that says
 *   "Live now".
 * - `back-to-live`: the drafted layout, colour set, colours and fonts are
 *   withdrawn and the live ones stand again; custom colours are not withdrawn,
 *   so the draft's, if it has any, are still there.
 *
 * `presetTokens` are the look's colour set's, as the catalog has them, and only
 * a `switch` uses them; none (the set is not in the catalog) leaves the colours
 * the community has. Pure: `branding` is not changed, and the result has no
 * `draftLook`.
 */
export function resolveLookPreviewBranding(
  kind: LookSwitchKind,
  branding: CommunityBranding,
  look: Pick<LookDefinition, 'layoutId' | 'presetSlug'>,
  presetTokens: PresetTokens | null | undefined,
): CommunityBranding {
  switch (kind) {
    case 'switch': {
      // `resolveDesign`'s look: the colour set's colours and fonts, with the layout and the set's slug.
      const design = {
        ...applyPresetTokensToBranding({}, presetTokens),
        layoutId: look.layoutId,
        themePresetSlug: look.presetSlug,
      } as SiteLook;
      return effectiveLook({ ...branding, draftLook: { ...branding.draftLook, ...design } }, { includeDraft: true });
    }
    case 'already-drafted':
      return effectiveLook(branding, { includeDraft: true });
    case 'live-look':
      return effectiveLook(branding, { includeDraft: false });
    case 'back-to-live': {
      const drafted = branding.draftLook ?? {};
      const customColours: SiteLook =
        'customCssOverrides' in drafted ? { customCssOverrides: drafted.customCssOverrides } : {};
      return effectiveLook({ ...branding, draftLook: customColours }, { includeDraft: true });
    }
  }
}
