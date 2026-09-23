import { emailTheme, type EmailTone } from '@propertypro/tokens/email';

export { emailTheme };
export type { EmailTone };

/** Display face. Fraunces only loads in Apple Mail / iOS; Georgia carries it everywhere else. */
export const serif = "'Fraunces', Georgia, 'Times New Roman', serif";
/** Body face. Inter where @font-face is honoured, the platform UI face otherwise. */
export const sans =
  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
/** Codes, confirmation numbers, filenames — things people quote back. */
export const mono = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Courier New', monospace";

export interface ToneColors {
  /** 4px accent rule / filled button background. */
  rule: string;
  /** Label + link colour on light surfaces. */
  text: string;
  /** Pill / alert-panel background. */
  bg: string;
  /** Pill / alert-panel border. */
  border: string;
  /** Text inside an alert panel. */
  ink: string;
}

export function toneColors(tone: EmailTone): ToneColors {
  if (tone === 'coral') {
    return {
      rule: emailTheme.coral,
      text: emailTheme.link,
      bg: emailTheme.coralSubtle,
      border: emailTheme.coralBorder,
      ink: emailTheme.link,
    };
  }
  return emailTheme[tone];
}

/** Colour a filled button in `tone`. Coral uses the brand fill, the rest their text-strength shade (all ≥4.5:1 under cream text). */
export function toneFill(tone: EmailTone): string {
  return tone === 'coral' ? emailTheme.coral : toneColors(tone).text;
}

const HEX_COLOUR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * A community-supplied colour, or undefined when it is not a plain hex value.
 *
 * `branding.accentColor` is interpolated into inline `style` attributes, where a
 * value such as `red;background:url(https://tracker)` would inject a second
 * declaration — an open-tracking pixel on association mail. Only a bare hex
 * colour is accepted.
 */
export function safeHexColour(value: string | undefined): string | undefined {
  return value && HEX_COLOUR.test(value.trim()) ? value.trim() : undefined;
}

/** A community-supplied image URL, or undefined unless it is absolute https. */
export function safeHttpsUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value).protocol === 'https:' ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Up to two initials for the association monogram: "Sunset Palms HOA" → "SP". */
export function monogram(name: string): string {
  const words = name
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((word) => word.length > 0 && !/^(the|of|at|and)$/i.test(word));
  const letters = words.slice(0, 2).map((word) => word[0]!.toUpperCase());
  return letters.join('') || 'PP';
}
