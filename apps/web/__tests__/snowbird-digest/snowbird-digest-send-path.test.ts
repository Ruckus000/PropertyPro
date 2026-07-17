/**
 * Unit tests for the snowbird digest send-path decision logic:
 *  - the signed no-login unsubscribe token (sign/verify/tamper),
 *  - effective-cadence resolution (default-on model),
 *  - the cron's timezone gate + cadence selection + window math.
 *
 * The full send integration (cross-tenant scan, recipient resolution, email
 * dispatch) is runtime-verified against the cron route; here we lock the pure
 * decisions that are easy to get subtly wrong.
 */
import { describe, expect, it, vi } from 'vitest';

// snowbird-digest-processor pulls in @propertypro/db (DATABASE_URL load guard)
// and the token helper needs its secret. Neither is actually connected/used by
// the pure functions under test.
vi.hoisted(() => {
  process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
  process.env.SNOWBIRD_UNSUBSCRIBE_SECRET ??= 'test-unsubscribe-secret';
});

import {
  signSnowbirdUnsubscribeToken,
  verifySnowbirdUnsubscribeToken,
} from '../../src/lib/services/snowbird-digest-token';
import { resolveEffectiveCadence } from '../../src/lib/services/snowbird-digest-subscription-service';
import {
  toLocalParts,
  dueCadences,
  windowStartFor,
} from '../../src/lib/services/snowbird-digest-processor';

describe('snowbird unsubscribe token', () => {
  it('round-trips a valid token', () => {
    const token = signSnowbirdUnsubscribeToken({ communityId: 42, userId: 'user-abc' });
    expect(verifySnowbirdUnsubscribeToken(token)).toEqual({ communityId: 42, userId: 'user-abc' });
  });

  it('rejects a tampered payload', () => {
    const token = signSnowbirdUnsubscribeToken({ communityId: 42, userId: 'user-abc' });
    // Flip the encoded payload but keep the original signature.
    const [, sig] = token.split('.');
    const forged = Buffer.from('999:user-evil').toString('base64url') + '.' + sig;
    expect(verifySnowbirdUnsubscribeToken(forged)).toBeNull();
  });

  it('rejects malformed tokens', () => {
    expect(verifySnowbirdUnsubscribeToken('')).toBeNull();
    expect(verifySnowbirdUnsubscribeToken('no-dot')).toBeNull();
    expect(verifySnowbirdUnsubscribeToken('.sig')).toBeNull();
  });
});

describe('resolveEffectiveCadence (default-on)', () => {
  it('treats a missing row as the weekly default', () => {
    expect(resolveEffectiveCadence(null)).toBe('weekly');
  });

  it('honors an explicit cadence, including off', () => {
    expect(resolveEffectiveCadence({ cadence: 'monthly' })).toBe('monthly');
    expect(resolveEffectiveCadence({ cadence: 'off' })).toBe('off');
    expect(resolveEffectiveCadence({ cadence: 'weekly' })).toBe('weekly');
  });

  it('falls back to weekly for an unexpected value', () => {
    expect(resolveEffectiveCadence({ cadence: 'garbage' })).toBe('weekly');
  });
});

describe('cron gate + cadence selection', () => {
  // 2026-07-20 is a Monday; EDT is UTC-4, so 12:00 UTC = 08:00 America/New_York.
  const mondayAt8Eastern = new Date('2026-07-20T12:00:00Z');
  // 2026-08-01 is the 1st; 12:00 UTC = 08:00 EDT.
  const firstOfMonthAt8Eastern = new Date('2026-08-01T12:00:00Z');

  it('reads the local hour/weekday/day for a timezone', () => {
    const p = toLocalParts(mondayAt8Eastern, 'America/New_York');
    expect(p.hour).toBe(8);
    expect(p.weekday).toBe('Mon');
  });

  it('the same instant is a different local hour elsewhere (gate is per-community)', () => {
    // 13:00 UTC is 06:00 in Denver — not the 8 AM send hour.
    expect(toLocalParts(mondayAt8Eastern, 'America/Denver').hour).toBe(6);
  });

  it('fires weekly on Monday', () => {
    const due = dueCadences(toLocalParts(mondayAt8Eastern, 'America/New_York'));
    expect(due.has('weekly')).toBe(true);
    expect(due.has('monthly')).toBe(false);
  });

  it('fires monthly on the 1st', () => {
    const due = dueCadences(toLocalParts(firstOfMonthAt8Eastern, 'America/New_York'));
    expect(due.has('monthly')).toBe(true);
  });

  it('fires nothing on a mid-week, mid-month day', () => {
    // 2026-07-22 is a Wednesday, the 22nd.
    const due = dueCadences(toLocalParts(new Date('2026-07-22T13:00:00Z'), 'America/New_York'));
    expect(due.size).toBe(0);
  });
});

describe('windowStartFor', () => {
  const now = new Date('2026-07-20T12:00:00Z');

  it('uses the watermark when present', () => {
    const wm = new Date('2026-07-13T12:00:00Z');
    expect(windowStartFor('weekly', wm, now)).toBe(wm);
  });

  it('looks back one cadence span on first send', () => {
    expect(windowStartFor('weekly', null, now).toISOString()).toBe('2026-07-13T12:00:00.000Z');
    expect(windowStartFor('monthly', null, now).toISOString()).toBe('2026-06-20T12:00:00.000Z');
  });
});
