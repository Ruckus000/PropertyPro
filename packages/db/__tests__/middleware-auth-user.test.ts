import { describe, it, expect } from 'vitest';
import { toMiddlewareAuthUser } from '../src/supabase/middleware';

describe('toMiddlewareAuthUser', () => {
  it('maps the standard claims fields', () => {
    const user = toMiddlewareAuthUser({
      sub: 'user-123',
      email: 'fran@example.com',
      phone: '+15551234567',
      user_metadata: { full_name: 'Fran Founding', email_verified: true },
    });

    expect(user).toEqual({
      id: 'user-123',
      email: 'fran@example.com',
      phone: '+15551234567',
      user_metadata: { full_name: 'Fran Founding' },
      emailVerified: true,
    });
  });

  it('treats explicit email_verified: false as unverified', () => {
    const user = toMiddlewareAuthUser({
      sub: 'user-123',
      user_metadata: { email_verified: false },
    });

    expect(user.emailVerified).toBe(false);
  });

  it('treats an ABSENT email_verified key as verified (admin-provisioned users)', () => {
    expect(
      toMiddlewareAuthUser({ sub: 'user-123', user_metadata: {} }).emailVerified,
    ).toBe(true);
    expect(toMiddlewareAuthUser({ sub: 'user-123' }).emailVerified).toBe(true);
  });

  it('nulls missing or non-string optional fields', () => {
    const user = toMiddlewareAuthUser({
      sub: 'user-123',
      user_metadata: { full_name: 42 },
    });

    expect(user.email).toBeNull();
    expect(user.phone).toBeNull();
    expect(user.user_metadata.full_name).toBeNull();
  });
});
