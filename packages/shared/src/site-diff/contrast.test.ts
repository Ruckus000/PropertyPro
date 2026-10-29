import { describe, it, expect } from 'vitest';
import {
  AA_NORMAL_TEXT_RATIO,
  contrastIssues,
  contrastRatio,
  parseHex,
  relativeLuminance,
} from './contrast';
import { publishBlocked } from './validate';

/**
 * Copy of `darkenHex` from `packages/theme/src/constants.ts`.
 *
 * Duplicated rather than imported because `packages/shared` deliberately
 * depends on zod alone, and adding a workspace dependency just to assert a
 * property in a test is the wrong trade. If the real implementation ever
 * changes, the property test below stops reflecting production — so this copy
 * must be kept in step with it.
 */
function darkenHex(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const factor = 1 - percent / 100;
  const r = Math.max(0, Math.round(((num >> 16) & 0xff) * factor));
  const g = Math.max(0, Math.round(((num >> 8) & 0xff) * factor));
  const b = Math.max(0, Math.round((num & 0xff) * factor));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

describe('parseHex', () => {
  it('accepts 6-digit hex in either case', () => {
    expect(parseHex('#C2533A')).toEqual({ r: 0xc2, g: 0x53, b: 0x3a });
    expect(parseHex('#c2533a')).toEqual({ r: 0xc2, g: 0x53, b: 0x3a });
  });

  it('returns null — never a fallback colour — for everything invalid', () => {
    // A gate that substitutes a passing colour for an unparseable one is not a
    // gate. Each of these must be null, not a default.
    for (const bad of ['#abc', 'abcdef', 'red', 'rgb(0,0,0)', '', ' #C2533A ', '#C2533AA', null, 123, undefined, {}]) {
      expect(parseHex(bad as unknown), String(bad)).toBeNull();
    }
  });

  it('rejects 3-digit hex even though resolveTheme accepts it', () => {
    // Deliberate divergence: darkenHex parses its input as one integer, so a
    // 3-digit value silently yields a nonsense hover colour.
    expect(parseHex('#abc')).toBeNull();
  });
});

describe('contrastRatio', () => {
  it('is 21:1 for black on white', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
  });

  it('is 1:1 for a colour against itself', () => {
    expect(contrastRatio('#C2533A', '#C2533A')).toBeCloseTo(1, 5);
  });

  it('is symmetric', () => {
    const a = contrastRatio('#C2533A', '#FBF7F1');
    const b = contrastRatio('#FBF7F1', '#C2533A');
    expect(a).toBeCloseTo(b!, 10);
  });

  it('stays within [1, 21] across the brand ramp', () => {
    for (const hex of ['#FCF1ED', '#EDB9A6', '#C2533A', '#68291B', '#111827']) {
      const ratio = contrastRatio(hex, '#FFFFFF')!;
      expect(ratio).toBeGreaterThanOrEqual(1);
      expect(ratio).toBeLessThanOrEqual(21);
    }
  });

  it('propagates null rather than guessing when a colour is invalid', () => {
    expect(contrastRatio('#abc', '#FFFFFF')).toBeNull();
    expect(contrastRatio('#FFFFFF', 'nope')).toBeNull();
  });

  it('passes the default brand primary against white', () => {
    // coral-600, the shipped default. If this ever fails, every community on
    // defaults would start seeing a contrast warning.
    expect(contrastRatio('#C2533A', '#FFFFFF')!).toBeGreaterThanOrEqual(AA_NORMAL_TEXT_RATIO);
  });

  it('darkening never reduces contrast against white', () => {
    // This property is what licenses NOT checking --theme-primary-hover, which
    // is darkenHex(primary, 15). If it ever fails, the hover pair needs its own
    // runtime check.
    for (const hex of ['#C2533A', '#3E9C8F', '#B07A1C', '#CB6047', '#237066']) {
      const base = contrastRatio(hex, '#FFFFFF')!;
      const hover = contrastRatio(darkenHex(hex, 15), '#FFFFFF')!;
      expect(hover, hex).toBeGreaterThanOrEqual(base);
    }
  });
});

describe('relativeLuminance', () => {
  it('is 0 for black and 1 for white', () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 10);
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 10);
  });
});

