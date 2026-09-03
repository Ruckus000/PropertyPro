import { describe, it, expect } from 'vitest';
import { BLOCK_TYPES, blockSchemaRegistry } from '../../src/site-blocks/index';

/** Minimal valid content per type, so the only variable is `hidden`. */
const VALID: Record<string, unknown> = {
  hero: { headline: 'Sunset Condos' },
  text: { body: 'Board meeting Tuesday.' },
  image: { imagePath: '1/content/a-pool.jpg', altText: 'The community pool' },
  documents: {},
  meetings: {},
  announcements: {},
  contact: {},
  faq: { items: [{ question: 'When is trash day?', answer: 'Tuesday.' }] },
  gallery: { images: [{ imagePath: '1/content/a-pool.jpg', altText: 'Pool' }] },
  amenities: { items: [{ name: 'Pool' }] },
  payments: {},
};

const HIDEABLE = BLOCK_TYPES.filter((t) => t !== 'hero');

describe('hidden field', () => {
  it('every hideable block type accepts hidden: true', () => {
    for (const blockType of HIDEABLE) {
      const result = blockSchemaRegistry[blockType].safeParse({
        ...(VALID[blockType] as object),
        hidden: true,
      });
      expect(result.success, `${blockType} rejected hidden: true`).toBe(true);
    }
  });

  it('every hideable block type still accepts content without hidden', () => {
    for (const blockType of HIDEABLE) {
      const result = blockSchemaRegistry[blockType].safeParse(VALID[blockType]);
      expect(result.success, `${blockType} rejected content without hidden`).toBe(true);
    }
  });

  it('hero rejects hidden — the welcome region cannot be hidden', () => {
    const result = blockSchemaRegistry.hero.safeParse({ ...(VALID.hero as object), hidden: true });
    expect(result.success).toBe(false);
  });

  it('hidden: false is rejected — absence means visible', () => {
    const result = blockSchemaRegistry.text.safeParse({ body: 'x', hidden: false });
    expect(result.success).toBe(false);
  });
});
