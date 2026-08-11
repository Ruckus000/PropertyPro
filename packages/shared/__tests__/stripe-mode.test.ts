import { describe, expect, it } from 'vitest';
import {
  describeLivemode,
  redactStripeKey,
  stripeKeyLivemode,
  stripePublishableKeyLivemode,
} from '../src/billing/stripe-mode';

describe('stripeKeyLivemode', () => {
  it.each([
    ['sk_live_abc123', true],
    ['rk_live_abc123', true],
    ['sk_test_abc123', false],
    ['rk_test_abc123', false],
  ])('maps %s to %s', (key, expected) => {
    expect(stripeKeyLivemode(key)).toBe(expected);
  });

  // null means "mode undeterminable". The webhook treats it as do-not-gate and
  // the ops scripts treat it as refuse-to-run; both depend on it never being
  // silently coerced to a boolean.
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['empty string', ''],
    ['publishable key', 'pk_live_abc'],
    ['wrong case', 'SK_LIVE_abc'],
    ['prefix without trailing underscore', 'sk_live'],
    ['webhook secret', 'whsec_abc'],
    ['garbage', 'garbage'],
  ])('returns null for %s', (_label, key) => {
    expect(stripeKeyLivemode(key)).toBeNull();
  });

  it('does not treat a live-looking substring elsewhere in the key as live', () => {
    // Must anchor at the start: a test key whose random body contains "live"
    // is still a test key.
    expect(stripeKeyLivemode('sk_test_livexyz')).toBe(false);
  });
});

describe('stripePublishableKeyLivemode', () => {
  it.each([
    ['pk_live_abc', true],
    ['pk_test_abc', false],
  ])('maps %s to %s', (key, expected) => {
    expect(stripePublishableKeyLivemode(key)).toBe(expected);
  });

  it('returns null for a SECRET key — the wrong variable in the wrong slot', () => {
    expect(stripePublishableKeyLivemode('sk_live_abc')).toBeNull();
  });

  it.each([undefined, null, '', 'nonsense'])('returns null for %s', (key) => {
    expect(stripePublishableKeyLivemode(key)).toBeNull();
  });
});

describe('describeLivemode', () => {
  it.each([
    [true, 'live'],
    [false, 'test'],
    [null, 'unknown'],
  ])('describes %s as %s', (input, expected) => {
    expect(describeLivemode(input)).toBe(expected);
  });
});

describe('redactStripeKey', () => {
  // Fixtures deliberately keep a SHORT body. A realistic-length one matches
  // Stripe's published key pattern, and GitHub push protection blocks the push —
  // correctly, since a scanner cannot tell an invented key from a leaked one.
  it('keeps the mode-bearing prefix and the last 4, and nothing else', () => {
    const key = 'sk_live_NOTAKEY9999';
    const redacted = redactStripeKey(key);

    expect(redacted).toBe('sk_live_…9999');
    // The whole point: the body must not survive redaction.
    expect(redacted).not.toContain('NOTAKEY');
    expect(key).not.toBe(redacted);
  });

  it('never emits the tail of a key too short to redact safely', () => {
    // A 4-char body would otherwise be reproduced in full by the last-4 rule.
    expect(redactStripeKey('sk_live_abcd')).toBe('sk_live_…');
  });

  it('redacts an unrecognised key without leaking its body', () => {
    const redacted = redactStripeKey('totally_unknown_format_secret');
    expect(redacted).toBe('tot…cret');
    expect(redacted).not.toContain('unknown_format');
  });

  it('reports an absent key rather than throwing', () => {
    expect(redactStripeKey(undefined)).toBe('(unset)');
    expect(redactStripeKey('')).toBe('(unset)');
  });
});
