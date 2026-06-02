import { describe, it, expect } from 'vitest';
import { heroBlockSchema, type HeroBlockContent } from '../../src/site-blocks/hero';

describe('heroBlockSchema', () => {
  const valid: HeroBlockContent = {
    headline: 'Welcome to Sunset Condos',
    subtitle: 'A welcoming Florida community since 1987.',
    ctaText: 'Resident Login',
    ctaTarget: '/auth/login',
  };

  it('accepts a minimally valid hero', () => {
    const minimal = { headline: 'Welcome' };
    expect(heroBlockSchema.safeParse(minimal).success).toBe(true);
  });

  it('accepts a fully-populated hero', () => {
    expect(heroBlockSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects when headline is missing', () => {
    const { headline: _, ...withoutHeadline } = valid;
    const result = heroBlockSchema.safeParse(withoutHeadline);
    expect(result.success).toBe(false);
  });

  it('rejects when headline is empty', () => {
    const result = heroBlockSchema.safeParse({ ...valid, headline: '' });
    expect(result.success).toBe(false);
  });

  it('rejects when headline exceeds 120 chars', () => {
    const result = heroBlockSchema.safeParse({ ...valid, headline: 'a'.repeat(121) });
    expect(result.success).toBe(false);
  });

  it('rejects when subtitle exceeds 280 chars', () => {
    const result = heroBlockSchema.safeParse({ ...valid, subtitle: 'a'.repeat(281) });
    expect(result.success).toBe(false);
  });

  it('rejects ctaTarget with non-https scheme', () => {
    const result = heroBlockSchema.safeParse({ ...valid, ctaTarget: 'http://evil.com' });
    expect(result.success).toBe(false);
  });

  it('rejects ctaTarget with protocol-relative URL', () => {
    const result = heroBlockSchema.safeParse({ ...valid, ctaTarget: '//evil.com' });
    expect(result.success).toBe(false);
  });

  it('rejects ctaTarget that is just two slashes', () => {
    const result = heroBlockSchema.safeParse({ ...valid, ctaTarget: '//' });
    expect(result.success).toBe(false);
  });

  it('still accepts a normal internal path with a single leading slash', () => {
    const result = heroBlockSchema.safeParse({ ...valid, ctaTarget: '/path/to/page' });
    expect(result.success).toBe(true);
  });

  it('accepts ctaTarget as internal path', () => {
    const result = heroBlockSchema.safeParse({ ...valid, ctaTarget: '/auth/login' });
    expect(result.success).toBe(true);
  });

  it('accepts ctaTarget as https URL', () => {
    const result = heroBlockSchema.safeParse({ ...valid, ctaTarget: 'https://example.com/portal' });
    expect(result.success).toBe(true);
  });

  it('rejects when ctaText is provided without ctaTarget', () => {
    const result = heroBlockSchema.safeParse({ headline: 'X', ctaText: 'Click' });
    expect(result.success).toBe(false);
  });

  it('rejects when ctaTarget is provided without ctaText', () => {
    const result = heroBlockSchema.safeParse({ headline: 'X', ctaTarget: '/x' });
    expect(result.success).toBe(false);
  });

  it('accepts a hero image path with required alt text', () => {
    const withImage = { ...valid, heroImagePath: '42/hero/abc-def.webp', heroImageAlt: 'The building at sunset' };
    expect(heroBlockSchema.safeParse(withImage).success).toBe(true);
  });

  it('rejects a hero image path without alt text', () => {
    const result = heroBlockSchema.safeParse({ ...valid, heroImagePath: '42/hero/abc.webp' });
    expect(result.success).toBe(false);
  });
});
