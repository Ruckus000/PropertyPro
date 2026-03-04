/**
 * Site Builder — Block CRUD unit tests.
 *
 * Tests the block content validation logic and default content generation.
 * API route integration tests would require a running database; these
 * focus on the shared validation layer used by both client and server.
 */
import { describe, it, expect } from 'vitest';
import {
  validateBlockContent,
  getDefaultBlockContent,
  BLOCK_TYPES,
  type BlockType,
} from '@propertypro/shared/site-blocks';

describe('validateBlockContent', () => {
  it('rejects null content', () => {
    const result = validateBlockContent('hero', null);
    expect(result).not.toBeNull();
    expect(result).toContain('object');
  });

  it('rejects undefined content', () => {
    const result = validateBlockContent('hero', undefined);
    expect(result).not.toBeNull();
  });

  it('rejects non-object content', () => {
    const result = validateBlockContent('hero', 'a string');
    expect(result).not.toBeNull();
  });

  describe('hero block', () => {
    it('validates valid hero content', () => {
      const result = validateBlockContent('hero', {
        headline: 'Welcome',
        subheadline: 'Great place',
        ctaLabel: 'Learn More',
        ctaHref: '/about',
      });
      expect(result).toBeNull();
    });

    it('rejects missing headline', () => {
      const result = validateBlockContent('hero', {
        subheadline: 'No headline',
        ctaLabel: 'Click',
        ctaHref: '/about',
      });
      expect(result).not.toBeNull();
      expect(result).toContain('Headline');
    });

    it('rejects empty headline', () => {
      const result = validateBlockContent('hero', {
        headline: '',
        subheadline: 'Sub',
        ctaLabel: 'Click',
        ctaHref: '/',
      });
      expect(result).not.toBeNull();
    });

    it('rejects missing subheadline', () => {
      const result = validateBlockContent('hero', {
        headline: 'Hello',
        ctaLabel: 'Click',
        ctaHref: '/',
      });
      expect(result).not.toBeNull();
      expect(result).toContain('Subheadline');
    });

    it('rejects missing ctaLabel', () => {
      const result = validateBlockContent('hero', {
        headline: 'Hello',
        subheadline: 'World',
        ctaHref: '/',
      });
      expect(result).not.toBeNull();
      expect(result).toContain('CTA label');
    });

    it('rejects missing ctaHref', () => {
      const result = validateBlockContent('hero', {
        headline: 'Hello',
        subheadline: 'World',
        ctaLabel: 'Click',
      });
      expect(result).not.toBeNull();
      expect(result).toContain('CTA href');
    });
  });

  describe('announcements block', () => {
    it('validates valid announcements content', () => {
      const result = validateBlockContent('announcements', {
        title: 'News',
        limit: 5,
      });
      expect(result).toBeNull();
    });

    it('rejects limit < 1', () => {
      const result = validateBlockContent('announcements', {
        title: 'News',
        limit: 0,
      });
      expect(result).not.toBeNull();
    });

    it('rejects limit > 10', () => {
      const result = validateBlockContent('announcements', {
        title: 'News',
        limit: 11,
      });
      expect(result).not.toBeNull();
    });

    it('accepts content without explicit limit', () => {
      // limit validation only runs when limit is a number
      const result = validateBlockContent('announcements', {
        title: 'News',
      });
      expect(result).toBeNull();
    });
  });

  describe('documents block', () => {
    it('validates valid documents content', () => {
      const result = validateBlockContent('documents', {
        title: 'Docs',
        categoryIds: [1, 2],
      });
      expect(result).toBeNull();
    });

    it('accepts empty categoryIds (show all)', () => {
      const result = validateBlockContent('documents', {
        title: 'Docs',
        categoryIds: [],
      });
      expect(result).toBeNull();
    });

    it('accepts content without categoryIds', () => {
      const result = validateBlockContent('documents', { title: 'Docs' });
      expect(result).toBeNull();
    });
  });

  describe('meetings block', () => {
    it('validates valid meetings content', () => {
      const result = validateBlockContent('meetings', {
        title: 'Upcoming Meetings',
      });
      expect(result).toBeNull();
    });

    it('accepts minimal content', () => {
      const result = validateBlockContent('meetings', {});
      expect(result).toBeNull();
    });
  });

  describe('contact block', () => {
    it('validates valid contact content', () => {
      const result = validateBlockContent('contact', {
        boardEmail: 'board@example.com',
        managementCompany: 'ABC Mgmt',
        phone: '(305) 555-0100',
        address: '123 Ocean Dr',
      });
      expect(result).toBeNull();
    });

    it('rejects empty boardEmail', () => {
      const result = validateBlockContent('contact', {
        boardEmail: '',
      });
      expect(result).not.toBeNull();
    });

    it('rejects missing boardEmail', () => {
      const result = validateBlockContent('contact', {
        managementCompany: 'ABC',
      });
      expect(result).not.toBeNull();
    });

    it('accepts contact with only boardEmail', () => {
      const result = validateBlockContent('contact', {
        boardEmail: 'board@example.com',
      });
      expect(result).toBeNull();
    });
  });

  describe('text block', () => {
    it('validates valid text content', () => {
      const result = validateBlockContent('text', {
        body: 'Some text content',
      });
      expect(result).toBeNull();
    });

    it('rejects empty body', () => {
      const result = validateBlockContent('text', { body: '' });
      expect(result).not.toBeNull();
    });

    it('rejects body over 5000 chars', () => {
      const result = validateBlockContent('text', { body: 'x'.repeat(5001) });
      expect(result).not.toBeNull();
    });
  });

  describe('image block', () => {
    it('validates valid image content', () => {
      const result = validateBlockContent('image', {
        url: 'https://example.com/img.jpg',
        alt: 'A photo',
      });
      expect(result).toBeNull();
    });

    it('rejects empty url', () => {
      const result = validateBlockContent('image', {
        url: '',
        alt: 'A photo',
      });
      expect(result).not.toBeNull();
    });

    it('rejects missing alt', () => {
      const result = validateBlockContent('image', {
        url: 'https://example.com/img.jpg',
      });
      expect(result).not.toBeNull();
    });

    it('rejects alt over 200 chars', () => {
      const result = validateBlockContent('image', {
        url: 'https://example.com/img.jpg',
        alt: 'x'.repeat(201),
      });
      expect(result).not.toBeNull();
    });

    it('accepts optional caption', () => {
      const result = validateBlockContent('image', {
        url: 'https://example.com/img.jpg',
        alt: 'A photo',
        caption: 'Photo caption',
      });
      expect(result).toBeNull();
    });

    it('rejects caption over 300 chars', () => {
      const result = validateBlockContent('image', {
        url: 'https://example.com/img.jpg',
        alt: 'A photo',
        caption: 'x'.repeat(301),
      });
      expect(result).not.toBeNull();
    });
  });

  it('rejects unknown block type', () => {
    const result = validateBlockContent('unknown_type' as BlockType, {});
    expect(result).not.toBeNull();
    expect(result).toContain('Unknown block type');
  });
});

