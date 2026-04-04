import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  generateMyMeetingsSubscriptionToken,
  validateCalendarSubscriptionToken,
} from '../../src/lib/calendar/subscription-token';

describe('calendar subscription token', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('round-trips a signed my-meetings subscription token', () => {
    vi.stubEnv('OAUTH_STATE_SECRET', 'calendar-secret');

    const token = generateMyMeetingsSubscriptionToken({
      communityId: 42,
      userId: 'user-123',
    });

    expect(validateCalendarSubscriptionToken(token)).toEqual({
      v: 1,
      scope: 'my_meetings',
      communityId: 42,
      userId: 'user-123',
    });
  });

  it('rejects a token with a forged signature', () => {
    vi.stubEnv('OAUTH_STATE_SECRET', 'calendar-secret');

    const token = generateMyMeetingsSubscriptionToken({
      communityId: 42,
      userId: 'user-123',
    });
    const [payload] = token.split('.');

    expect(validateCalendarSubscriptionToken(`${payload}.forged`)).toBeNull();
  });

  it('rejects a tampered payload', () => {
    vi.stubEnv('OAUTH_STATE_SECRET', 'calendar-secret');

    const token = generateMyMeetingsSubscriptionToken({
      communityId: 42,
      userId: 'user-123',
    });
    const [, signature] = token.split('.');
    const tamperedPayload = Buffer.from(
      JSON.stringify({
        v: 1,
        scope: 'my_meetings',
        communityId: 999,
        userId: 'user-123',
      }),
    ).toString('base64url');

    expect(validateCalendarSubscriptionToken(`${tamperedPayload}.${signature}`)).toBeNull();
  });
});
