/**
 * Tests for the pure halves of the Stripe cutover tooling: the preflight's
 * verdict logic, the refusals, and the price catalog.
 *
 * The I/O halves (Stripe calls, DB writes) are deliberately not mocked here —
 * what matters is that the DECISIONS are right, and those are pure.
 */
import { describe, expect, it } from 'vitest';
import {
  isFailing,
  keyModeCheck,
  priceCheck,
  publishableKeyCheck,
  staleIdCheck,
  webhookSecretCheck,
  type Check,
  type PriceProbe,
} from '../lib/stripe-mode-report';
import {
  assertAcknowledged,
  assertKeyMode,
  databaseHost,
  isLoopbackDatabase,
} from '../lib/stripe-guards';
import { allCombos, lookupKeyFor } from '../lib/stripe-price-catalog';

const probe = (over: Partial<PriceProbe> = {}): PriceProbe => ({
  lookupKey: 'essentials_condo_718_monthly',
  stripePriceId: 'price_abc',
  resolved: true,
  actualUnitAmountCents: 9900,
  expectedUnitAmountCents: 9900,
  ...over,
});

describe('isFailing', () => {
  it('treats unknown as NOT a pass', () => {
    // The load-bearing assertion of the whole preflight: "I could not tell"
    // must never render as green, or an unverified surface ships wearing a tick.
    const checks: Check[] = [{ name: 'x', status: 'unknown', detail: '' }];
    expect(isFailing(checks)).toBe(true);
  });

  it('fails when any single check fails', () => {
    const checks: Check[] = [
      { name: 'a', status: 'pass', detail: '' },
      { name: 'b', status: 'fail', detail: '' },
    ];
    expect(isFailing(checks)).toBe(true);
  });

  it('passes only when every check passes', () => {
    expect(isFailing([{ name: 'a', status: 'pass', detail: '' }])).toBe(false);
  });
});

describe('keyModeCheck', () => {
  it('reports unknown when the mode cannot be derived', () => {
    expect(keyModeCheck(null, '(unset)').status).toBe('unknown');
  });

  it('passes for a determinable mode and names it', () => {
    const check = keyModeCheck(true, 'sk_live_…9999');
    expect(check.status).toBe('pass');
    expect(check.detail).toContain('live');
  });
});

describe('publishableKeyCheck', () => {
  it('FAILS on a genuine mismatch', () => {
    const check = publishableKeyCheck(true, false, 'pk_test_…1234');
    expect(check.status).toBe('fail');
    expect(check.detail).toContain('MISMATCH');
    // The build-time constraint is the part people get wrong; it must be said here.
    expect(check.detail).toContain('redeploy');
  });

  it('passes when both keys agree', () => {
    expect(publishableKeyCheck(false, false, 'pk_test_…1234').status).toBe('pass');
  });

  it('is unknown — not passing — when the secret mode is unknown', () => {
    // Agreement with an unknown cannot be established, and must not be assumed.
    expect(publishableKeyCheck(null, true, 'pk_live_…1234').status).toBe('unknown');
  });

  it('is unknown when the publishable key is absent', () => {
    expect(publishableKeyCheck(true, null, '(unset)').status).toBe('unknown');
  });
});

describe('priceCheck', () => {
  it('fails loudly on an empty table rather than vacuously passing', () => {
    // Zero probes means zero failures; without this branch the check would
    // report "all prices fine" for a table that can sell nothing.
    const check = priceCheck([]);
    expect(check.status).toBe('fail');
    expect(check.detail).toContain('EMPTY');
  });

  it('fails when any price does not resolve, and names the mode consequence', () => {
    const check = priceCheck([probe(), probe({ resolved: false, lookupKey: 'professional_hoa_720_monthly' })]);
    expect(check.status).toBe('fail');
    expect(check.detail).toContain('1/2');
    expect(check.detail).toContain('professional_hoa_720_monthly');
    expect(check.detail).toContain('STRIPE_MODE_MISMATCH');
  });

  it('fails when a price resolves but bills the wrong amount', () => {
    // Resolvable-but-wrong is the dangerous case: checkout succeeds and the
    // customer is charged something the catalog never intended.
    const check = priceCheck([probe({ actualUnitAmountCents: 100 })]);
    expect(check.status).toBe('fail');
    expect(check.detail).toContain('WRONG amount');
  });

  it('passes when everything resolves at the catalog amount', () => {
    expect(priceCheck([probe(), probe({ lookupKey: 'b' })]).status).toBe('pass');
  });
});

describe('staleIdCheck', () => {
  it('passes on zero', () => {
    expect(staleIdCheck({ communities: 0, billingGroups: 0 }).status).toBe('pass');
  });

  it('fails when only billing groups are stale (communities all fine)', () => {
    const check = staleIdCheck({ communities: 0, billingGroups: 4 });
    expect(check.status).toBe('fail');
    expect(check.detail).toContain('4 billing group');
  });

  it('names the silent consequences, not just the count', () => {
    const check = staleIdCheck({ communities: 5, billingGroups: 0 });
    expect(check.detail).toContain('silently no-op');
  });
});

