import { describe, expect, it } from 'vitest';
import { validateBlockContent } from '../src/site-blocks';

describe('validateBlockContent', () => {
  it('returns null for a valid hero block', () => {
    const result = validateBlockContent('hero', {
      headline: 'Welcome to Our Community',
      subheadline: 'A great place to live',
      ctaLabel: 'Learn More',
      ctaHref: '/about',
    });
    expect(result).toBeNull();
  });

  it('returns error for hero with headline > 120 chars', () => {
    const result = validateBlockContent('hero', {
      headline: 'A'.repeat(121),
      subheadline: 'Sub',
      ctaLabel: 'Click',
      ctaHref: '/go',
    });
    expect(result).toBe('Headline required, max 120 chars');
  });

  it('returns error for hero missing ctaHref', () => {
    const result = validateBlockContent('hero', {
      headline: 'Welcome',
      subheadline: 'Sub',
      ctaLabel: 'Click',
      ctaHref: '',
    });
    expect(result).toBe('CTA href required');
  });

  it('returns null for a valid contact block', () => {
    const result = validateBlockContent('contact', {
      boardEmail: 'board@example.com',
      managementCompany: 'Acme Management',
    });
    expect(result).toBeNull();
  });

  it('returns error for contact missing boardEmail', () => {
    const result = validateBlockContent('contact', {
      managementCompany: 'Acme Management',
    });
    expect(result).toBe('Board email required');
  });

  it('returns error for text with body > 5000 chars', () => {
    const result = validateBlockContent('text', {
      body: 'X'.repeat(5001),
    });
    expect(result).toBe('Body text max 5000 chars');
  });

  it('returns error for image missing alt text', () => {
    const result = validateBlockContent('image', {
      url: 'https://example.com/image.png',
      alt: '',
    });
    expect(result).toBe('Alt text required, max 200 chars');
  });

  it('returns error for announcements with limit=0', () => {
    const result = validateBlockContent('announcements', {
      title: 'News',
      limit: 0,
    });
    expect(result).toBe('Limit must be 1-10');
  });

  it('returns null for announcements with limit=5', () => {
    const result = validateBlockContent('announcements', {
      title: 'News',
      limit: 5,
    });
    expect(result).toBeNull();
  });

  it('returns error for unknown block type', () => {
    const result = validateBlockContent('unknown' as 'hero', { foo: 'bar' });
    expect(result).toBe('Unknown block type: unknown');
  });
});
