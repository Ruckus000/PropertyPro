import localFont from 'next/font/local';

/**
 * The public association site's Inter.
 *
 * A community's theme names its fonts as CSS family names: `THEME_DEFAULTS` is
 * `'Inter'` for both heading and body, and `toFontLinks` skips fetching it
 * because Inter was "self-hosted via next/font". The public site renders text as
 * `font-family: var(--theme-font-body, Inter), var(--font-sans), sans-serif`
 * (Tailwind `font-body`, same shape for `font-heading`), so the family called
 * `Inter` has to exist on the page, and it used to exist only because the root
 * layout loaded Inter for the whole app. When the app moved to Geist the root
 * stopped loading it, `Inter` matched nothing, and the fallback `--font-sans`
 * (now Geist) painted every default-themed community's body text.
 *
 * The public site is community-branded and outside the Geist redesign, so it
 * loads the same vendored file itself rather than depending on the app's font.
 * A community that picks another body font is untouched: its Google font is
 * linked and listed first, ahead of this one.
 *
 * The CSS family name `next/font/local` emits is the name of the CONST the call
 * is assigned to, not the file name or the `variable`: this one is called
 * `inter` on purpose, because family names are case-insensitive and `inter` is
 * what lets `Inter` match. Renaming the const to anything else (the first
 * draft called it `siteInter`) emits a family nothing asks for and the site
 * falls back to Geist with no error. The marketing layout has a const `inter`
 * for the same file and descriptors, and the two never share a page; keep them
 * identical, or the families silently merge (see the note in `app/layout.tsx`).
 *
 * The `variable` class is applied on every `.site-frame` render root, which
 * is what pulls this @font-face into the page. The variable itself is unused.
 */
const inter = localFont({
  src: '../../app/fonts/inter-latin-var.woff2',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
  variable: '--font-site-inter',
});

export const SITE_FONT_CLASS = inter.variable;
