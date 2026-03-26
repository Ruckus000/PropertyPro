import { describe, expect, it, afterEach, vi } from 'vitest';
import { getWebAppHostnameFromEnv } from '../public-site-url';

describe('getWebAppHostnameFromEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses NEXT_PUBLIC_WEB_APP_URL when set', () => {
    vi.stubEnv('NEXT_PUBLIC_WEB_APP_URL', 'https://tenant.example.com');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://ignored.com');
    expect(getWebAppHostnameFromEnv()).toBe('tenant.example.com');
  });

  it('uses NEXT_PUBLIC_APP_URL on web app', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_ROLE', 'web');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://getpropertypro.com');
    expect(getWebAppHostnameFromEnv()).toBe('getpropertypro.com');
  });

  it('does not use NEXT_PUBLIC_APP_URL when admin app role is set', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_ROLE', 'admin');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://admin.getpropertypro.com');
    expect(getWebAppHostnameFromEnv()).toBe('getpropertypro.com');
  });
});
