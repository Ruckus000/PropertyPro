/**
 * The community site's theme as CSS custom properties — for the public page,
 * its previews, and the editor canvas.
 *
 * ## Why `toCssVars` alone is not enough
 *
 * The block views and the layout chrome colour themselves with semantic
 * classes: `bg-primary` is `var(--interactive-primary)`, `text-accent` is
 * `var(--brand-accent)`. `tokens.css` declares those ON `:root` as
 * `var(--theme-primary, <coral>)`, meaning "follow the community theme when
 * one is injected". But a custom property is resolved where it is DECLARED and
 * inherited as a value: `--interactive-primary` is computed once on `:root`,
 * where no `--theme-primary` exists, and every descendant inherits the coral.
 * Setting `--theme-primary` on a wrapper `<div>` — which is what every site
 * render path does — changes nothing a semantic class paints. Only the header,
 * which styles its background inline, ever followed the colour set; the hero,
 * the buttons and the accents stayed coral on every community.
 *
 * So the aliases are re-declared HERE, on the same element that carries the
 * `--theme-*` values, as references to them. Declared on that element, they
 * resolve against that element's theme values, and the Pro custom colours
 * (which write `--theme-*` too) are honoured for free.
 *
 * This is deliberately a site-surface helper and not a change to `toCssVars`:
 * the signed-in app shells also inject `--theme-*`, and re-aliasing there
 * would recolour the whole application's primary controls per community,
 * which is a product decision nobody has made.
 */
import {
  customCssOverridesToCssVars,
  toCssVars,
  type CommunityTheme,
} from '@propertypro/theme';

/**
 * The semantic tokens `tokens.css` defines in terms of `--theme-*`, re-declared
 * as the same references. Keep in step with the "Brand-overridable" block in
 * `packages/ui/src/styles/tokens.css`.
 */
export const SITE_THEME_ALIASES: Readonly<Record<string, string>> = {
  '--interactive-primary': 'var(--theme-primary)',
  '--interactive-primary-hover': 'var(--theme-primary-hover)',
  '--brand-accent': 'var(--theme-accent)',
  '--status-brand': 'var(--theme-primary)',
};

/**
 * Everything a site render root puts in its `style`: the theme values, the
 * validated Pro overrides on top, and the aliases that make the semantic
 * classes read them.
 */
export function siteThemeCssVars(
  theme: CommunityTheme,
  customCssOverrides?: unknown,
): Record<string, string> {
  return {
    ...toCssVars(theme),
    ...customCssOverridesToCssVars(customCssOverrides),
    ...SITE_THEME_ALIASES,
  };
}
