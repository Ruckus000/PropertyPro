/**
 * The canvas's theme as CSS custom properties (website builder v4).
 *
 * The public-site views never read the `theme` prop for colour — they use
 * classes like `bg-primary` and `font-heading`, which resolve through the
 * `--theme-*` custom properties (`THEME_CSS_VARS`). On the public page those
 * are set on the page root from the live branding. In the editor they were set
 * ONCE, by the `(site-editor)` route layout, from the request's shell context —
 * which on the PM portal is no community at all, so the canvas painted the
 * platform default coral whatever the Design panel said. Choosing a template
 * or a colour set changed `context.theme`, and nothing read it.
 *
 * The canvas frame now sets the same custom properties the public page sets,
 * from the context the Design panel keeps current (`applyDesignToCanvas`), and
 * loads the chosen fonts, which the route layout only did for the default.
 *
 * Pure. The custom colours are already folded into `context.theme` by
 * `applyDesignToCanvas`, so the theme alone matches the public page's theme +
 * `customCssOverridesToCssVars`; `siteThemeCssVars` adds the aliases that make
 * the semantic classes read it (see that module for why they are needed).
 */
import type { CSSProperties } from 'react';
import { toFontLinks, type CommunityTheme } from '@propertypro/theme';
import { siteThemeCssVars } from '@/lib/public-site/site-theme-css-vars';
import type { CanvasContext } from './load-canvas-context';

export type CanvasThemeInput = Pick<CanvasContext, 'community' | 'theme'>;

/** The `CommunityTheme` shape the theme package works in, from the canvas context. */
export function canvasCommunityTheme({ community, theme }: CanvasThemeInput): CommunityTheme {
  return {
    primaryColor: theme.primaryColor,
    secondaryColor: theme.secondaryColor,
    accentColor: theme.accentColor,
    fontHeading: theme.headingFont,
    fontBody: theme.bodyFont,
    logoUrl: community.logoUrl,
    communityName: community.name,
    communityType: community.communityType,
  };
}

export interface CanvasThemeVars {
  /** Inline style for the frame: the `--theme-*` custom properties. */
  cssVars: CSSProperties;
  /** Google Fonts stylesheet URLs for the chosen fonts (none for self-hosted ones). */
  fontLinks: string[];
}

export function canvasThemeVars(context: CanvasThemeInput): CanvasThemeVars {
  const theme = canvasCommunityTheme(context);
  return {
    cssVars: siteThemeCssVars(theme) as CSSProperties,
    fontLinks: toFontLinks(theme),
  };
}
