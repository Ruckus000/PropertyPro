/**
 * The stock photo build script. The build itself needs the network and writes
 * files, so the unit test covers only the pure part: which URL a photo is
 * fetched from. (Tests must not write inside the repo.)
 */
import { describe, it, expect } from 'vitest';
import { stockPhotoDownloadUrl, stockPhotoEncoding } from '../build-stock-photos';

describe('stockPhotoDownloadUrl', () => {
  it('asks Unsplash for a 4000px wide, high quality JPEG of the image id', () => {
    expect(stockPhotoDownloadUrl('photo-1625698939138-a064465b1931')).toBe(
      'https://images.unsplash.com/photo-1625698939138-a064465b1931?w=4000&q=90&fm=jpg',
    );
  });
});

describe('stockPhotoEncoding', () => {
  it('encodes every file at quality 72 by default', () => {
    for (const width of [2400, 1200, 480] as const) {
      expect(stockPhotoEncoding('sea-oats', width)).toEqual({ quality: 72 });
    }
  });

  it('gives the two heaviest look defaults a lighter 2400 file, and leaves their smaller files alone', () => {
    // Dense foliage: at quality 72 their 2400 files were ~989 KB and ~844 KB, on
    // the image a look's page paints first.
    expect(stockPhotoEncoding('palm-walk', 2400)).toEqual({ quality: 55, soften: 0.8, effort: 6, smartSubsample: true });
    expect(stockPhotoEncoding('oak-avenue', 2400)).toEqual({ quality: 60, soften: 0.8, effort: 6, smartSubsample: true });
    expect(stockPhotoEncoding('palm-walk', 1200)).toEqual({ quality: 72 });
    expect(stockPhotoEncoding('oak-avenue', 480)).toEqual({ quality: 72 });
  });
});