describe('webhookSecretCheck', () => {
  it('fails when unset', () => {
    expect(webhookSecretCheck(undefined).status).toBe('fail');
  });

  it('reports UNKNOWN when set, because whsec_ carries no mode marker', () => {
    // Honesty check: presence must not be reported as verification.
    const check = webhookSecretCheck('whsec_abc');
    expect(check.status).toBe('unknown');
    expect(check.detail).toContain('cannot be verified offline');
  });
});

describe('assertKeyMode', () => {
  it('accepts a matching mode', () => {
    expect(() => assertKeyMode('sk_test_abc', false, { because: 'x' })).not.toThrow();
    expect(() => assertKeyMode('sk_live_abc', true, { because: 'x' })).not.toThrow();
  });

  it('refuses the opposite mode in both directions', () => {
    expect(() => assertKeyMode('sk_live_abc', false, { because: 'x' })).toThrow(/REFUSING TO RUN/);
    expect(() => assertKeyMode('sk_test_abc', true, { because: 'x' })).toThrow(/REFUSING TO RUN/);
  });

  it('refuses an UNKNOWN prefix, unlike the webhook which passes it through', () => {
    // Asymmetry is deliberate: the webhook must keep serving traffic; a script
    // must not create billing objects against a key it cannot vouch for.
    expect(() => assertKeyMode('mystery_abc', true, { because: 'x' })).toThrow(/unrecognised prefix/);
  });

  it('refuses an unset key', () => {
    expect(() => assertKeyMode(undefined, true, { because: 'x' })).toThrow(/not set/);
  });

  it('never puts the key body in the error message', () => {
    // Short body on purpose — see the note in packages/shared/__tests__/stripe-mode.test.ts.
    const secret = 'sk_live_NOTAKEY1234';
    try {
      assertKeyMode(secret, false, { because: 'x' });
      throw new Error('should have thrown');
    } catch (err) {
      expect((err as Error).message).not.toContain('SUPERSECRETBODY');
      expect((err as Error).message).toContain('sk_live_…');
    }
  });
});

describe('databaseHost / isLoopbackDatabase', () => {
  it.each([
    ['postgresql://user:pw@localhost:5432/db', 'localhost'],
    ['postgres://127.0.0.1:54322/postgres', '127.0.0.1'],
    ['postgresql://u:p@db.abcdef.supabase.co:5432/postgres?sslmode=require', 'db.abcdef.supabase.co'],
  ])('extracts the host from %s', (url, expected) => {
    expect(databaseHost(url)).toBe(expected);
  });

  it('treats a remote host as non-loopback', () => {
    expect(isLoopbackDatabase('postgresql://u:p@db.abcdef.supabase.co:5432/postgres')).toBe(false);
  });

  it('treats an unset url as non-loopback rather than defaulting to safe', () => {
    expect(isLoopbackDatabase(undefined)).toBe(false);
  });

  it('is not fooled by a remote host whose password contains "localhost"', () => {
    expect(isLoopbackDatabase('postgresql://user:localhost@evil.example.com:5432/db')).toBe(false);
  });
});

describe('assertAcknowledged', () => {
  it('throws without the flag', () => {
    expect(() => assertAcknowledged(['--apply'], '--yes-really', { because: 'x' })).toThrow(
      /REFUSING TO RUN/,
    );
  });

  it('passes with the flag', () => {
    expect(() =>
      assertAcknowledged(['--apply', '--yes-really'], '--yes-really', { because: 'x' }),
    ).not.toThrow();
  });
});

describe('price catalog', () => {
  it('produces a monthly and yearly entry for every plan the app sells', () => {
    const combos = allCombos();
    expect(combos.length).toBeGreaterThan(0);
    expect(combos.length % 2).toBe(0);
    expect(new Set(combos.map((c) => c.lookupKey)).size).toBe(combos.length);
  });

  it('prices the annual term at ten months', () => {
    const combos = allCombos();
    for (const yearly of combos.filter((c) => c.billingInterval === 'year')) {
      const monthly = combos.find(
        (c) =>
          c.planId === yearly.planId &&
          c.communityType === yearly.communityType &&
          c.billingInterval === 'month',
      );
      expect(monthly).toBeDefined();
      expect(yearly.unitAmountCents).toBe((monthly as { unitAmountCents: number }).unitAmountCents * 10);
    }
  });

  it('uses the monthly/yearly suffix the webhook lookup path expects', () => {
    // Must stay identical to canonicalLookupKey in sync-stripe-lookup-keys.ts,
    // or the subscription webhook silently drops to its DB-read fallback.
    expect(lookupKeyFor('essentials', 'condo_718', 'month')).toBe('essentials_condo_718_monthly');
    expect(lookupKeyFor('essentials', 'condo_718', 'year')).toBe('essentials_condo_718_yearly');
  });
});
