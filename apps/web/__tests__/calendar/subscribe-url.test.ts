import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildCalendarSubscribeUrl } from '../../src/lib/calendar/subscribe-url';

describe('calendar subscribe URL builder', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses the current local origin and communityId in development', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://getpropertypro.com');

    const url = buildCalendarSubscribeUrl({
      communityId: 42,
      communitySlug: 'sunset-condos',
      currentOrigin: 'http://localhost:3000',
      feed: 'personal',
      subscriptionToken: 'secret-token',
    });

    expect(url).toBe(
      'http://localhost:3000/api/v1/calendar/my-meetings.ics?communityId=42&token=secret-token',
    );
  });

  it('reuses the current tenant origin without duplicating the slug', () => {
    const url = buildCalendarSubscribeUrl({
      communityId: 42,
      communitySlug: 'sunset-condos',
      currentOrigin: 'https://sunset-condos.getpropertypro.com',
      feed: 'community',
    });

    expect(url).toBe('https://sunset-condos.getpropertypro.com/api/v1/calendar/meetings.ics');
  });

  it('strips a reserved www host prefix from the configured web host', () => {
    vi.stubEnv('NEXT_PUBLIC_WEB_APP_URL', 'https://www.getpropertypro.com');

    const url = buildCalendarSubscribeUrl({
      communityId: 42,
      communitySlug: 'sunset-condos',
      feed: 'community',
    });

    expect(url).toBe('https://sunset-condos.getpropertypro.com/api/v1/calendar/meetings.ics');
  });

  it('strips an already-prefixed tenant slug from the configured web host', () => {
    vi.stubEnv('NEXT_PUBLIC_WEB_APP_URL', 'https://sunset-condos.getpropertypro.com');

    const url = buildCalendarSubscribeUrl({
      communityId: 42,
      communitySlug: 'sunset-condos',
      feed: 'community',
    });

    expect(url).toBe('https://sunset-condos.getpropertypro.com/api/v1/calendar/meetings.ics');
  });
});
