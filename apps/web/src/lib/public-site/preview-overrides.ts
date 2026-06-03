/**
 * Pure helpers for the wizard live-preview route. They turn the in-wizard
 * layout/preset SELECTION (passed as query overrides) into the layout id +
 * branding that the real public-site layout renders with — without persisting
 * anything. Kept pure (no I/O) so they're unit-testable.
 */
import { LAYOUT_IDS, type LayoutId } from '@/components/public-site/layouts/types';
import type { CommunityType } from '@propertypro/shared';
import { resolveLayoutId, type BrandingLayoutInput } from '@/lib/public-site/layout-resolver';

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
