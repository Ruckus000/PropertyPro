import type { CommunityTheme } from './types';
import { THEME_CSS_VARS } from './constants';

/**
 * Convert a resolved CommunityTheme to a CSS custom properties map.
 * Returns: { '--theme-primary': '#2563EB', '--theme-font-heading': 'Inter', ... }
 *
 * Suitable for use in React `style` prop: `style={toCssVars(theme) as React.CSSProperties}`
 */
export function toCssVars(theme: CommunityTheme): Record<string, string> {
  const vars: Record<string, string> = {};

  const keys = Object.keys(THEME_CSS_VARS) as Array<keyof typeof THEME_CSS_VARS>;
  for (const key of keys) {
    const cssVar = THEME_CSS_VARS[key];
    const value = theme[key];
    if (value !== null && value !== undefined) {
      vars[cssVar] = String(value);
    }
  }

  return vars;
}
