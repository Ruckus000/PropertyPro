import { THEME_CSS_VARS, darkenHex } from './constants';
import type { CommunityTheme } from './types';

export function toCssVars(theme: CommunityTheme): Record<string, string> {
  return {
    [THEME_CSS_VARS.primaryColor]: theme.primaryColor,
    [THEME_CSS_VARS.primaryColorHover]: darkenHex(theme.primaryColor, 15),
    [THEME_CSS_VARS.secondaryColor]: theme.secondaryColor,
    [THEME_CSS_VARS.accentColor]: theme.accentColor,
    // Quoted: an unquoted "Source Sans 3" is not a valid family name (`3` is not an
    // identifier), which invalidates the whole font-family declaration that reads it.
    // Safe because resolveTheme only lets ALLOWED_FONTS through.
    [THEME_CSS_VARS.fontHeading]: `"${theme.fontHeading}"`,
    [THEME_CSS_VARS.fontBody]: `"${theme.fontBody}"`,
  };
}
