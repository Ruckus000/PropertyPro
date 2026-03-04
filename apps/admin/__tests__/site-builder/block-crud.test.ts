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
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('non-null object');
    }
  });

  it('rejects undefined content', () => {
    const result = validateBlockContent('hero', undefined);
    expect(result.valid).toBe(false);
  });

  it('rejects non-object content', () => {
    const result = validateBlockContent('hero', 'a string');
    expect(result.valid).toBe(false);
  });

  describe('hero block', () => {
    it('validates valid hero content', () => {
      const result = validateBlockContent('hero', {
        headline: 'Welcome',
        subheading: 'Great place',
      });
      expect(result.valid).toBe(true);
    });

    it('rejects missing headline', () => {
      const result = validateBlockContent('hero', {
        subheading: 'No headline',
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('headline');
      }
    });

    it('rejects empty headline', () => {
      const result = validateBlockContent('hero', { headline: '' });
      expect(result.valid).toBe(false);
    });
  });

  describe('announcements block', () => {
    it('validates valid announcements content', () => {
      const result = validateBlockContent('announcements', {
        maxItems: 5,
        showDate: true,
      });
      expect(result.valid).toBe(true);
    });

    it('rejects maxItems < 1', () => {
      const result = validateBlockContent('announcements', {
        maxItems: 0,
        showDate: true,
      });
      expect(result.valid).toBe(false);
    });

    it('rejects missing showDate', () => {
      const result = validateBlockContent('announcements', {
        maxItems: 5,
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('documents block', () => {
    it('validates valid documents content', () => {
      const result = validateBlockContent('documents', {
        maxItems: 10,
        showFileSize: true,
      });
      expect(result.valid).toBe(true);
    });

    it('rejects missing showFileSize', () => {
      const result = validateBlockContent('documents', { maxItems: 10 });
      expect(result.valid).toBe(false);
    });
  });

  describe('meetings block', () => {
    it('validates valid meetings content', () => {
      const result = validateBlockContent('meetings', {
        maxItems: 5,
        showLocation: true,
        showPastMeetings: false,
      });
      expect(result.valid).toBe(true);
    });

    it('rejects missing showPastMeetings', () => {
      const result = validateBlockContent('meetings', {
        maxItems: 5,
        showLocation: true,
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('contact block', () => {
    it('validates valid contact content', () => {
      const result = validateBlockContent('contact', {
        title: 'Contact Us',
        email: 'test@example.com',
        showForm: false,
      });
      expect(result.valid).toBe(true);
    });

    it('rejects empty title', () => {
      const result = validateBlockContent('contact', {
        title: '',
        showForm: false,
      });
      expect(result.valid).toBe(false);
    });

    it('rejects missing showForm', () => {
      const result = validateBlockContent('contact', {
        title: 'Contact',
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('text block', () => {
    it('validates valid text content', () => {
      const result = validateBlockContent('text', {
        body: 'Some text content',
        alignment: 'center',
      });
      expect(result.valid).toBe(true);
    });

    it('rejects empty body', () => {
      const result = validateBlockContent('text', { body: '' });
      expect(result.valid).toBe(false);
    });
  });

  describe('image block', () => {
    it('validates valid image content', () => {
      const result = validateBlockContent('image', {
        imageUrl: 'https://example.com/img.jpg',
        altText: 'A photo',
      });
      expect(result.valid).toBe(true);
    });

    it('rejects empty imageUrl', () => {
      const result = validateBlockContent('image', {
        imageUrl: '',
        altText: 'A photo',
      });
      expect(result.valid).toBe(false);
    });

    it('rejects missing altText', () => {
      const result = validateBlockContent('image', {
        imageUrl: 'https://example.com/img.jpg',
      });
      expect(result.valid).toBe(false);
    });
  });

  it('rejects unknown block type', () => {
    const result = validateBlockContent('unknown_type' as BlockType, {});
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('Unknown block type');
    }
  });
});

describe('getDefaultBlockContent', () => {
  it.each(BLOCK_TYPES)('returns valid default content for "%s" block', (blockType) => {
    const content = getDefaultBlockContent(blockType);
    expect(content).toBeDefined();
    expect(typeof content).toBe('object');

    // Default content should pass validation (except image which has empty imageUrl)
    if (blockType !== 'image') {
      const result = validateBlockContent(blockType, content);
      expect(result.valid).toBe(true);
    }
  });

  it('returns hero defaults with headline', () => {
    const content = getDefaultBlockContent('hero');
    expect(content).toHaveProperty('headline');
    expect((content as { headline: string }).headline.length).toBeGreaterThan(0);
  });

  it('returns announcements defaults with maxItems', () => {
    const content = getDefaultBlockContent('announcements');
    expect(content).toHaveProperty('maxItems');
    expect((content as { maxItems: number }).maxItems).toBeGreaterThan(0);
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
