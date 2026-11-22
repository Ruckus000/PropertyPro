import { beforeEach, describe, expect, it, vi } from 'vitest';
const { cookieGet } = vi.hoisted(() => ({ cookieGet: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: cookieGet }) }));
import { isDesignPreviewOn } from '@/lib/design-preview';

describe('design preview gate', () => {
  beforeEach(() => {
    vi.stubEnv('DESIGN_PREVIEW_USER_IDS', 'u-1, u-2');
    vi.stubEnv('NODE_ENV', 'production');
    cookieGet.mockReset().mockReturnValue(undefined);
  });
  it('is on only for listed users', async () => {
    expect(await isDesignPreviewOn('u-2')).toBe(true);
    expect(await isDesignPreviewOn('u-9')).toBe(false);
  });
  it('is off for everyone when the list is unset', async () => {
    vi.stubEnv('DESIGN_PREVIEW_USER_IDS', '');
    expect(await isDesignPreviewOn('u-1')).toBe(false);
    expect(await isDesignPreviewOn('')).toBe(false);
  });
  it('ignores the cookie in a production build', async () => {
    cookieGet.mockReturnValue({ value: '1' });
    expect(await isDesignPreviewOn('u-9')).toBe(false);
  });
  it('honours the cookie in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    cookieGet.mockReturnValue({ value: '1' });
    expect(await isDesignPreviewOn('u-9')).toBe(true);
    cookieGet.mockReturnValue({ value: 'true' });
    expect(await isDesignPreviewOn('u-9')).toBe(false);
  });
  it('is off, not an error, when reading cookies throws', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    cookieGet.mockImplementation(() => { throw new Error('no request scope'); });
    await expect(isDesignPreviewOn('u-9')).resolves.toBe(false);
  });
});
