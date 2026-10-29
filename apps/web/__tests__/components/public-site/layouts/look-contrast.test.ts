/**
 * Every colour pair a look paints passes WCAG AA: 4.5:1 for body text, 3:1 for
 * headings.
 *
 * One side of each pair is the look's preset as migration 0097 seeds it
 * (mirrored in `__tests__/fixtures/site-look-presets.ts`). The other is the
 * design token the layouts paint with, read from `packages/tokens`, so a change
 * on either side re-runs the arithmetic. `LOOK_STYLES` says which accent pairs a
 * look paints: text on the accent when the accent is a background, the accent on
 * the page when it is text.
 *
 * "White" is checked twice: pure white, and the card surface the looks actually
 * paint their pages and cards with (`--surface-card`, a warm near-white).
 *
 * The ratio is `contrastRatio` from @propertypro/shared, the one the publish
 * check uses. The photo hero's scrim is checked where the hero is rendered
 * (`looks.test.tsx`), since its strength lives in the markup.
 */
import { describe, expect, it } from 'vitest';
import { contrastIssues, contrastRatio } from '@propertypro/shared';
import { tokenDefinitions, toHex } from '@propertypro/tokens';
import {
  LOOK_STYLES,
  paintsSecondary,
  type LookLayoutId,
} from '@/components/public-site/layouts/look-styles';
import { SITE_LOOK_PRESETS } from '../../../fixtures/site-look-presets';

const TEXT_PRIMARY = toHex(tokenDefinitions.text.primary); // --text-primary
const TEXT_SECONDARY = toHex(tokenDefinitions.text.secondary); // --text-secondary
const TEXT_INVERSE = toHex(tokenDefinitions.text.inverse); // --text-inverse
const WHITES: Readonly<Record<string, string>> = {
  white: '#FFFFFF',
  '--surface-card': toHex(tokenDefinitions.surface.card),
};

const BODY_TEXT = 4.5;
const HEADING = 3;

const LOOK_IDS = Object.keys(LOOK_STYLES) as LookLayoutId[];

function ratio(foreground: string, background: string): number {
  const value = contrastRatio(foreground, background);
  // A colour that does not parse must fail loudly, never read as a pass.
  if (value === null) throw new Error(`Could not parse ${foreground} on ${background}`);
  return value;
}

/** Every named background, with the foreground on it, at or above `minimum`. */
function expectOnEach(
  foreground: string,
  backgrounds: Readonly<Record<string, string>>,
  minimum: number,
) {
  for (const [name, background] of Object.entries(backgrounds)) {
    const measured = ratio(foreground, background);
    expect(measured, `${foreground} on ${name} (${background}) is ${measured.toFixed(2)}:1`)
      .toBeGreaterThanOrEqual(minimum);
  }
}

describe("every look's colour pairs pass AA", () => {
  it('checks the four looks, each against its own preset', () => {
    // Anti-vacuity: the loops below must have something to loop over.
    expect(LOOK_IDS).toHaveLength(4);
    expect([...LOOK_IDS].sort()).toEqual(Object.keys(SITE_LOOK_PRESETS).sort());
    expect([TEXT_PRIMARY, TEXT_SECONDARY, TEXT_INVERSE]).toEqual(['#111827', '#4B5563', '#FFFFFF']);
  });

  describe.each(LOOK_IDS)('%s', (id) => {
    const preset = SITE_LOOK_PRESETS[id];
    const look = LOOK_STYLES[id];
    const pageColours = { ...WHITES, 'the secondary colour': preset.secondaryColor };

    it('--text-primary on white and on the secondary colour is at least 4.5:1', () => {
      expectOnEach(TEXT_PRIMARY, pageColours, BODY_TEXT);
    });

    it('the primary colour (headings) on white and on the secondary colour is at least 3:1', () => {
      expectOnEach(preset.primaryColor, pageColours, HEADING);
    });

    it('--text-inverse on the primary colour is at least 4.5:1', () => {
      expectOnEach(TEXT_INVERSE, { 'the primary colour': preset.primaryColor }, BODY_TEXT);
    });

    if (look.accentUse === 'background') {
      it(`the ${look.onAccent} colour on the accent is at least 4.5:1`, () => {
        const onAccent = look.onAccent === 'inverse' ? TEXT_INVERSE : TEXT_PRIMARY;
        expectOnEach(onAccent, { 'the accent': preset.accentColor }, BODY_TEXT);
      });
    } else {
      it('the accent on white and on the secondary colour is at least 4.5:1', () => {
        expectOnEach(preset.accentColor, pageColours, BODY_TEXT);
      });
    }

    // Two more pairs the layouts paint, beyond the plan's list.
    it('--text-secondary (section body text) on white and on the secondary colour is at least 4.5:1', () => {
      expectOnEach(TEXT_SECONDARY, pageColours, BODY_TEXT);
    });

    it('the primary colour as small text (links, redrawn accent text) on white and on the secondary colour is at least 4.5:1', () => {
      expectOnEach(preset.primaryColor, pageColours, BODY_TEXT);
    });
  });
});

describe('the publish contrast check on the secondary colour', () => {
  it('checks it on the layouts that paint it behind text, and only those', () => {
    // Heritage's page, and the section bands of Bayfront and Palm Grove.
    expect(LOOK_IDS.filter((id) => paintsSecondary(id)).sort()).toEqual(['bayfront', 'heritage', 'palm-grove']);
    for (const layout of ['tidewater', 'boulevard', 'sable', 'plain-simple'] as const) {
      expect(paintsSecondary(layout), layout).toBe(false);
    }
  });

  it.each(LOOK_IDS)("raises no secondary-colour warning for %s's own preset", (id) => {
    const { primaryColor, accentColor, secondaryColor } = SITE_LOOK_PRESETS[id];
    const issues = contrastIssues(
      { primaryColor, accentColor, secondaryColor },
      { severity: 'warning', layoutPaintsSecondary: paintsSecondary(id) },
    );
    expect(issues.filter((i) => i.field === 'secondaryColor')).toEqual([]);
  });
});
