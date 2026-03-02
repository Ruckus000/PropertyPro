import type { CommunityTheme } from './types';

/**
 * Generate Google Fonts <link> href URLs for the fonts used in this theme.
 *
 * Returns deduplicated array of stylesheet URLs.
 * Always requests weights 400, 500, 600, 700.
 */
export function toFontLinks(theme: CommunityTheme): string[] {
  const fonts = new Set<string>();
  fonts.add(theme.fontHeading);
  fonts.add(theme.fontBody);

  const links: string[] = [];
  for (const family of fonts) {
    const encodedFamily = family.replace(/ /g, '+');
    links.push(
      `https://fonts.googleapis.com/css2?family=${encodedFamily}:wght@400;500;600;700&display=swap`,
    );
  }

  return links;
}
