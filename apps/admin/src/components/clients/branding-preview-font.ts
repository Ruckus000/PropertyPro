import localFont from 'next/font/local';

/**
 * Inter, for the branding preview in `CommunityWebsiteEditor` only.
 *
 * The preview paints a community's own fonts as `style={{ fontFamily:
 * form.fontBody }}`, a bare CSS family name with no fallback, and the default
 * theme's fonts are `Inter`. The public site renders that same name from a
 * vendored Inter, and the console used to load Inter for the whole app. When
 * the console moved to Geist its Inter was deleted, so an Inter-themed preview
 * matched no face and fell back to the browser default (often a serif),
 * misrepresenting the site it previews.
 *
 * This loads the same vendored file, scoped to the one component that needs it
 * rather than to the root layout. The CSS family `next/font/local` emits is the
 * name of the CONST the call is assigned to, so it is called `inter`: family
 * names are case-insensitive, which is what lets `Inter` match. Renaming it
 * emits a family nothing asks for and the preview falls back with no error.
 * `className` sets `font-family: Inter` on the preview wrapper, so a theme font
 * the console does not load falls back to Inter.
 *
 * ponytail: the console loads no Google fonts, so this preview shows Inter for
 * every family, while the public site renders the chosen one. Trigger: an
 * operator reports the preview differs from the live site.
 */
const inter = localFont({
  src: '../../app/fonts/inter-latin-var.woff2',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
});

export const BRANDING_PREVIEW_FONT_CLASS = inter.className;