describe('getDefaultBlockContent', () => {
  it.each(BLOCK_TYPES)('returns defined default content for "%s" block', (blockType) => {
    const content = getDefaultBlockContent(blockType);
    expect(content).toBeDefined();
    expect(typeof content).toBe('object');
  });

  it('returns hero defaults with expected fields', () => {
    const content = getDefaultBlockContent('hero');
    expect(content).toHaveProperty('headline');
    expect(content).toHaveProperty('subheadline');
    expect(content).toHaveProperty('ctaLabel');
    expect(content).toHaveProperty('ctaHref');
  });

  it('returns announcements defaults with limit', () => {
    const content = getDefaultBlockContent('announcements');
    expect(content).toHaveProperty('limit');
    expect((content as { limit: number }).limit).toBeGreaterThan(0);
  });

  it('returns documents defaults with categoryIds', () => {
    const content = getDefaultBlockContent('documents');
    expect(content).toHaveProperty('categoryIds');
    expect(Array.isArray((content as { categoryIds: number[] }).categoryIds)).toBe(true);
  });

  it('returns meetings defaults with title', () => {
    const content = getDefaultBlockContent('meetings');
    expect(content).toHaveProperty('title');
  });

  it('returns contact defaults with boardEmail', () => {
    const content = getDefaultBlockContent('contact');
    expect(content).toHaveProperty('boardEmail');
  });

  it('returns text defaults with body', () => {
    const content = getDefaultBlockContent('text');
    expect(content).toHaveProperty('body');
  });

  it('returns image defaults with url and alt', () => {
    const content = getDefaultBlockContent('image');
    expect(content).toHaveProperty('url');
    expect(content).toHaveProperty('alt');
  });
});

describe('BLOCK_TYPES', () => {
  it('contains exactly 7 block types', () => {
    expect(BLOCK_TYPES).toHaveLength(7);
  });

  it('includes all expected types', () => {
    expect(BLOCK_TYPES).toContain('hero');
    expect(BLOCK_TYPES).toContain('announcements');
    expect(BLOCK_TYPES).toContain('documents');
    expect(BLOCK_TYPES).toContain('meetings');
    expect(BLOCK_TYPES).toContain('contact');
    expect(BLOCK_TYPES).toContain('text');
    expect(BLOCK_TYPES).toContain('image');
  });
});
