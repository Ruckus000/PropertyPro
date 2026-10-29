/**
 * WCAG contrast gate for a community's custom brand colours.
 *
 * ## Why this takes RESOLVED colours rather than raw branding
 *
 * `communities.branding` is not what the public site paints. `resolveTheme()`
 * (packages/theme) falls back to `THEME_DEFAULTS` for any value that fails its
 * hex test, and Pro `customCssOverrides` are layered on top. Checking raw
 * branding would therefore flag colours the site never renders and miss the
 * ones it does.
 *
 * Resolving lives in `packages/theme`, which `packages/shared` does not depend
 * on (shared's only dependency is zod, deliberately). So the caller resolves and
 * passes the result in. That also keeps this module pure and trivially
 * testable, which a gate that can block a publish deserves to be.
 *
 * ## What is checked, and what is deliberately not
 *
 * Only three theme variables are actually consumed by the token system:
 * `--theme-primary`, `--theme-primary-hover` and `--theme-accent`
 * (packages/tokens/src/semantic.ts). The pairs below are the ones that put text
 * on a brand colour or a brand colour on a surface.
 *
 * `--theme-secondary` is consumed by no token, but three of the four looks paint
 * it behind text directly: Heritage's page, and the alternating section bands of
 * Bayfront and Palm Grove. So it is checked exactly when the caller says the
 * site's layout paints it (`layoutPaintsSecondary`) and passes it: the grey caption
 * text (`--text-secondary`) on it at 4.5:1, which is the lightest text the looks
 * set there, so passing it means the near-black body text passes too; and the
 * primary as headings on it at 3:1. Both are advisory even at the write path. A
 * legacy layout paints none of it, and its sites see nothing new.
 *
 * The accent is checked as the site's look paints it (`lookAccent`): the white or
 * default dark text a look sets on its accent, or a text accent on white and on
 * the secondary colour. Without a look, as on every legacy layout, it keeps the
 * original pair, default dark text on the accent.
 *
 * NOT checked, on purpose:
 *   - `--theme-primary-hover`, which is `darkenHex(primary, 15)` — a monotone
 *     luminance reduction against white, so if the primary/white pair passes,
 *     hover passes. Pinned as a property test rather than a runtime check.
 *   - `--theme-secondary` on a layout that does not paint it. Warning a PM about
 *     a colour that paints zero pixels would be superstition.
 *   - Fonts, which are not a contrast concern.
 */
import type { Issue, IssueSeverity } from './types';

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/**
 * Strict 6-digit `#RRGGBB` only. Returns `null` for anything else — never a
 * fallback colour, because a gate that silently substitutes a passing value for
 * an unparseable one is not a gate.
 *
 * 3-digit hex is rejected on purpose, and this exposes a real inconsistency in
 * the codebase: `resolveTheme`'s regex accepts `#abc` while the branding write
 * path and the custom-override path both require six digits. Worse, `darkenHex`
 * parses its input as a single integer, so a 3-digit value silently produces a
 * nonsense hover colour. `contrastIssues` reports 3-digit input rather than
 * quietly accepting it.
 */
