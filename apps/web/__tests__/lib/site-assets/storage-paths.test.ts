import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildSiteAssetPath, parseSiteAssetPath, buildPublicAssetUrl } from '@/lib/site-assets/storage-paths';

describe('buildSiteAssetPath', () => {
  it('produces {communityId}/{kind}/{uuid}-{filename}', () => {
    const path = buildSiteAssetPath(42, 'hero', 'beachfront.jpg');
    expect(path).toMatch(/^42\/hero\/[a-f0-9-]{36}-beachfront\.jpg$/);
  });

  it('sanitizes filename: keeps alphanumerics, dots, hyphens, underscores; lowercases', () => {
    const path = buildSiteAssetPath(7, 'content', 'My Photo!.jpg');
    expect(path).toMatch(/^7\/content\/[a-f0-9-]{36}-my_photo_\.jpg$/);
  });

  it('rejects communityId of 0 or negative', () => {
    expect(() => buildSiteAssetPath(0, 'hero', 'x.jpg')).toThrow();
    expect(() => buildSiteAssetPath(-1, 'hero', 'x.jpg')).toThrow();
  });

  it('rejects non-integer communityId', () => {
    expect(() => buildSiteAssetPath(1.5, 'hero', 'x.jpg')).toThrow();
  });

  it('rejects unknown kinds', () => {
    expect(() => buildSiteAssetPath(1, 'unknown' as never, 'x.jpg')).toThrow();
  });

  it('rejects filenames with path separators', () => {
    expect(() => buildSiteAssetPath(1, 'hero', '../etc/passwd')).toThrow();
    expect(() => buildSiteAssetPath(1, 'hero', 'a/b.jpg')).toThrow();
    expect(() => buildSiteAssetPath(1, 'hero', 'a\\b.jpg')).toThrow();
  });

  it('rejects filenames starting with a dot', () => {
    expect(() => buildSiteAssetPath(1, 'hero', '.htaccess')).toThrow();
  });
});

describe('parseSiteAssetPath', () => {
  it('decomposes a valid path', () => {
    const result = parseSiteAssetPath('42/hero/abc-def.webp');
    expect(result).toEqual({ communityId: 42, kind: 'hero', filename: 'abc-def.webp' });
  });

  it('preserves multi-segment filenames after the kind', () => {
    const result = parseSiteAssetPath('42/content/some-uuid-pool.webp.1600w.webp');
    expect(result).toEqual({ communityId: 42, kind: 'content', filename: 'some-uuid-pool.webp.1600w.webp' });
  });

  it('returns null for invalid path shapes', () => {
    expect(parseSiteAssetPath('hero/abc.webp')).toBeNull();
    expect(parseSiteAssetPath('42/unknown/x.webp')).toBeNull();
    expect(parseSiteAssetPath('')).toBeNull();
    expect(parseSiteAssetPath('abc/hero/x.webp')).toBeNull();
  });
});

describe('buildPublicAssetUrl', () => {
  const savedEnv = process.env.NEXT_PUBLIC_SUPABASE_URL;

  afterEach(() => {
    if (savedEnv === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = savedEnv;
  });

  it('returns a Supabase public-storage URL when NEXT_PUBLIC_SUPABASE_URL is set', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    const url = buildPublicAssetUrl('42/hero/abc.webp');
    expect(url).toBe('https://example.supabase.co/storage/v1/object/public/community-site-assets/42/hero/abc.webp');
  });

  it('falls back to relative /site-assets path when SUPABASE_URL is unset', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const url = buildPublicAssetUrl('42/hero/abc.webp');
    expect(url).toBe('/site-assets/42/hero/abc.webp');
  });
});
