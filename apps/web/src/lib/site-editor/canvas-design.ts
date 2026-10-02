/**
 * The editor canvas in the DRAFT look (website builder v4).
 *
 * `loadCanvasContext` resolves the theme and layout once, on the server, from
 * the LIVE branding. The look is now drafted until Publish and changes while
 * the editor is open (the Design panel), so the canvas re-derives both from the
 * design query: the draft over the live look, resolved the way the public page
 * resolves it — `resolveTheme`, then the Pro custom colours on top.
 *
 * Pure: no I/O, so the canvas restyles the moment a save lands in the cache.
 */
import { isValidHexColor, type CommunityType, type SiteLook } from '@propertypro/shared';
import { ALLOWED_FONTS, resolveTheme } from '@propertypro/theme';
import { resolveLayoutId } from '@/lib/public-site/layout-resolver';
import type { CanvasContext } from './load-canvas-context';

export function applyDesignToCanvas(
  context: CanvasContext | null,
  design: { live: SiteLook; draft: SiteLook } | undefined,
): CanvasContext | null {
  if (!context || !design) return context;

  const look: SiteLook = { ...design.live, ...design.draft };
  const communityType = context.community.communityType as CommunityType;
  const theme = resolveTheme(look, context.community.name, communityType);
  const custom = look.customCssOverrides ?? {};
  const colour = (value: string | undefined, fallback: string) =>
    value !== undefined && isValidHexColor(value) ? value : fallback;
  const bodyFont =
    custom.bodyFont !== undefined && (ALLOWED_FONTS as readonly string[]).includes(custom.bodyFont)
      ? custom.bodyFont
      : theme.fontBody;

  return {
    ...context,
    theme: {
      primaryColor: colour(custom.primaryColor, theme.primaryColor),
      secondaryColor: colour(custom.secondaryColor, theme.secondaryColor),
      accentColor: colour(custom.accentColor, theme.accentColor),
      headingFont: theme.fontHeading,
      bodyFont,
    },
    layout: resolveLayoutId(look, communityType),
  };
}
