import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('getCookieOptions', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    // Reset module cache so getCookieOptions re-reads env
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  async function loadGetCookieOptions() {
    const mod = await import('../src/supabase/cookie-config');
    return mod.getCookieOptions;
  }

  it('returns domain and secure when set in production', async () => {
    process.env.NEXT_PUBLIC_COOKIE_DOMAIN = '.propertyprofl.com';
    process.env.NODE_ENV = 'production';
    const getCookieOptions = await loadGetCookieOptions();
    expect(getCookieOptions()).toEqual({ domain: '.propertyprofl.com', secure: true });
  });

  it('returns domain without secure in development', async () => {
    process.env.NEXT_PUBLIC_COOKIE_DOMAIN = '.propertyprofl.com';
    process.env.NODE_ENV = 'development';
    const getCookieOptions = await loadGetCookieOptions();
    expect(getCookieOptions()).toEqual({ domain: '.propertyprofl.com' });
  });

  it('returns undefined when cookie domain is empty', async () => {
    process.env.NEXT_PUBLIC_COOKIE_DOMAIN = '';
    const getCookieOptions = await loadGetCookieOptions();
    expect(getCookieOptions()).toBeUndefined();
  });

  it('returns undefined when cookie domain is unset', async () => {
    delete process.env.NEXT_PUBLIC_COOKIE_DOMAIN;
    const getCookieOptions = await loadGetCookieOptions();
    expect(getCookieOptions()).toBeUndefined();
  });

  it('trims whitespace from domain', async () => {
    process.env.NEXT_PUBLIC_COOKIE_DOMAIN = '  .example.com  ';
    process.env.NODE_ENV = 'development';
    const getCookieOptions = await loadGetCookieOptions();
    expect(getCookieOptions()).toEqual({ domain: '.example.com' });
  });

  it('warns when domain does not start with dot', async () => {
    process.env.NEXT_PUBLIC_COOKIE_DOMAIN = 'example.com';
    process.env.NODE_ENV = 'development';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const getCookieOptions = await loadGetCookieOptions();
    getCookieOptions();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('should start with "."'),
    );
    warnSpy.mockRestore();
  });

  it('returns whitespace-only as undefined', async () => {
    process.env.NEXT_PUBLIC_COOKIE_DOMAIN = '   ';
    const getCookieOptions = await loadGetCookieOptions();
    expect(getCookieOptions()).toBeUndefined();
  });

  it('does not include secure when NODE_ENV is test', async () => {
    process.env.NEXT_PUBLIC_COOKIE_DOMAIN = '.test.com';
    process.env.NODE_ENV = 'test';
    const getCookieOptions = await loadGetCookieOptions();
    expect(getCookieOptions()).toEqual({ domain: '.test.com' });
  });
});
