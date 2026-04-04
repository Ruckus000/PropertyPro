import { describe, it, expect } from 'vitest';

describe('stripe webhook idempotency logic', () => {
  type IdempotencyRow = { eventId: string; processedAt: Date | null } | undefined;

  function shouldProcess(existing: IdempotencyRow): 'first_attempt' | 'retry' | 'duplicate' {
    if (!existing) return 'first_attempt';
    if (existing.processedAt !== null) return 'duplicate';
    return 'retry';
  }

  it('returns first_attempt when no row exists', () => {
    expect(shouldProcess(undefined)).toBe('first_attempt');
  });

  it('returns duplicate when processedAt is set', () => {
    expect(shouldProcess({ eventId: 'evt_1', processedAt: new Date() })).toBe('duplicate');
  });

  it('returns retry when processedAt is null (prior failure)', () => {
    expect(shouldProcess({ eventId: 'evt_1', processedAt: null })).toBe('retry');
  });
});