export function parseHex(input: unknown): Rgb | null {
  if (typeof input !== 'string') return null;
  if (!/^#[0-9a-fA-F]{6}$/.test(input)) return null;
  return {
    r: parseInt(input.slice(1, 3), 16),
    g: parseInt(input.slice(3, 5), 16),
    b: parseInt(input.slice(5, 7), 16),
  };
}

/** WCAG 2.x relative luminance for an sRGB colour. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (raw: number) => {
    const c = raw / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * WCAG contrast ratio, in [1, 21]. Symmetric in its arguments.
 * Returns `null` when either colour fails to parse.
 */
export function contrastRatio(a: string, b: string): number | null {
  const rgbA = parseHex(a);
  const rgbB = parseHex(b);
  if (!rgbA || !rgbB) return null;
  const lumA = relativeLuminance(rgbA);
  const lumB = relativeLuminance(rgbB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG 2.1 AA for normal-size body text. */
export const AA_NORMAL_TEXT_RATIO = 4.5;

/** WCAG 2.1 AA for large text, which headings are. */
export const AA_LARGE_TEXT_RATIO = 3;

/**
 * Fixed sides of each checked pair, mirroring
 * `packages/tokens/src/primitives.ts`. Named rather than inlined so the tie to
 * the token ramp is visible when one of them changes.
 */
const TEXT_INVERSE = '#FFFFFF'; // gray-0    → text.inverse
const SURFACE_PAGE = '#FBF7F1'; // sand-50   → surface.page
const BRAND_SURFACE = '#FCF1ED'; // coral-50 → status.brand.background
const TEXT_PRIMARY = '#111827'; // gray-900  → text.primary
const TEXT_SECONDARY = '#4B5563'; // gray-600  → text.secondary
const SURFACE_CARD = '#FFFEFC'; // sand-0    → surface.card, the "white" the looks paint

/** The theme colours this gate can see, already resolved by the caller. */
export interface ResolvedBrandColors {
  primaryColor: string;
  accentColor: string;
  /**
   * Checked only when `layoutPaintsSecondary` says the layout paints it. Absent,
   * nothing on the secondary colour is checked.
   */
  secondaryColor?: string;
}

/** How a look paints its accent colour (its `LOOK_STYLES` entry in apps/web). */
export interface LookAccent {
  /** `text`: the accent is a text colour; `background`: text sits on it. */
  accentUse: 'text' | 'background';
  /** The text on an accent background: white (`inverse`) or default dark (`text`). Unused for `text`. */
  onAccent: 'inverse' | 'text';
}

export interface ContrastIssueOptions {
  /**
   * Severity for a failing ratio.
   *
   * Use `'error'` at the **branding write path**, where refusing can actually
   * prevent the bad state. Use `'warning'` at **publish**: branding is unstaged
   * and already live on the public site, so blocking a publish cannot un-ship a
   * bad ratio — it only stops the PM shipping unrelated copy fixes. When Phase 8
   * gives branding a draft layer, publish flips to `'error'` by changing this
   * one argument.
   */
  severity: IssueSeverity;
  /**
   * Whether the site's layout paints the secondary colour behind text (a look's
   * page or its section bands). Only then are text and headings checked on it.
   * Absent means no, which is right for every legacy layout.
   */
  layoutPaintsSecondary?: boolean;
  /**
   * How the site's look paints its accent; the accent is checked as it is
   * actually used. Absent, as for every legacy layout, keeps the original pair:
   * default dark text on the accent.
   */
  lookAccent?: LookAccent;
}

interface CheckedPair {
  field: string;
  /** Which resolved colour participates. */
  colorKey: keyof ResolvedBrandColors;
  /** The other side: a fixed token colour, or another of the resolved colours. */
  against: string | { colorKey: keyof ResolvedBrandColors };
  label: string;
  /** The ratio the pair needs. Absent means body text, 4.5:1. */
  minimum?: number;
  /** Some pairs are advisory even at the write path. */
  alwaysWarning?: boolean;
  /** Checked only when the layout paints the secondary colour (`layoutPaintsSecondary`). */
  onSecondary?: true;
}

/** The primary colour's pairs, the same on every layout. */
const PRIMARY_PAIRS: CheckedPair[] = [
  {
    field: 'primaryColor',
    colorKey: 'primaryColor',
    against: TEXT_INVERSE,
    label: 'white text on your primary colour (buttons)',
  },
  {
    field: 'primaryColor',
    colorKey: 'primaryColor',
    against: SURFACE_PAGE,
    label: 'your primary colour as text on the page background (links and headings)',
    // Advisory, and this one is worth explaining, because the obvious reading
    // of the roadmap makes it blocking.
    //
    // The app's OWN DEFAULT primary — coral-600 #C2533A — scores 4.28:1 against
    // sand-50, below AA for normal text. Blocking here would mean every
    // community that never changed its brand colour is refused a publish,
    // including for an unrelated typo fix. A gate whose first casualty is the
    // shipped default is not a gate, it is an outage.
    //
    // It is also not clearly a real failure: primary-on-page is used for
    // eyebrows, links and headings, and AA for large text is 3:1, which
    // #C2533A clears comfortably. The genuinely load-bearing check is
    // white-on-primary above (filled buttons, unambiguously normal text),
    // which the default passes at >4.5:1.
    //
    // Flagged for the design system rather than papered over: if coral-600 is
    // meant to carry normal-size body text on sand-50, the ramp needs a darker
    // step for that role.
    alwaysWarning: true,
  },
  {
    field: 'primaryColor',
    colorKey: 'primaryColor',
    against: BRAND_SURFACE,
    label: 'your primary colour as text on the brand tint',
    alwaysWarning: true,
  },
];

/** The original accent pair: every legacy layout's, and a look's whose accent sits under dark text. */
const DARK_TEXT_ON_ACCENT: CheckedPair = {
  field: 'accentColor',
  colorKey: 'accentColor',
  against: TEXT_PRIMARY,
  label: 'default dark text on your accent colour',
  alwaysWarning: true,
};

/** A look whose accent sits under white text. */
const WHITE_TEXT_ON_ACCENT: CheckedPair = {
  field: 'accentColor',
  colorKey: 'accentColor',
  against: TEXT_INVERSE,
  label: 'white text on your accent colour',
  alwaysWarning: true,
};

/** A look whose accent is a text colour: on white, and on the secondary colour where the layout paints it. */
const ACCENT_AS_TEXT: CheckedPair[] = [
  {
    field: 'accentColor',
    colorKey: 'accentColor',
    against: SURFACE_CARD,
    label: 'your accent colour as text on white',
    alwaysWarning: true,
  },
  {
    field: 'accentColor',
    colorKey: 'accentColor',
    against: { colorKey: 'secondaryColor' },
    label: 'your accent colour as text on your secondary colour',
    alwaysWarning: true,
    onSecondary: true,
  },
];

/**
 * The accent pairs to check: what the layout actually paints. A legacy layout
 * (no `look`) keeps the original pair. All are advisory even at the write path,
 * as the accent pair always has been.
 */
function accentPairs(look: LookAccent | undefined): CheckedPair[] {
  if (look === undefined) return [DARK_TEXT_ON_ACCENT];
  if (look.accentUse === 'text') return ACCENT_AS_TEXT;
  return [look.onAccent === 'inverse' ? WHITE_TEXT_ON_ACCENT : DARK_TEXT_ON_ACCENT];
}

/**
 * The secondary colour, where a look paints it behind text. Advisory: the
 * colour has never been checked, and must not start blocking anything.
 */
const SECONDARY_PAIRS: CheckedPair[] = [
  {
    field: 'secondaryColor',
    colorKey: 'secondaryColor',
    // The lightest text the looks set on it (captions, notes): a section's
    // `text-content-secondary`. Where it passes, near-black body text does too.
    against: TEXT_SECONDARY,
    label: 'grey caption text on your secondary colour',
    alwaysWarning: true,
    onSecondary: true,
  },
  {
    field: 'secondaryColor',
    colorKey: 'secondaryColor',
    against: { colorKey: 'primaryColor' },
    label: 'your primary colour as headings on your secondary colour',
    minimum: AA_LARGE_TEXT_RATIO,
    alwaysWarning: true,
    onSecondary: true,
  },
];

/**
 * Contrast issues for a community's resolved brand colours.
 *
 * An unparseable colour is always an `error` naming its field — that is a
 * malformed value, not a taste question, and it means the site is silently
 * rendering a fallback the PM did not choose. The one exception is the secondary
 * colour, reported as a warning: its check is advisory only.
 */
export function contrastIssues(
  colors: ResolvedBrandColors,
  { severity, layoutPaintsSecondary = false, lookAccent }: ContrastIssueOptions,
): Issue[] {
  const issues: Issue[] = [];
  const seenUnparseable = new Set<string>();

  for (const pair of [...PRIMARY_PAIRS, ...accentPairs(lookAccent), ...SECONDARY_PAIRS]) {
    // The secondary is checked only where the layout paints it, and only when the
    // caller passed it.
    if (pair.onSecondary && (!layoutPaintsSecondary || colors.secondaryColor === undefined)) continue;

    const value = colors[pair.colorKey];
    if (value === undefined || parseHex(value) === null) {
      if (!seenUnparseable.has(pair.colorKey)) {
        seenUnparseable.add(pair.colorKey);
        issues.push({
          field: pair.field,
          message: `"${String(value)}" is not a 6-digit hex colour like #C2533A, so the site falls back to its default instead.`,
          severity: pair.colorKey === 'secondaryColor' ? 'warning' : 'error',
        });
      }
      continue;
    }

    const against = typeof pair.against === 'string' ? pair.against : colors[pair.against.colorKey];
    const minimum = pair.minimum ?? AA_NORMAL_TEXT_RATIO;
    // An unparseable `against` colour is reported by its own pair, not here.
    const ratio = against === undefined ? null : contrastRatio(value, against);
    if (ratio === null || ratio >= minimum) continue;

    // Naming WCAG AA and the audience is deliberate. This advisory is
    // non-blocking by design (see the long note on `contrastIssues` in
    // PublishSheet), which means its only job is to make an administrator's
    // choice an INFORMED one. "Below the ratio needed to stay readable" reads as
    // a style nitpick; association websites are public accommodations and
    // Florida is a high-volume jurisdiction for website accessibility claims, so
    // the copy should say what the standard is and who is affected.
    // See docs/audits/2026-08-09-legal-risk-audit.md F-12.
    issues.push({
      field: pair.field,
      message: `${pair.label} has a contrast ratio of ${ratio.toFixed(2)}:1, below the ${minimum}:1 required by WCAG 2.1 AA. Residents with low vision may be unable to read this text. Publishing is still allowed, but the association carries the accessibility risk.`,
      severity: pair.alwaysWarning ? 'warning' : severity,
    });
  }

  return issues;
}
