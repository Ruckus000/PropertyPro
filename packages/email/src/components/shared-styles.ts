import { emailColors } from '@propertypro/tokens/email';

/** H1 heading — 20px semibold zinc-950 */
export const heading: React.CSSProperties = {
  fontSize: '20px',
  fontWeight: 600,
  color: emailColors.foreground,
  margin: '0 0 20px 0',
  letterSpacing: '-0.3px',
  lineHeight: '1.3',
};

/** Body paragraph — 15px regular zinc-950 */
export const body: React.CSSProperties = {
  fontSize: '15px',
  color: emailColors.foreground,
  lineHeight: '1.65',
  margin: '0 0 14px 0',
};

/** Fine print / disclaimer — 13px zinc-500 */
export const small: React.CSSProperties = {
  fontSize: '13px',
  color: emailColors.mutedForeground,
  lineHeight: '1.5',
  margin: '0',
};

/** Small with top margin (for use after buttons) */
export const smallSpaced: React.CSSProperties = {
  ...small,
  margin: '20px 0 0 0',
};

/** Table label cell — 13px zinc-500 */
export const labelCell: React.CSSProperties = {
  fontSize: '13px',
  color: emailColors.mutedForeground,
  padding: '3px 12px 3px 0',
  verticalAlign: 'top' as const,
};

/** Table value cell — 14px zinc-950 medium */
export const valueCell: React.CSSProperties = {
  fontSize: '14px',
  color: emailColors.foreground,
  padding: '3px 0',
  fontWeight: 500,
  verticalAlign: 'top' as const,
};

/** Wrapper style for button section with proper spacing */
export const buttonSection: React.CSSProperties = {
  margin: '20px 0 0 0',
};
