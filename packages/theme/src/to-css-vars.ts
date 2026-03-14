import { THEME_CSS_VARS, darkenHex } from './constants';
import type { CommunityTheme } from './types';

export function toCssVars(theme: CommunityTheme): Record<string, string> {
  return {
    [THEME_CSS_VARS.primaryColor]: theme.primaryColor,
    [THEME_CSS_VARS.primaryColorHover]: darkenHex(theme.primaryColor, 15),
    [THEME_CSS_VARS.secondaryColor]: theme.secondaryColor,
    [THEME_CSS_VARS.accentColor]: theme.accentColor,
    [THEME_CSS_VARS.fontHeading]: theme.fontHeading,
    [THEME_CSS_VARS.fontBody]: theme.fontBody,
    [THEME_CSS_VARS.logoUrl]: theme.logoUrl ?? 'none',
    [THEME_CSS_VARS.communityName]: theme.communityName,
  };
}
