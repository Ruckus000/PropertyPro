import { describe, it, expect } from 'vitest';
import { visibleBlocks } from '@/lib/site/visible-blocks';

const block = (id: number, content: unknown) => ({
  id,
  blockType: 'text',
  blockOrder: id,
  content,
});

describe('visibleBlocks', () => {
  it('drops blocks whose content marks them hidden', () => {
    const out = visibleBlocks([block(1, { body: 'a' }), block(2, { body: 'b', hidden: true })]);
    expect(out.map((b) => b.id)).toEqual([1]);
  });

  it('keeps blocks with no hidden key', () => {
    const out = visibleBlocks([block(1, { body: 'a' })]);
    expect(out).toHaveLength(1);
  });

  it('keeps a block whose content is not an object', () => {
    // Malformed content is the per-block renderer's problem — it degrades to
    // null with a Sentry report. Swallowing it here would hide that signal.
    const out = visibleBlocks([block(1, null), block(2, 'nonsense')]);
    expect(out).toHaveLength(2);
  });

  it('does not treat a falsy hidden value as hidden', () => {
    const out = visibleBlocks([block(1, { body: 'a', hidden: false })]);
    expect(out).toHaveLength(1);
  });
});
