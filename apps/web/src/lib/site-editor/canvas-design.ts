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

/**
 * The canvas header logo from the LIVE branding query. Logos are not drafted
 * and the Design panel can change them while the editor is open, so the
 * server context's logo goes stale. Same rule as the public page: the site
 * logo (wordmark), else the square logo.
 *
 * Unchanged with no query data yet, and unchanged when a stored logo came back
 * without a URL: signing failed, which is not the same as the logo being
 * removed, and must not blank a header the server context drew correctly.
 */
export function applyLiveLogoToCanvas(
  context: CanvasContext | null,
  live:
    | {
        logoPath: string | null;
        logoUrl: string | null;
        siteLogoPath: string | null;
        siteLogoUrl: string | null;
      }
    | undefined,
): CanvasContext | null {
  if (!context || !live) return context;
  const unresolved = (live.logoPath && !live.logoUrl) || (live.siteLogoPath && !live.siteLogoUrl);
  if (unresolved) return context;
  return { ...context, community: { ...context.community, logoUrl: live.siteLogoUrl ?? live.logoUrl } };
}
