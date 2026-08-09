/**
 * requireCronSecret — the gate that middleware now defers to entirely.
 *
 * Middleware lets any GET/POST under /api/v1/internal/ past the session check,
 * so this helper is the ONLY authentication on every scheduled job. Its
 * fail-closed behaviour is therefore load-bearing, not defensive detail.
 */
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { requireCronSecret } from '@/lib/api/cron-auth';
import { UnauthorizedError } from '@/lib/api/errors/UnauthorizedError';

const URL = 'http://localhost:3000/api/v1/internal/payment-reminders';

function req(authorization?: string): NextRequest {
  return new NextRequest(URL, {
    method: 'POST',
    headers: authorization ? { authorization } : {},
  });
}

describe('requireCronSecret', () => {
  it('accepts a token matching any supplied secret', () => {
    expect(() =>
      requireCronSecret(req('Bearer route-secret'), 'route-secret', 'platform-secret'),
    ).not.toThrow();
    expect(() =>
      requireCronSecret(req('Bearer platform-secret'), 'route-secret', 'platform-secret'),
    ).not.toThrow();
  });

  it('ignores undefined and empty candidates', () => {
    expect(() =>
      requireCronSecret(req('Bearer platform-secret'), undefined, '', 'platform-secret'),
    ).not.toThrow();
  });

  it('rejects a token matching none of them', () => {
    expect(() =>
      requireCronSecret(req('Bearer wrong'), 'route-secret', 'platform-secret'),
    ).toThrow(UnauthorizedError);
  });

  it('rejects when every candidate is undefined', () => {
    // An unconfigured deploy must not become a publicly-runnable job.
    expect(() => requireCronSecret(req('Bearer anything'), undefined, undefined)).toThrow(
      UnauthorizedError,
    );
  });

  it('rejects when no candidates are supplied at all', () => {
    expect(() => requireCronSecret(req('Bearer anything'))).toThrow(UnauthorizedError);
  });

  it('rejects a missing Authorization header', () => {
    // This is the production failure mode: Vercel omits the header entirely
    // when CRON_SECRET is unset, so `token` is null rather than wrong.
    expect(() => requireCronSecret(req(), 'route-secret')).toThrow(UnauthorizedError);
  });

  it('rejects a non-Bearer scheme', () => {
    expect(() => requireCronSecret(req('Basic route-secret'), 'route-secret')).toThrow(
      UnauthorizedError,
    );
  });

  it('is not fooled by a token that merely prefixes the secret', () => {
    // Guards the length check that must precede timingSafeEqual (which throws
    // on unequal buffer lengths rather than returning false).
    expect(() => requireCronSecret(req('Bearer route'), 'route-secret')).toThrow(
      UnauthorizedError,
    );
    expect(() => requireCronSecret(req('Bearer route-secret-extra'), 'route-secret')).toThrow(
      UnauthorizedError,
    );
  });

  it('tolerates surrounding whitespace in the header', () => {
    expect(() => requireCronSecret(req('Bearer   route-secret  '), 'route-secret')).not.toThrow();
  });
});
