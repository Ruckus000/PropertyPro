/**
 * Every StatusVariant must produce Tailwind utilities that actually EMIT CSS.
 *
 * WHY THIS EXISTS — a Tailwind class that resolves to nothing is not an error.
 * It emits no rule, and the element renders with no colour at all. Nothing
 * throws, nothing logs, no guard fails. `guard:design-tokens` cannot see it: it
 * checks that raw palette classes are GONE, not that the semantic class you
 * used resolves to anything. This is the same failure class that
 * `scripts/verify-semantic-css.ts` was written for, and the same one
 * CLAUDE.md documents for slash-opacity on semantic tokens.
 *
 * StatusDot / StatusBadge(dotOnly) hit it two independent ways at once:
 *
 *   1. NOT SCANNABLE — the dot background was built at runtime with
 *      `classes.text.replace("text-", "bg-")`, and getStatusClasses() built all
 *      four classes from a template literal. Tailwind's scanner reads raw file
 *      TEXT; it never evaluates either. So `bg-status-info` was emitted only if
 *      some unrelated file happened to write that exact string. Measured against
 *      a real `tailwindcss -c apps/web/tailwind.config.ts` build: success /
 *      warning / danger were emitted (7 / 6 / 17 stray literal uses elsewhere in
 *      the tree), while info / neutral / brand / owner / board were NOT — five of
 *      eight variants rendered an invisible dot.
 *
 *   2. NOT DECLARED — `owner` and `board` were missing from the `status` colour
 *      family in apps/web/tailwind.config.ts entirely, so those utilities did
 *      not exist at any spelling. Writing them statically, or safelisting them,
 *      emits nothing on its own; the family has to be declared. (apps/admin's
 *      config already carries them, with a comment noting web did not.)
 *
 * Both checks are needed. Declared-but-unscannable and scannable-but-undeclared
 * each render exactly the same invisible element.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  getStatusClasses,
  semanticColors,
  type StatusVariant,
} from '@propertypro/ui';
import webTailwindConfig from '../../tailwind.config';

const STATUS_VARIANTS = Object.keys(semanticColors.status) as StatusVariant[];

/** The file getStatusClasses lives in — inside apps/web's Tailwind content globs. */
const STATUS_SOURCE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../packages/ui/src/constants/status.ts',
);

/** The component that renders the dot from those classes. */
const STATUS_BADGE_SOURCE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../src/components/shared/status-badge.tsx',
);

/** The `status` colour family as apps/web's Tailwind config declares it. */
const statusTheme = (
  webTailwindConfig.theme?.extend?.colors as
    | Record<string, Record<string, string>>
    | undefined
)?.status;

/**
 * Tailwind matches a whole candidate: `bg-status-info` is NOT inside
 * `bg-status-info-bg`, and equally not inside `hover:bg-status-info` — that is
 * a different candidate. Both edges are anchored, or a longer token ending in
 * the class name would count as a match and pass the check vacuously.
 */
function appearsAsCompleteCandidate(source: string, className: string): boolean {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![a-zA-Z0-9-])${escaped}(?![a-zA-Z0-9-])`).test(source);
}

describe('status variant CSS emission', () => {
  it('has a non-empty set of variants to check', () => {
    // A scan that examined nothing must not pass.
    expect(STATUS_VARIANTS.length).toBeGreaterThanOrEqual(8);
    expect(STATUS_VARIANTS).toEqual(
      expect.arrayContaining(['owner', 'board', 'info', 'neutral', 'brand']),
    );
  });

  it("declares every variant's full family in apps/web's Tailwind config", () => {
    expect(statusTheme, 'theme.extend.colors.status is missing').toBeDefined();

    const theme = statusTheme ?? {};
    const keys = STATUS_VARIANTS.flatMap((variant) => [
      variant,
      `${variant}-bg`,
      `${variant}-border`,
      `${variant}-subtle`,
    ]);

    // Presence and emptiness are DIFFERENT defects with different fixes, so
    // report them separately rather than collapsing both into "undeclared".
    const undeclared = keys
      .filter((key) => !(key in theme))
      .map((key) => `status.${key}`);
    expect(undeclared).toEqual([]);

    const empty = keys
      .filter((key) => key in theme && !theme[key])
      .map((key) => `status.${key}`);
    expect(empty, 'declared but resolves to an empty value').toEqual([]);
  });

  it('exposes a statically-written dot background class for every variant', () => {
    for (const variant of STATUS_VARIANTS) {
      expect(
        getStatusClasses(variant),
        `getStatusClasses("${variant}") has no dot class`,
      ).toHaveProperty('dot');
    }
  });

  it('never assembles a status class at runtime', () => {
    // The literal-presence check below is necessary but not sufficient: a dead
    // literal map left beside a template-literal builder still satisfies it
    // (Tailwind would scan the dead map and emit the CSS anyway). This asserts
    // the defect MECHANISM is gone, so reintroducing it reddens a test even if
    // stray literals elsewhere would have masked it.
    const sources = [STATUS_SOURCE, STATUS_BADGE_SOURCE].map((file) => ({
      file,
      text: fs.readFileSync(file, 'utf8'),
    }));

    for (const { file, text } of sources) {
      // Strip both comment forms before matching: the banned patterns are
      // quoted in prose in the docblocks that explain why they are banned, and
      // warning the next reader with a `//` note is the natural thing to do —
      // matching that would redden this test with no real defect. (Same trap
      // CLAUDE.md records for guard:design-tokens counting raw-palette classes
      // inside comments.)
      //
      // Whole-line `//` comments ONLY. Stripping from `//` to end-of-line would
      // delete real code on any line carrying a trailing comment — a line like
      // `dot: classes.text.replace("text-", "bg-"), // legacy` would be erased
      // along with the defect it carries, turning this guard green on exactly
      // the case it exists to catch. A trailing comment quoting a banned
      // pattern is the one accepted false positive; move it to its own line.
      const code = text
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      const label = path.basename(file);

      expect(
        code,
        `${label} builds a status class with a template literal`,
      ).not.toMatch(/`(?:text|bg|border|ring)-status-\$\{/);

      expect(
        code,
        `${label} derives a status class with .replace()`,
      ).not.toMatch(/\.replace\(\s*["'`]text-/);
    }
  });

  it('writes every class it returns as a literal Tailwind can scan', () => {
    const source = fs.readFileSync(STATUS_SOURCE, 'utf8');

    const unscannable = STATUS_VARIANTS.flatMap((variant) =>
      Object.values(getStatusClasses(variant) as Record<string, string>).filter(
        (className) =>
          typeof className === 'string' &&
          !appearsAsCompleteCandidate(source, className),
      ),
    );

    expect(unscannable).toEqual([]);
  });
});
