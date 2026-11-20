/**
 * The stock photo build script. The build itself needs the network and writes
 * files, so the unit test covers only the pure part: which URL a photo is
 * fetched from. (Tests must not write inside the repo.)
 */
import { describe, it, expect } from 'vitest';
import { stockPhotoDownloadUrl } from '../build-stock-photos';

describe('stockPhotoDownloadUrl', () => {
  it('asks Unsplash for a 4000px wide, high quality JPEG of the image id', () => {
    expect(stockPhotoDownloadUrl('photo-1625698939138-a064465b1931')).toBe(
      'https://images.unsplash.com/photo-1625698939138-a064465b1931?w=4000&q=90&fm=jpg',
    );
  });
});