describe('contrastIssues', () => {
  const DEFAULTS = { primaryColor: '#C2533A', accentColor: '#FCF1ED' };

  it('never BLOCKS the shipped default palette', () => {
    // The load-bearing assertion of this whole module. coral-600 on sand-50 is
    // 4.28:1 — under AA for normal text — so a naive reading of "contrast
    // blocks publish" would refuse a publish for every community that never
    // changed its brand colour. Warnings are fine here; an error is not.
    const issues = contrastIssues(DEFAULTS, { severity: 'error' });
    expect(issues.every((i) => i.severity === 'warning')).toBe(true);
    expect(publishBlocked(issues)).toBe(false);
  });

  it('still surfaces the default palette’s sub-AA pair as a warning', () => {
    // Downgrading it must not mean hiding it.
    const issues = contrastIssues(DEFAULTS, { severity: 'error' });
    expect(issues.some((i) => i.message.includes('page background'))).toBe(true);
  });

  it('errors on an unparseable colour, naming the field, rather than passing it', () => {
    const issues = contrastIssues({ ...DEFAULTS, primaryColor: '#abc' }, { severity: 'warning' });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ field: 'primaryColor', severity: 'error' });
    expect(issues[0]!.message).toMatch(/6-digit hex/);
  });

  it('reports an unparseable colour once, not once per checked pair', () => {
    const issues = contrastIssues({ primaryColor: 'nope', accentColor: 'also nope' }, { severity: 'error' });
    expect(issues.filter((i) => i.field === 'primaryColor')).toHaveLength(1);
    expect(issues.filter((i) => i.field === 'accentColor')).toHaveLength(1);
  });

  it('takes the caller-supplied severity for a genuinely failing pair', () => {
    // A pale primary fails white-on-primary badly.
    const pale = { ...DEFAULTS, primaryColor: '#F7DCD2' };

    const atWrite = contrastIssues(pale, { severity: 'error' });
    expect(atWrite.some((i) => i.severity === 'error')).toBe(true);

    // At publish the same failure is advisory: branding is already live, so
    // blocking cannot un-ship it and would only stop unrelated fixes.
    const atPublish = contrastIssues(pale, { severity: 'warning' });
    expect(atPublish.every((i) => i.severity === 'warning')).toBe(true);
    expect(atPublish.length).toBe(atWrite.length);
  });

  it('keeps the brand-tint and accent pairs advisory even at the write path', () => {
    // A primary that passes on white/page but not on the brand tint.
    const issues = contrastIssues({ primaryColor: '#CB6047', accentColor: '#FCF1ED' }, { severity: 'error' });
    const tint = issues.filter((i) => i.message.includes('brand tint'));
    expect(tint.every((i) => i.severity === 'warning')).toBe(true);
  });

  it('never mentions the secondary colour, which paints nothing', () => {
    const issues = contrastIssues(
      { primaryColor: '#F7DCD2', accentColor: '#F7DCD2' },
      { severity: 'error' },
    );
    expect(issues.some((i) => i.field.includes('secondary'))).toBe(false);
  });

  it('quotes the actual ratio so the PM can see how far off it is', () => {
    const issues = contrastIssues({ ...DEFAULTS, primaryColor: '#F7DCD2' }, { severity: 'error' });
    expect(issues[0]!.message).toMatch(/\d+\.\d{2}:1/);
  });
});

