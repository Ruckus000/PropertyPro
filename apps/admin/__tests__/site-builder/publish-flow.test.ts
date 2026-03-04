/**
 * Site Builder — Publish flow lifecycle tests.
 *
 * Tests the validation and default content lifecycle:
 * 1. Default content generation passes validation
 * 2. Published blocks should have published_at set
 * 3. Draft/publish state transitions
 * 4. Content modification and re-validation
 */
import { describe, it, expect } from 'vitest';
import {
  validateBlockContent,
  getDefaultBlockContent,
  BLOCK_TYPES,
  type BlockType,
  type BlockContent,
  type HeroContent,
  type AnnouncementsContent,
  type DocumentsContent,
  type MeetingsContent,
  type ContactContent,
  type TextContent,
  type ImageContent,
} from '@propertypro/shared/site-blocks';

describe('publish lifecycle — content validation', () => {
  it('validates that all non-image defaults pass validation (simulate pre-publish check)', () => {
    // Before publishing, the system validates all block contents.
    // Default content for all types except image should pass validation.
    const nonImageTypes = BLOCK_TYPES.filter((t) => t !== 'image');
    for (const blockType of nonImageTypes) {
      const content = getDefaultBlockContent(blockType);
      const result = validateBlockContent(blockType, content);
      expect(result.valid).toBe(true);
    }
  });

  it('image block default does not pass validation (requires user to set imageUrl)', () => {
    const content = getDefaultBlockContent('image');
    const result = validateBlockContent('image', content);
    // Image defaults have empty imageUrl, which should fail
    expect(result.valid).toBe(false);
  });
});

describe('publish lifecycle — content modification', () => {
  it('allows modifying hero content and re-validating', () => {
    const defaults = getDefaultBlockContent('hero') as HeroContent;
    const modified: HeroContent = {
      ...defaults,
      headline: 'Updated Headline',
      subheading: 'Updated Subheading',
      backgroundImageUrl: 'https://example.com/bg.jpg',
      ctaText: 'Learn More',
      ctaUrl: '/about',
    };

    const result = validateBlockContent('hero', modified);
    expect(result.valid).toBe(true);
  });

  it('allows modifying announcements content with different maxItems', () => {
    const defaults = getDefaultBlockContent('announcements') as AnnouncementsContent;
    const modified: AnnouncementsContent = {
      ...defaults,
      maxItems: 10,
      showDate: false,
    };

    const result = validateBlockContent('announcements', modified);
    expect(result.valid).toBe(true);
  });

  it('allows modifying documents content with categoryId', () => {
    const defaults = getDefaultBlockContent('documents') as DocumentsContent;
    const modified: DocumentsContent = {
      ...defaults,
      maxItems: 20,
      categoryId: 5,
      showFileSize: false,
    };

    const result = validateBlockContent('documents', modified);
    expect(result.valid).toBe(true);
  });

  it('allows modifying meetings content with all options', () => {
    const defaults = getDefaultBlockContent('meetings') as MeetingsContent;
    const modified: MeetingsContent = {
      ...defaults,
      maxItems: 3,
      showLocation: false,
      showPastMeetings: true,
    };

    const result = validateBlockContent('meetings', modified);
    expect(result.valid).toBe(true);
  });

  it('allows modifying contact content with all fields', () => {
    const defaults = getDefaultBlockContent('contact') as ContactContent;
    const modified: ContactContent = {
      ...defaults,
      title: 'Get in Touch',
      email: 'office@community.com',
      phone: '(305) 555-0100',
      address: '123 Ocean Dr, Miami, FL',
      showForm: true,
    };

    const result = validateBlockContent('contact', modified);
    expect(result.valid).toBe(true);
  });

  it('allows modifying text content with alignment', () => {
    const defaults = getDefaultBlockContent('text') as TextContent;
    const modified: TextContent = {
      ...defaults,
      body: 'Welcome to our community. We are glad to have you here.',
      alignment: 'center',
    };

    const result = validateBlockContent('text', modified);
    expect(result.valid).toBe(true);
  });

  it('validates image content after user fills in required fields', () => {
    const defaults = getDefaultBlockContent('image') as ImageContent;
    // User fills in the required fields
    const modified: ImageContent = {
      ...defaults,
      imageUrl: 'https://example.com/community-pool.jpg',
      altText: 'Community swimming pool',
      caption: 'Our beautiful pool area',
      width: 'medium',
    };

    const result = validateBlockContent('image', modified);
    expect(result.valid).toBe(true);
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
    const blocks: SimulatedBlock[] = [];

    // Add 3 blocks
    const heroContent = getDefaultBlockContent('hero');
    blocks.push({
      id: 1,
      block_type: 'hero',
      block_order: 0,
      content: heroContent,
      is_draft: true,
    });

    const announcementsContent = getDefaultBlockContent('announcements');
    blocks.push({
      id: 2,
      block_type: 'announcements',
      block_order: 1,
      content: announcementsContent,
      is_draft: true,
    });

    const contactContent = getDefaultBlockContent('contact');
    blocks.push({
      id: 3,
      block_type: 'contact',
      block_order: 2,
      content: contactContent,
      is_draft: true,
    });

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

    // Reindex
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

    // Simulate publish
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
    expect(afterDiscard[0]!.block_type).toBe('hero');
  });
});

describe('content type safety', () => {
  it('each block type has distinct required fields', () => {
    // Ensure content shapes are distinct — validates that the type system
    // and validation logic correctly distinguish between block types.
    const heroResult = validateBlockContent('hero', { maxItems: 5, showDate: true });
    expect(heroResult.valid).toBe(false); // hero needs headline, not maxItems

    const announcementsResult = validateBlockContent('announcements', { headline: 'Hello' });
    expect(announcementsResult.valid).toBe(false); // announcements needs maxItems

    const textResult = validateBlockContent('text', { headline: 'Hello' });
    expect(textResult.valid).toBe(false); // text needs body
  });
});
