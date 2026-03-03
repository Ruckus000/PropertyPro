import type { CommunityTheme } from './types';

const FONT_WEIGHTS = 'wght@400;500;600;700';
const GOOGLE_FONTS_BASE = 'https://fonts.googleapis.com/css2?family=';

function toFontLink(fontName: string): string {
  const encodedName = fontName.replaceAll(' ', '+');
  return `${GOOGLE_FONTS_BASE}${encodedName}:${FONT_WEIGHTS}&display=swap`;
}

export function toFontLinks(theme: CommunityTheme): string[] {
  const fonts = Array.from(new Set([theme.fontHeading, theme.fontBody]));

  return fonts.map(toFontLink);
}
