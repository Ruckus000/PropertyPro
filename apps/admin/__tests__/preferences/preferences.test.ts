/**
 * `parseAlertPrefs` is a TRUST BOUNDARY, and this file is where that claim is
 * cashed.
 *
 * The value it reads is a `jsonb` column. The database's only guarantee is the
 * `jsonb_typeof(...) = 'object'` CHECK from migration 0073 — everything inside
 * the object is whatever some build of this app wrote, possibly an older one
 * with a different vocabulary, possibly a future one this code does not
 * understand. Its output feeds the settings screen AND the console-wide
 * critical banner, which renders on every page, so a malformed row that threw
 * here would take the whole shell down for that operator and nobody else — the
 * worst possible failure to reproduce.
 *
 * So: never throw, always return a complete `AlertPrefs`.
 *
 * Each malformed shape gets its OWN case. A single fixture carrying an unknown
 * key and an out-of-range threshold proves neither in isolation — it would stay
 * green if the clamp were deleted and the drop happened to mask it, or the
 * reverse.
 */
import { describe, expect, it } from 'vitest';

import {
  ALERT_PREF_KEYS,
  DEFAULT_ALERT_PREFS,
  ERROR_SPIKE_THRESHOLD_MAX,
  ERROR_SPIKE_THRESHOLD_MIN,
  parseAlertPrefs,
} from '@/lib/server/preferences';

describe('parseAlertPrefs — absent or non-object rows', () => {
  it('defaults everything for a null row', () => {
    expect(parseAlertPrefs(null)).toEqual(DEFAULT_ALERT_PREFS);
  });

  it('defaults everything for undefined', () => {
    expect(parseAlertPrefs(undefined)).toEqual(DEFAULT_ALERT_PREFS);
  });

  // `'null'::jsonb` is a VALUE, not SQL NULL, and the column's CHECK does not
  // exclude it from a hand-written repair — see the schema docblock.
  it.each([
    ['a number', 3],
    ['a string', 'errorSpikes'],
    ['a boolean', true],
    ['an array', ['errorSpikes']],
  ])('defaults everything for %s', (_label, raw) => {
    expect(parseAlertPrefs(raw)).toEqual(DEFAULT_ALERT_PREFS);
  });

  it('defaults everything for an empty object — the column default', () => {
    expect(parseAlertPrefs({})).toEqual(DEFAULT_ALERT_PREFS);
  });
});

describe('parseAlertPrefs — unknown keys', () => {
  // Proven ALONE, with a threshold that is already valid, so this case cannot
  // pass on the clamp's behalf.
  it('drops an unknown key without disturbing the known ones', () => {
    const parsed = parseAlertPrefs({ evil: true, retiredPref: 'yes', errorSpikeThreshold: 25 });
    expect(parsed).toEqual({ ...DEFAULT_ALERT_PREFS, errorSpikeThreshold: 25 });
    expect(Object.keys(parsed).sort()).toEqual(
      [...ALERT_PREF_KEYS, 'errorSpikeThreshold'].sort(),
    );
  });

  it('ignores a `__proto__` key rather than letting it reach Object.prototype', () => {
    const raw = JSON.parse('{"__proto__": {"polluted": true}, "errorSpikes": false}');
    const parsed = parseAlertPrefs(raw);
    expect(parsed).toEqual({ ...DEFAULT_ALERT_PREFS, errorSpikes: false });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('parseAlertPrefs — the threshold clamp', () => {
  // Proven ALONE, on objects carrying no unknown keys at all.
  it('clamps a zero threshold up to the minimum', () => {
    expect(parseAlertPrefs({ errorSpikeThreshold: 0 }).errorSpikeThreshold).toBe(
      ERROR_SPIKE_THRESHOLD_MIN,
    );
  });

  it('clamps a negative threshold up to the minimum', () => {
    expect(parseAlertPrefs({ errorSpikeThreshold: -40 }).errorSpikeThreshold).toBe(
      ERROR_SPIKE_THRESHOLD_MIN,
    );
  });

  it('clamps an absurd threshold down to the maximum', () => {
    expect(parseAlertPrefs({ errorSpikeThreshold: 5000 }).errorSpikeThreshold).toBe(
      ERROR_SPIKE_THRESHOLD_MAX,
    );
  });

  it('keeps an in-range threshold verbatim', () => {
    expect(parseAlertPrefs({ errorSpikeThreshold: 42 }).errorSpikeThreshold).toBe(42);
  });

  it('rounds a fractional threshold — the input that produces it is an integer field', () => {
    expect(parseAlertPrefs({ errorSpikeThreshold: 10.7 }).errorSpikeThreshold).toBe(11);
  });

  // A non-number is a SHAPE violation, not a value to coerce: `Number('')` is 0
  // and would clamp to 1, silently turning "no preference" into "alert on every
  // single error".
  it.each([
    ['a numeric string', '25'],
    ['an empty string', ''],
    ['null', null],
    ['an object', {}],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('falls back to the default threshold for %s', (_label, raw) => {
    expect(parseAlertPrefs({ errorSpikeThreshold: raw }).errorSpikeThreshold).toBe(
      DEFAULT_ALERT_PREFS.errorSpikeThreshold,
    );
  });
});

describe('parseAlertPrefs — wrong-typed booleans', () => {
  // `Boolean('no')` is `true`. Coercing here would read the string "no" as an
  // opt-IN, so a known key with the wrong type takes the DEFAULT.
  it.each([
    ['a string', 'no'],
    ['a number', 0],
    ['null', null],
  ])('falls back to the default for a %s in a boolean slot', (_label, raw) => {
    expect(parseAlertPrefs({ errorSpikes: raw, newLeadsDigest: raw })).toEqual(
      DEFAULT_ALERT_PREFS,
    );
  });

  it('honours a genuine false — the opt-out that matters most', () => {
    expect(parseAlertPrefs({ errorSpikes: false })).toEqual({
      ...DEFAULT_ALERT_PREFS,
      errorSpikes: false,
    });
  });

  it('honours a genuine true on a default-false key', () => {
    expect(parseAlertPrefs({ newLeadsDigest: true })).toEqual({
      ...DEFAULT_ALERT_PREFS,
      newLeadsDigest: true,
    });
  });
});

describe('parseAlertPrefs — hostile objects', () => {
  it('returns defaults rather than propagating a throwing getter', () => {
    const raw = {} as Record<string, unknown>;
    Object.defineProperty(raw, 'errorSpikes', {
      enumerable: true,
      get() {
        throw new Error('a preferences row must not be able to take the shell down');
      },
    });
    expect(() => parseAlertPrefs(raw)).not.toThrow();
    expect(parseAlertPrefs(raw)).toEqual(DEFAULT_ALERT_PREFS);
  });

  it('never returns the object it was handed', () => {
    const raw = { errorSpikes: false };
    expect(parseAlertPrefs(raw)).not.toBe(raw);
  });
});

describe('DEFAULT_ALERT_PREFS', () => {
  it('is frozen, so a caller cannot mutate every future parse', () => {
    expect(Object.isFrozen(DEFAULT_ALERT_PREFS)).toBe(true);
  });

  it('names exactly the five plan keys plus the threshold', () => {
    expect(ALERT_PREF_KEYS).toEqual([
      'errorSpikes',
      'paymentFailures',
      'newSupportThreads',
      'deletionReminders',
      'newLeadsDigest',
    ]);
    expect(DEFAULT_ALERT_PREFS.errorSpikeThreshold).toBe(10);
  });
});