describe('contrastIssues — the secondary colour a look paints', () => {
  // Heritage's navy and bronze; each case sets the secondary it is about.
  const LOOK = { primaryColor: '#1D2B4A', accentColor: '#7A5B27' };
  const TEXT_ON_SECONDARY = 'default dark text on your secondary colour';
  const HEADINGS_ON_SECONDARY = 'your primary colour as headings on your secondary colour';

  /** At publish, on a layout that paints the secondary colour. */
  function onLook(colors: { primaryColor: string; accentColor: string; secondaryColor?: string }) {
    return contrastIssues(colors, { severity: 'warning', layoutPaintsSecondary: true });
  }
  function about(issues: ReturnType<typeof contrastIssues>, label: string) {
    return issues.filter((i) => i.message.startsWith(label));
  }

  it('warns when default dark text on the secondary colour is under 4.5:1', () => {
    // #808080 is the lightest grey under the line: 4.49:1 against #111827.
    const issues = about(onLook({ ...LOOK, secondaryColor: '#808080' }), TEXT_ON_SECONDARY);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ field: 'secondaryColor', severity: 'warning' });
    expect(issues[0]!.message).toContain('4.49:1, below the 4.5:1 required by WCAG 2.1 AA');
  });

  it('stays quiet about dark text from 4.5:1 up', () => {
    // #818181, the next grey up, is the first to pass (4.55:1); Heritage's cream is 16.73:1.
    expect(about(onLook({ ...LOOK, secondaryColor: '#818181' }), TEXT_ON_SECONDARY)).toHaveLength(0);
    expect(about(onLook({ ...LOOK, secondaryColor: '#FBF8F1' }), TEXT_ON_SECONDARY)).toHaveLength(0);
  });

  it('warns when the primary as headings on the secondary colour is under 3:1', () => {
    // A white secondary keeps dark text passing, so only the heading pair speaks.
    const justUnder = about(
      onLook({ primaryColor: '#959595', accentColor: '#FCF1ED', secondaryColor: '#FFFFFF' }),
      HEADINGS_ON_SECONDARY,
    );
    expect(justUnder).toHaveLength(1);
    expect(justUnder[0]).toMatchObject({ field: 'secondaryColor', severity: 'warning' });

    const wellUnder = about(
      onLook({ primaryColor: '#AAAAAA', accentColor: '#FCF1ED', secondaryColor: '#FFFFFF' }),
      HEADINGS_ON_SECONDARY,
    );
    expect(wellUnder[0]!.message).toMatch(/ratio of \d+\.\d{2}:1, below the 3:1 required by WCAG 2\.1 AA/);
  });

  it('holds headings to 3:1, not 4.5:1', () => {
    // #949494 is the first grey to pass 3:1 on white (3.03:1); #888888 is 3.54:1,
    // which would fail a body-text threshold and must not warn here.
    for (const primaryColor of ['#949494', '#888888']) {
      const issues = onLook({ primaryColor, accentColor: '#FCF1ED', secondaryColor: '#FFFFFF' });
      expect(about(issues, HEADINGS_ON_SECONDARY), primaryColor).toHaveLength(0);
    }
  });

  it('is advisory even at the write path, so it never blocks', () => {
    const issues = contrastIssues(
      { ...LOOK, secondaryColor: '#111827' },
      { severity: 'error', layoutPaintsSecondary: true },
    );
    const onSecondary = issues.filter((i) => i.field === 'secondaryColor');
    expect(onSecondary).toHaveLength(2);
    expect(onSecondary.every((i) => i.severity === 'warning')).toBe(true);
    expect(publishBlocked(onSecondary)).toBe(false);
  });

  it('checks nothing on the secondary colour when the layout does not paint it', () => {
    const colors = { ...LOOK, secondaryColor: '#111827' };
    for (const options of [{ severity: 'warning' as const }, { severity: 'warning' as const, layoutPaintsSecondary: false }]) {
      expect(contrastIssues(colors, options).some((i) => i.field === 'secondaryColor')).toBe(false);
    }
  });

  it('reports an unparseable secondary once, as a warning, when the layout paints it', () => {
    const issues = onLook({ ...LOOK, secondaryColor: '#abc' }).filter((i) => i.field === 'secondaryColor');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe('warning');
    expect(issues[0]!.message).toMatch(/6-digit hex/);
  });

  it('adds to the existing pairs without changing them', () => {
    const DEFAULTS = { primaryColor: '#C2533A', accentColor: '#FCF1ED' };
    const before = contrastIssues(DEFAULTS, { severity: 'error' });
    const after = contrastIssues(
      { ...DEFAULTS, secondaryColor: '#FFFFFF' },
      { severity: 'error', layoutPaintsSecondary: true },
    );
    expect(before.length).toBeGreaterThan(0);
    expect(after).toEqual(before);
  });
});

