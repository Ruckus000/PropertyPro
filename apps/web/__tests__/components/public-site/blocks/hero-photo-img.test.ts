/**
 * How a hero photo becomes an <img>, whichever kind it is.
 *
 * An upload is served from storage in two sizes (a srcset); a stock photo is
 * one file in the web app's public/site-looks/ (D3). The stock half is checked
 * against the files themselves: a STOCK_PHOTO_SRC entry with no file behind it
 * is a broken image on every site that uses that look, and a size that does
 * not match its file makes the hero jump as the photo loads.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { STOCK_PHOTO_IDS, STOCK_PHOTO_SRC } from '@propertypro/shared';
import {
  STOCK_PHOTO_SIZE,
  heroPhotoImgAttributes,
  heroPhotoKey,
} from '@/components/public-site/blocks/hero-photo-img';

// The root `pnpm test` runner and a direct `vitest` run inside apps/web have
// different working directories — same approach as `view-registry.test.ts`.
const PUBLIC_DIR = [join(process.cwd(), 'public'), join(process.cwd(), 'apps/web/public')].find(
  (dir) => existsSync(join(dir, 'marketing')),
)!;

/** A WebP's pixel size, read from its header: lossy (VP8), lossless (VP8L) or extended (VP8X). */
function webpSize(file: Buffer): { width: number; height: number } {
  expect(file.toString('ascii', 0, 4)).toBe('RIFF');
  expect(file.toString('ascii', 8, 12)).toBe('WEBP');
  const chunk = file.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') {
    // Frame tag (3 bytes), start code 9d 01 2a, then 14-bit width and height.
    expect(file.readUIntBE(23, 3)).toBe(0x9d012a);
    return { width: file.readUInt16LE(26) & 0x3fff, height: file.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    const bits = file.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') {
    return { width: file.readUIntLE(24, 3) + 1, height: file.readUIntLE(27, 3) + 1 };
  }
  throw new Error(`Unrecognised WebP chunk "${chunk}"`);
}

describe('stock photo files', () => {
  it.each(STOCK_PHOTO_IDS)('%s is a WebP in public/ at the size its <img> claims', (id) => {
    const file = join(PUBLIC_DIR, STOCK_PHOTO_SRC[id]);
    expect(existsSync(file), `${STOCK_PHOTO_SRC[id]} is missing from apps/web/public`).toBe(true);
    expect(webpSize(readFileSync(file))).toEqual(STOCK_PHOTO_SIZE[id]);
  });
});

describe('heroPhotoImgAttributes', () => {
  // Uploads resolve through the CDN base when one is configured; these cases
  // pin the relative fallback, like HeroBlock.test.tsx.
  const savedEnv = process.env.NEXT_PUBLIC_SUPABASE_URL;
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  });
  afterEach(() => {
    if (savedEnv === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = savedEnv;
  });

  it('serves a stock photo from the site, with its own size and no srcset', () => {
    expect(heroPhotoImgAttributes({ stock: 'sunset', alt: 'Sunset over the water' })).toEqual({
      src: '/site-looks/sunset.webp',
      alt: 'Sunset over the water',
      width: 1440,
      height: 1080,
    });
  });

  it('serves an upload from storage in two sizes, exactly as before', () => {
    expect(heroPhotoImgAttributes({ path: '1/hero/pool.jpg', alt: 'The pool' })).toEqual({
      src: '/site-assets/1/hero/pool.jpg.1600w.webp',
      srcSet: '/site-assets/1/hero/pool.jpg.800w.webp 800w, /site-assets/1/hero/pool.jpg.1600w.webp 1600w',
      sizes: '(min-width: 1024px) 768px, 100vw',
      alt: 'The pool',
      width: 1600,
      height: 900,
    });
  });

  it('gives a decorative upload an empty alt', () => {
    expect(heroPhotoImgAttributes({ path: '1/hero/texture.jpg', decorative: true }).alt).toBe('');
  });
});

describe('heroPhotoKey', () => {
  it('keys an upload by its path, so it keeps its key when the photos are reordered', () => {
    expect(heroPhotoKey({ path: '1/hero/pool.jpg', alt: 'The pool' }, 3)).toBe('1/hero/pool.jpg');
  });

  it('gives the same stock photo a different key in each place it appears', () => {
    const sunset = { stock: 'sunset' as const, alt: 'Sunset over the water' };
    const keys = [heroPhotoKey(sunset, 0), heroPhotoKey(sunset, 1)];
    expect(new Set(keys).size).toBe(2);
    // ...and never one an upload could have: storage paths start with a community id.
    expect(keys.every((key) => !/^\d+\//.test(key))).toBe(true);
  });
});
