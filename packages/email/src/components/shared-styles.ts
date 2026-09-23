/**
 * Florida Modern type scale as plain style objects. Prefer the blocks in
 * `email-blocks.tsx` (`Headline`, `Paragraph`, `FinePrint`, `DataRows`) in
 * templates; these exist for the public `emailStyles` export and for one-off
 * elements inside a block.
 */
import { emailTheme as c, serif } from './theme';

/** H1 — 30px Fraunces, the event. */
export const heading: React.CSSProperties = {
  fontFamily: serif,
  fontSize: '30px',
  fontWeight: 600,
  color: c.ink,
  margin: '0 0 18px 0',
  letterSpacing: '-0.7px',
  lineHeight: '1.12',
};

/** Body paragraph — 16px, body grey, 1.7 leading. */
export const body: React.CSSProperties = {
  fontSize: '16px',
  color: c.body,
  lineHeight: '1.7',
  margin: '0 0 16px 0',
};

/** Fine print — 12px meta grey. */
export const small: React.CSSProperties = {
  fontSize: '12px',
  color: c.meta,
  lineHeight: '1.6',
  margin: '0',
};

/** Fine print with top margin (after an action row). */
export const smallSpaced: React.CSSProperties = {
  ...small,
  margin: '20px 0 0 0',
};

/** Data-row label — 12px body grey. */
export const labelCell: React.CSSProperties = {
  fontSize: '12px',
  color: c.body,
  padding: '14px 12px 14px 0',
  verticalAlign: 'top' as const,
};

/** Data-row value — 14px ink, medium. */
export const valueCell: React.CSSProperties = {
  fontSize: '14px',
  color: c.ink,
  padding: '14px 0',
  fontWeight: 500,
  verticalAlign: 'top' as const,
};

/** Spacing wrapper above a button. */
export const buttonSection: React.CSSProperties = {
  margin: '6px 0 0 0',
};
