import { describe, expect, it } from 'vitest';
import { validateStarterPackBlocks } from '../src/site-blocks/starter-pack';

const HERO = { headline: 'Welcome', subtitle: 'A community.', ctaText: 'Resident Login', ctaTarget: '/auth/login' };

describe('validateStarterPackBlocks', () => {
  it('accepts a valid hero + SoR pack', () => {
    const res = validateStarterPackBlocks([
      { blockType: 'hero', blockOrder: 1, content: HERO },
      { blockType: 'announcements', blockOrder: 2, content: { limit: 5, timeWindowDays: 30 } },
      { blockType: 'contact', blockOrder: 3, content: { showBoard: true, showManagement: true } },
    ]);
    expect(res.ok).toBe(true);
  });

  it('rejects an empty array', () => {
    const res = validateStarterPackBlocks([]);
    expect(res.ok).toBe(false);
  });

  it('rejects an unknown blockType', () => {
    const res = validateStarterPackBlocks([{ blockType: 'banner', blockOrder: 2, content: {} }]);
    expect(res.ok).toBe(false);
  });

  it('rejects invalid block content (announcements limit must be positive)', () => {
    const res = validateStarterPackBlocks([
      { blockType: 'announcements', blockOrder: 2, content: { limit: -1 } },
    ]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.fields.some((f) => f.field.startsWith('0.content'))).toBe(true);
  });

  it('rejects duplicate blockOrder', () => {
    const res = validateStarterPackBlocks([
      { blockType: 'announcements', blockOrder: 2, content: { limit: 5 } },
      { blockType: 'contact', blockOrder: 2, content: { showBoard: true, showManagement: true } },
    ]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.fields.some((f) => /blockOrder/.test(f.message))).toBe(true);
  });

  it('rejects more than one hero block', () => {
    const res = validateStarterPackBlocks([
      { blockType: 'hero', blockOrder: 1, content: HERO },
      { blockType: 'hero', blockOrder: 2, content: HERO },
    ]);
    expect(res.ok).toBe(false);
  });

  it('rejects a hero not at blockOrder 1', () => {
    const res = validateStarterPackBlocks([{ blockType: 'hero', blockOrder: 2, content: HERO }]);
    expect(res.ok).toBe(false);
  });

  it('rejects a non-hero block at blockOrder 1', () => {
    const res = validateStarterPackBlocks([{ blockType: 'contact', blockOrder: 1, content: { showBoard: true, showManagement: true } }]);
    expect(res.ok).toBe(false);
  });
});
