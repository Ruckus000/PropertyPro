import { describe, expect, it } from 'vitest';
import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
  AuthUnknownError,
} from '@supabase/supabase-js';
import { getSafeAuthErrorMessage } from '../src/supabase/auth-error';

const FALLBACK = 'Fixed fallback copy.';

// Real auth-js classes, not `{ name }` look-alikes, so an auth-js upgrade that
// changes how an error is classified fails here instead of on a sign-in screen.
describe('getSafeAuthErrorMessage', () => {
  it('shows a server-written message below 500 (wrong password)', () => {
    const error = new AuthApiError('Invalid login credentials', 400, 'invalid_credentials');
    expect(getSafeAuthErrorMessage(error, FALLBACK)).toBe('Invalid login credentials');
  });

  it('shows a rate-limit message (429), which a person has to read', () => {
    const error = new AuthApiError('Request rate limit reached', 429, 'over_request_rate_limit');
    expect(getSafeAuthErrorMessage(error, FALLBACK)).toBe('Request rate limit reached');
  });

  it('draws the line at 500: 499 shows, 500 falls back', () => {
    expect(getSafeAuthErrorMessage(new AuthApiError('edge', 499, undefined), FALLBACK)).toBe('edge');
    expect(
      getSafeAuthErrorMessage(
        new AuthApiError('Database error querying schema', 500, 'unexpected_failure'),
        FALLBACK,
      ),
    ).toBe(FALLBACK);
  });

  it('never shows a returned network failure, whose message can name the project host', () => {
    for (const status of [0, 503]) {
      const error = new AuthRetryableFetchError('Load failed (abc123xyz.supabase.co)', status);
      const message = getSafeAuthErrorMessage(error, FALLBACK);
      expect(message).toBe(FALLBACK);
      expect(message).not.toMatch(/supabase|abc123xyz|Load failed/);
    }
  });

  it('falls back for a non-JSON gateway response', () => {
    const error = new AuthUnknownError('Unexpected token < at abc123xyz.supabase.co', new Error('x'));
    expect(getSafeAuthErrorMessage(error, FALLBACK)).toBe(FALLBACK);
  });

  it('says to sign in again for a revoked session, not to retry', () => {
    const message = getSafeAuthErrorMessage(new AuthSessionMissingError(), FALLBACK);
    expect(message).toContain('Sign out and sign in again');
    expect(message).not.toBe(FALLBACK);
  });
});
