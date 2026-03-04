/**
 * Site Builder — Publish flow lifecycle tests.
 *
 * Tests the validation and default content lifecycle:
 * 1. Default content generation passes validation
 * 2. Draft/publish state transitions
 * 3. Content modification and re-validation
 * 4. Block ordering simulation
 */
import { describe, it, expect } from 'vitest';
import {
  validateBlockContent,
  getDefaultBlockContent,
  BLOCK_TYPES,
  type BlockType,
  type BlockContent,
  type HeroBlockContent,
  type ContactBlockContent,
  type ImageBlockContent,
} from '@propertypro/shared/site-blocks';

describe('publish lifecycle — content validation', () => {
  it('validates that all defaults except hero/contact/image/text pass validation', () => {
    // Default content for announcements, documents, and meetings should pass
    const passingTypes: BlockType[] = ['announcements', 'documents', 'meetings'];
    for (const blockType of passingTypes) {
      const content = getDefaultBlockContent(blockType);
      const result = validateBlockContent(blockType, content);
      expect(result).toBeNull();
    }
  });

  it('hero default has empty headline so fails validation', () => {
    const content = getDefaultBlockContent('hero');
    const result = validateBlockContent('hero', content);
    expect(result).not.toBeNull();
  });

  it('contact default has empty boardEmail so fails validation', () => {
    const content = getDefaultBlockContent('contact');
    const result = validateBlockContent('contact', content);
    expect(result).not.toBeNull();
  });

  it('image default has empty url so fails validation', () => {
    const content = getDefaultBlockContent('image');
    const result = validateBlockContent('image', content);
    expect(result).not.toBeNull();
  });

  it('text default has empty body so fails validation', () => {
    const content = getDefaultBlockContent('text');
    const result = validateBlockContent('text', content);
    expect(result).not.toBeNull();
  });
});

describe('publish lifecycle — content modification', () => {
  it('allows modifying hero content and re-validating', () => {
    const modified: HeroBlockContent = {
      headline: 'Updated Headline',
      subheadline: 'Updated Subheadline',
      ctaLabel: 'Learn More',
      ctaHref: '/about',
      backgroundImageUrl: 'https://example.com/bg.jpg',
    };
    const result = validateBlockContent('hero', modified);
    expect(result).toBeNull();
  });

  it('allows modifying announcements content', () => {
    const result = validateBlockContent('announcements', {
      title: 'Latest News',
      limit: 8,
    });
    expect(result).toBeNull();
  });

  it('allows modifying documents content with categoryIds', () => {
    const result = validateBlockContent('documents', {
      title: 'Important Documents',
      categoryIds: [1, 2, 3],
    });
    expect(result).toBeNull();
  });

  it('allows modifying meetings content', () => {
    const result = validateBlockContent('meetings', {
      title: 'Board Meetings',
    });
    expect(result).toBeNull();
  });

  it('allows modifying contact content with all fields', () => {
    const modified: ContactBlockContent = {
      boardEmail: 'board@community.com',
      managementCompany: 'ABC Property Mgmt',
      phone: '(305) 555-0100',
      address: '123 Ocean Dr, Miami, FL',
    };
    const result = validateBlockContent('contact', modified);
    expect(result).toBeNull();
  });

  it('allows modifying text content', () => {
    const result = validateBlockContent('text', {
      body: 'Welcome to our community.',
    });
    expect(result).toBeNull();
  });

  it('validates image content after user fills in required fields', () => {
    const modified: ImageBlockContent = {
      url: 'https://example.com/community-pool.jpg',
      alt: 'Community swimming pool',
      caption: 'Our beautiful pool area',
    };
    const result = validateBlockContent('image', modified);
    expect(result).toBeNull();
  });
});

describe('publish lifecycle — block ordering simulation', () => {
  interface SimulatedBlock {
    id: number;
    block_type: BlockType;
    block_order: number;
    content: BlockContent;
    is_draft: boolean;
  }

  it('simulates adding blocks in order', () => {
    const blocks: SimulatedBlock[] = [
      { id: 1, block_type: 'hero', block_order: 0, content: getDefaultBlockContent('hero'), is_draft: true },
      { id: 2, block_type: 'announcements', block_order: 1, content: getDefaultBlockContent('announcements'), is_draft: true },
      { id: 3, block_type: 'contact', block_order: 2, content: getDefaultBlockContent('contact'), is_draft: true },
    ];

    expect(blocks).toHaveLength(3);
    expect(blocks[0]!.block_order).toBe(0);
    expect(blocks[1]!.block_order).toBe(1);
    expect(blocks[2]!.block_order).toBe(2);
  });

  it('simulates reordering blocks', () => {
    const blocks: SimulatedBlock[] = [
      { id: 1, block_type: 'hero', block_order: 0, content: getDefaultBlockContent('hero'), is_draft: true },
      { id: 2, block_type: 'announcements', block_order: 1, content: getDefaultBlockContent('announcements'), is_draft: true },
      { id: 3, block_type: 'contact', block_order: 2, content: getDefaultBlockContent('contact'), is_draft: true },
    ];

    // Move contact (id=3) to first position
    const moved = blocks.splice(2, 1)[0]!;
    blocks.unshift(moved);
    const reordered = blocks.map((b, i) => ({ ...b, block_order: i }));

    expect(reordered[0]!.id).toBe(3);
    expect(reordered[0]!.block_order).toBe(0);
    expect(reordered[1]!.id).toBe(1);
    expect(reordered[1]!.block_order).toBe(1);
    expect(reordered[2]!.id).toBe(2);
    expect(reordered[2]!.block_order).toBe(2);
  });

  it('simulates publish transition (draft -> published)', () => {
    const blocks: SimulatedBlock[] = [
      { id: 1, block_type: 'hero', block_order: 0, content: getDefaultBlockContent('hero'), is_draft: true },
      { id: 2, block_type: 'announcements', block_order: 1, content: getDefaultBlockContent('announcements'), is_draft: true },
    ];

    expect(blocks.every((b) => b.is_draft)).toBe(true);
    const published = blocks.map((b) => ({ ...b, is_draft: false }));
    expect(published.every((b) => !b.is_draft)).toBe(true);
  });

  it('simulates discard (removes all drafts, keeps published)', () => {
    const blocks: SimulatedBlock[] = [
      { id: 1, block_type: 'hero', block_order: 0, content: getDefaultBlockContent('hero'), is_draft: false },
      { id: 2, block_type: 'announcements', block_order: 1, content: getDefaultBlockContent('announcements'), is_draft: true },
      { id: 3, block_type: 'text', block_order: 2, content: getDefaultBlockContent('text'), is_draft: true },
    ];

    const afterDiscard = blocks.filter((b) => !b.is_draft);
    expect(afterDiscard).toHaveLength(1);
    expect(afterDiscard[0]!.id).toBe(1);
  });
});

describe('content type safety', () => {
  it('each block type has distinct required fields', () => {
    // Hero needs headline, not just a random object
    const heroResult = validateBlockContent('hero', { limit: 5 });
    expect(heroResult).not.toBeNull();

    // Text needs body
    const textResult = validateBlockContent('text', { headline: 'Hello' });
    expect(textResult).not.toBeNull();

    // Contact needs boardEmail
    const contactResult = validateBlockContent('contact', { body: 'text' });
    expect(contactResult).not.toBeNull();
  });
});
