import { describe, it, expect } from 'vitest';
import { galleryBlockSchema, type GalleryBlockContent } from '../../src/site-blocks/gallery';

const img = (i: number) => ({
  imagePath: `42/content/photo-${i}.webp`,
  altText: `Community photo ${i}`,
});

describe('galleryBlockSchema', () => {
  const valid: GalleryBlockContent = {
    heading: 'Around the Community',
    images: [
      { imagePath: '42/content/pool.webp', altText: 'The heated pool at dusk', caption: 'Pool deck' },
      { imagePath: '42/content/lobby.webp', altText: 'The renovated lobby' },
    ],
  };

  it('accepts a minimally valid gallery (one image with alt)', () => {
    const minimal = { images: [{ imagePath: '42/content/a.webp', altText: 'A' }] };
    expect(galleryBlockSchema.safeParse(minimal).success).toBe(true);
  });

  it('accepts a fully-populated gallery', () => {
    expect(galleryBlockSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts a decorative image without alt text', () => {
    const decorative = {
      images: [{ imagePath: '42/content/pattern.webp', decorative: true as const }],
    };
    expect(galleryBlockSchema.safeParse(decorative).success).toBe(true);
  });

  it('rejects an image with neither alt text nor decorative flag', () => {
    expect(
      galleryBlockSchema.safeParse({ images: [{ imagePath: '42/content/a.webp' }] }).success,
    ).toBe(false);
  });

  it('rejects an image that is both decorative and has alt text', () => {
    expect(
      galleryBlockSchema.safeParse({
        images: [{ imagePath: '42/content/a.webp', decorative: true, altText: 'A' }],
      }).success,
    ).toBe(false);
  });

  it('rejects when images is missing', () => {
    const { images: _images, ...withoutImages } = valid;
    expect(galleryBlockSchema.safeParse(withoutImages).success).toBe(false);
  });

  it('rejects an empty images array', () => {
    expect(galleryBlockSchema.safeParse({ ...valid, images: [] }).success).toBe(false);
  });

  it('rejects more than 24 images', () => {
    const images = Array.from({ length: 25 }, (_, i) => img(i));
    expect(galleryBlockSchema.safeParse({ images }).success).toBe(false);
  });

  it('accepts exactly 24 images', () => {
    const images = Array.from({ length: 24 }, (_, i) => img(i));
    expect(galleryBlockSchema.safeParse({ images }).success).toBe(true);
  });

  it('rejects an image path with traversal segments', () => {
    expect(
      galleryBlockSchema.safeParse({
        images: [{ imagePath: '42/content/../secret.webp', altText: 'x' }],
      }).success,
    ).toBe(false);
  });

  it('rejects an image path with the wrong shape', () => {
    expect(
      galleryBlockSchema.safeParse({ images: [{ imagePath: 'not-a-valid-path', altText: 'x' }] })
        .success,
    ).toBe(false);
  });

  it('rejects a caption longer than 200 chars', () => {
    expect(
      galleryBlockSchema.safeParse({
        images: [{ imagePath: '42/content/a.webp', altText: 'A', caption: 'a'.repeat(201) }],
      }).success,
    ).toBe(false);
  });

  it('rejects a heading longer than 120 chars', () => {
    expect(galleryBlockSchema.safeParse({ ...valid, heading: 'a'.repeat(121) }).success).toBe(false);
  });

  it('rejects unknown top-level keys (strict)', () => {
    expect(galleryBlockSchema.safeParse({ ...valid, extra: true }).success).toBe(false);
  });

  it('rejects unknown keys inside an image (strict)', () => {
    expect(
      galleryBlockSchema.safeParse({
        images: [{ imagePath: '42/content/a.webp', altText: 'A', extra: 1 }],
      }).success,
    ).toBe(false);
  });
});
