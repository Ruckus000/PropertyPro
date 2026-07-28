import { describe, it, expect } from 'vitest';
import { imageBlockSchema, type ImageBlockContent } from '../../src/site-blocks/image';

describe('imageBlockSchema', () => {
  const valid: ImageBlockContent = {
    imagePath: '42/content/abc-pool.webp',
    altText: 'The pool deck at golden hour',
    caption: 'Renovated 2024.',
  };

  it('accepts a valid image block', () => {
    expect(imageBlockSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects when imagePath is missing', () => {
    const result = imageBlockSchema.safeParse({ altText: 'X' });
    expect(result.success).toBe(false);
  });

  it('rejects when altText is missing (non-decorative)', () => {
    const result = imageBlockSchema.safeParse({ imagePath: '42/content/x.webp' });
    expect(result.success).toBe(false);
  });

  it('allows explicit decorative image (no alt text required)', () => {
    const result = imageBlockSchema.safeParse({
      imagePath: '42/content/divider.webp',
      decorative: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects when decorative is true AND altText is set', () => {
    const result = imageBlockSchema.safeParse({
      imagePath: '42/content/x.webp',
      decorative: true,
      altText: 'X',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an imagePath outside the expected community path layout', () => {
    const result = imageBlockSchema.safeParse({
      imagePath: '../../../etc/passwd',
      altText: 'evil',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an imagePath with absolute scheme', () => {
    const result = imageBlockSchema.safeParse({
      imagePath: 'https://evil.com/x.webp',
      altText: 'evil',
    });
    expect(result.success).toBe(false);
  });

  it('rejects when caption exceeds 200 chars', () => {
    const result = imageBlockSchema.safeParse({ ...valid, caption: 'a'.repeat(201) });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields (strict mode)', () => {
    const result = imageBlockSchema.safeParse({ ...valid, srcSet: 'evil' });
    expect(result.success).toBe(false);
  });
});

describe('image block — layout variant', () => {
  const base = { imagePath: '1/content/a.jpg', altText: 'A' };

  it('accepts each known variant', () => {
    for (const variant of ['standard', 'wide', 'compact'] as const) {
      expect(imageBlockSchema.safeParse({ ...base, variant }).success).toBe(true);
    }
  });

  it('accepts content with no variant — absent means standard', () => {
    // Every stored row predates this field, so absent must stay valid or the
    // public site loses every image block the moment this ships.
    expect(imageBlockSchema.safeParse(base).success).toBe(true);
  });

  it('rejects an unknown variant', () => {
    expect(imageBlockSchema.safeParse({ ...base, variant: 'enormous' }).success).toBe(false);
  });
});
