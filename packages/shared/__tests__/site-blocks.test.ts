import { describe, expect, it } from 'vitest';
import { validateBlockContent, isSafeUrl, isSafeImageUrl } from '../src/site-blocks';

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

  it('returns error for hero with javascript: ctaHref', () => {
    const result = validateBlockContent('hero', {
      headline: 'Welcome',
      subheadline: 'Sub',
      ctaLabel: 'Click',
      ctaHref: 'javascript:alert(1)',
    });
    expect(result).toMatch(/safe protocol/i);
  });

  it('returns error for hero with javascript: backgroundImageUrl', () => {
    const result = validateBlockContent('hero', {
      headline: 'Welcome',
      subheadline: 'Sub',
      ctaLabel: 'Click',
      ctaHref: '/about',
      backgroundImageUrl: 'javascript:alert(1)',
    });
    expect(result).toMatch(/safe protocol/i);
  });

  it('returns null for hero with https ctaHref', () => {
    const result = validateBlockContent('hero', {
      headline: 'Welcome',
      subheadline: 'Sub',
      ctaLabel: 'Click',
      ctaHref: 'https://example.com/about',
    });
    expect(result).toBeNull();
  });

  it('returns error for image with javascript: url', () => {
    const result = validateBlockContent('image', {
      url: 'javascript:alert(1)',
      alt: 'An image',
    });
    expect(result).toMatch(/safe protocol/i);
  });

  it('returns error for image with data:text url', () => {
    const result = validateBlockContent('image', {
      url: 'data:text/html,<script>alert(1)</script>',
      alt: 'An image',
    });
    expect(result).toMatch(/safe protocol/i);
  });

  it('returns null for image with https url', () => {
    const result = validateBlockContent('image', {
      url: 'https://cdn.example.com/photo.jpg',
      alt: 'An image',
    });
    expect(result).toBeNull();
  });

  it('returns error for unknown block type', () => {
    const result = validateBlockContent('unknown' as 'hero', { foo: 'bar' });
    expect(result).toBe('Unknown block type: unknown');
  });
});

describe('isSafeUrl', () => {
  it('allows https URLs', () => expect(isSafeUrl('https://example.com')).toBe(true));
  it('allows http URLs', () => expect(isSafeUrl('http://example.com')).toBe(true));
  it('allows mailto URLs', () => expect(isSafeUrl('mailto:x@y.com')).toBe(true));
  it('allows tel URLs', () => expect(isSafeUrl('tel:+15551234567')).toBe(true));
  it('allows relative paths', () => expect(isSafeUrl('/about')).toBe(true));
  it('allows hash fragments', () => expect(isSafeUrl('#section')).toBe(true));
  it('rejects javascript:', () => expect(isSafeUrl('javascript:alert(1)')).toBe(false));
  it('rejects data:', () => expect(isSafeUrl('data:text/html,<h1>hi</h1>')).toBe(false));
  it('rejects vbscript:', () => expect(isSafeUrl('vbscript:msgbox')).toBe(false));
  it('rejects empty string', () => expect(isSafeUrl('')).toBe(false));
});

describe('isSafeImageUrl', () => {
  it('allows https URLs', () => expect(isSafeImageUrl('https://cdn.example.com/img.jpg')).toBe(true));
  it('allows relative paths', () => expect(isSafeImageUrl('/images/photo.png')).toBe(true));
  it('allows data:image/ URIs', () => expect(isSafeImageUrl('data:image/png;base64,abc')).toBe(true));
  it('rejects data:text URIs', () => expect(isSafeImageUrl('data:text/html,<script>')).toBe(false));
  it('rejects javascript:', () => expect(isSafeImageUrl('javascript:alert(1)')).toBe(false));
  it('rejects empty string', () => expect(isSafeImageUrl('')).toBe(false));
});