describe('contrastIssues — the accent, as each look paints it', () => {
  const ON_WHITE_TEXT = { accentUse: 'background', onAccent: 'inverse' } as const; // Palm Grove
  const ON_DARK_TEXT = { accentUse: 'background', onAccent: 'text' } as const; // Bayfront, Plain & Simple
  const AS_TEXT = { accentUse: 'text', onAccent: 'inverse' } as const; // Heritage

  /** The accent's issues, each named by its label. */
  function accentLabels(issues: ReturnType<typeof contrastIssues>) {
    return issues.filter((i) => i.field === 'accentColor').map((i) => i.message.split(' has a contrast ratio')[0]);
  }

  it('keeps the original pair without a look: default dark text on the accent', () => {
    // Heritage's bronze, on a legacy layout: dark text on it is 2.83:1.
    const issues = contrastIssues({ primaryColor: '#1D2B4A', accentColor: '#7A5B27' }, { severity: 'warning' });
    expect(accentLabels(issues)).toEqual(['default dark text on your accent colour']);
  });

  it('checks white text on an accent a look puts white text on', () => {
    // Palm Grove's terracotta takes white at 4.99:1, though dark text on it would be 3.56:1.
    const own = contrastIssues(
      { primaryColor: '#2D5E4A', accentColor: '#B4532A' },
      { severity: 'warning', lookAccent: ON_WHITE_TEXT },
    );
    expect(accentLabels(own)).toEqual([]);

    // A custom gold accent fails white text: 2.17:1.
    const gold = contrastIssues(
      { primaryColor: '#2D5E4A', accentColor: '#E9A23B' },
      { severity: 'warning', lookAccent: ON_WHITE_TEXT },
    ).filter((i) => i.field === 'accentColor');
    expect(gold).toHaveLength(1);
    expect(gold[0]!.message).toMatch(/^white text on your accent colour has a contrast ratio of 2\.17:1, below the 4\.5:1/);
    expect(gold[0]!.severity).toBe('warning');
  });

  it('checks default dark text on an accent a look puts dark text on', () => {
    // Bayfront's gold takes dark text at 8.19:1; a custom bronze accent fails at 2.83:1.
    const own = contrastIssues(
      { primaryColor: '#0B4F5C', accentColor: '#E9A23B' },
      { severity: 'warning', lookAccent: ON_DARK_TEXT },
    );
    expect(accentLabels(own)).toEqual([]);

    const bronze = contrastIssues(
      { primaryColor: '#0B4F5C', accentColor: '#7A5B27' },
      { severity: 'warning', lookAccent: ON_DARK_TEXT },
    ).filter((i) => i.field === 'accentColor');
    expect(bronze).toHaveLength(1);
    expect(bronze[0]!.message).toMatch(/^default dark text on your accent colour has a contrast ratio of 2\.83:1/);
  });

  it('checks a text accent on white and on the secondary colour the layout paints', () => {
    const options = { severity: 'warning' as const, lookAccent: AS_TEXT, layoutPaintsSecondary: true };
    // Heritage's bronze reads at 6.21:1 on white and 5.90:1 on its cream.
    const own = contrastIssues({ primaryColor: '#1D2B4A', accentColor: '#7A5B27', secondaryColor: '#FBF8F1' }, options);
    expect(accentLabels(own)).toEqual([]);

    // A custom tan accent fails as text on both: 2.24:1 and 2.13:1.
    const tan = contrastIssues({ primaryColor: '#1D2B4A', accentColor: '#C9A86A', secondaryColor: '#FBF8F1' }, options);
    expect(accentLabels(tan)).toEqual([
      'your accent colour as text on white',
      'your accent colour as text on your secondary colour',
    ]);

    // #8E6A2F passes on white (4.90:1) and fails on a darker cream (3.99:1): the pairs are separate.
    const darkerCream = contrastIssues(
      { primaryColor: '#1D2B4A', accentColor: '#8E6A2F', secondaryColor: '#F0E6D2' },
      options,
    );
    expect(accentLabels(darkerCream)).toEqual(['your accent colour as text on your secondary colour']);
  });

  it('checks a text accent on the secondary colour only where the layout paints it', () => {
    const issues = contrastIssues(
      { primaryColor: '#1D2B4A', accentColor: '#C9A86A', secondaryColor: '#FBF8F1' },
      { severity: 'warning', lookAccent: AS_TEXT },
    );
    expect(accentLabels(issues)).toEqual(['your accent colour as text on white']);
  });

  it('keeps every accent pair advisory, even at the write path', () => {
    // A mid grey fails every accent pair: white on it 4.48:1, dark text 3.96:1, as text on white 4.44:1.
    for (const lookAccent of [ON_WHITE_TEXT, ON_DARK_TEXT, AS_TEXT]) {
      const issues = contrastIssues(
        { primaryColor: '#1D2B4A', accentColor: '#777777', secondaryColor: '#999999' },
        { severity: 'error', lookAccent, layoutPaintsSecondary: true },
      ).filter((i) => i.field === 'accentColor');
      expect(issues.length, lookAccent.accentUse).toBeGreaterThan(0);
      expect(publishBlocked(issues)).toBe(false);
    }
  });

  it('still reports an unparseable accent once, as an error, under a look', () => {
    for (const lookAccent of [ON_WHITE_TEXT, ON_DARK_TEXT, AS_TEXT]) {
      const issues = contrastIssues(
        { primaryColor: '#1D2B4A', accentColor: '#abc', secondaryColor: '#FBF8F1' },
        { severity: 'warning', lookAccent, layoutPaintsSecondary: true },
      ).filter((i) => i.field === 'accentColor');
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({ severity: 'error' });
      expect(issues[0]!.message).toMatch(/6-digit hex/);
    }
  });
});
