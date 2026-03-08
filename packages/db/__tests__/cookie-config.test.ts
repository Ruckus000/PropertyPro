import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to test getCookieOptions in isolation, manipulating env vars per test.
// Dynamic import after setting env vars ensures fresh module evaluation.

describe('getCookieOptions', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset module cache so each test gets a fresh import
    vi.resetModules();
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
  });

  async function importGetCookieOptions() {
    const mod = await import('../src/supabase/cookie-config');
    return mod.getCookieOptions;
  }

  it('returns domain and secure when NEXT_PUBLIC_COOKIE_DOMAIN is set in production', async () => {
    process.env.NEXT_PUBLIC_COOKIE_DOMAIN = '.propertyprofl.com';
    process.env.NODE_ENV = 'production';
    const getCookieOptions = await importGetCookieOptions();

    const result = getCookieOptions();
    expect(result).toEqual({ domain: '.propertyprofl.com', secure: true });
  });

  it('returns domain without secure in development', async () => {
    process.env.NEXT_PUBLIC_COOKIE_DOMAIN = '.propertyprofl.com';
    process.env.NODE_ENV = 'development';
    const getCookieOptions = await importGetCookieOptions();

    const result = getCookieOptions();
    expect(result).toEqual({ domain: '.propertyprofl.com' });
  });

  it('returns undefined when NEXT_PUBLIC_COOKIE_DOMAIN is empty', async () => {
    process.env.NEXT_PUBLIC_COOKIE_DOMAIN = '';
    const getCookieOptions = await importGetCookieOptions();

    expect(getCookieOptions()).toBeUndefined();
  });

  it('returns undefined when NEXT_PUBLIC_COOKIE_DOMAIN is not set', async () => {
    delete process.env.NEXT_PUBLIC_COOKIE_DOMAIN;
    const getCookieOptions = await importGetCookieOptions();

    expect(getCookieOptions()).toBeUndefined();
  });

  it('trims whitespace from NEXT_PUBLIC_COOKIE_DOMAIN', async () => {
    process.env.NEXT_PUBLIC_COOKIE_DOMAIN = '  .example.com  ';
    process.env.NODE_ENV = 'development';
    const getCookieOptions = await importGetCookieOptions();

    const result = getCookieOptions();
    expect(result).toEqual({ domain: '.example.com' });
  });

  it('returns undefined when NEXT_PUBLIC_COOKIE_DOMAIN is only whitespace', async () => {
    process.env.NEXT_PUBLIC_COOKIE_DOMAIN = '   ';
    const getCookieOptions = await importGetCookieOptions();

    expect(getCookieOptions()).toBeUndefined();
  });

  it('logs a warning when domain does not start with "."', async () => {
    process.env.NEXT_PUBLIC_COOKIE_DOMAIN = 'example.com';
    process.env.NODE_ENV = 'development';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const getCookieOptions = await importGetCookieOptions();

    const result = getCookieOptions();
    expect(result).toEqual({ domain: 'example.com' });
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('should start with "."'),
    );

    warnSpy.mockRestore();
  });

  it('does not log a warning when domain starts with "."', async () => {
    process.env.NEXT_PUBLIC_COOKIE_DOMAIN = '.propertyprofl.com';
    process.env.NODE_ENV = 'development';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const getCookieOptions = await importGetCookieOptions();

    getCookieOptions();
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});
