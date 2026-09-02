/**
 * Duplicating a section — the two pure decisions behind the Duplicate button.
 *
 * `planDuplicate` answers "what does the copy carry, and may it be copied at
 * all"; `reorderTargetForCopy` answers "once the copy exists at the end of the
 * page, which slot does it have to be dropped on to land below its source".
 *
 * They are separate because they fail differently: the first is a refusal (the
 * hero has its own endpoint), the second is a placement rule that has to agree
 * with `reorderSiteBlock`'s array-move semantics — a rule that is easy to get
 * wrong inline in a React callback and impossible to see wrong from the outside.
 *
 * Note what is deliberately NOT here: any notion of "shifting later sections
 * down to free a slot". `POST /blocks/reorder` is an ARRAY MOVE that re-stamps
 * the existing slot sequence, and `upsertPublishedBlock` REPLACES whatever
 * draft sits at the order it is given. There is no operation that inserts into
 * an occupied slot, so a copy is appended to the free slot at the end and then
 * moved — which is what `reorderTargetForCopy` computes the target for.
 */
import { describe, it, expect } from 'vitest';
import { planDuplicate, reorderTargetForCopy } from '@/lib/site-editor/plan-duplicate';

const blocks = [
  { id: 1, blockType: 'hero', blockOrder: 1, content: { headline: 'Welcome' } },
  { id: 2, blockType: 'text', blockOrder: 2, content: { body: 'a' } },
  {
    id: 3,
    blockType: 'image',
    blockOrder: 3,
    content: { imagePath: '1/content/x.jpg', altText: 'X' },
  },
  { id: 4, blockType: 'text', blockOrder: 4, content: { body: 'c' } },
];

describe('planDuplicate', () => {
  it('copies blockType and content verbatim', () => {
    const plan = planDuplicate(blocks, 3);
    expect(plan?.blockType).toBe('image');
    expect(plan?.content).toEqual({ imagePath: '1/content/x.jpg', altText: 'X' });
  });

  it('carries the image path so a duplicate needs no upload', () => {
    // The copy references the SAME stored object rather than copying the file,
    // so nothing is written to storage and `assetsBytesUsed` cannot move. This
    // is the property that makes duplicating an image section free.
    const plan = planDuplicate(blocks, 3);
    expect((plan?.content as { imagePath: string }).imagePath).toBe('1/content/x.jpg');
  });

  it('does not copy the hidden flag — a duplicate starts visible', () => {
    // `hidden` is `z.literal(true).optional()`, so absence IS visible. A copy
    // that inherited it would look to the PM like the button did nothing.
    const hiddenSource = [
      { id: 9, blockType: 'text', blockOrder: 2, content: { body: 'a', hidden: true } },
    ];
    const plan = planDuplicate(hiddenSource, 9);
    expect(plan?.content).toEqual({ body: 'a' });
    expect('hidden' in (plan?.content ?? {})).toBe(false);
  });

  it('does not mutate the source content in place', () => {
    const content = { body: 'a', hidden: true };
    planDuplicate([{ id: 9, blockType: 'text', blockOrder: 2, content }], 9);
    expect(content).toEqual({ body: 'a', hidden: true });
  });

  it('returns null for an unknown block id', () => {
    expect(planDuplicate(blocks, 99)).toBeNull();
  });

  it('refuses the hero, which has its own endpoint', () => {
    expect(planDuplicate(blocks, 1)).toBeNull();
  });

  it('refuses a tombstone, which the upsert contract’s enum rejects', () => {
    const staged = [{ id: 5, blockType: 'tombstone', blockOrder: 2, content: {} }];
    expect(planDuplicate(staged, 5)).toBeNull();
  });
});

describe('reorderTargetForCopy', () => {
  // The page's content sections BEFORE the copy is written — hero and
  // tombstones already excluded, exactly what `reorderSiteBlock` merges.
  const sections = [{ blockOrder: 2 }, { blockOrder: 3 }, { blockOrder: 4 }];

  it('targets the section immediately below the source', () => {
    // Copy appended at 5; dropping it on slot 4 takes 4's place and pushes the
    // rest down, leaving 2, SOURCE, COPY, 4-was-here.
    expect(reorderTargetForCopy(sections, 3, 5)).toBe(4);
  });

  it('targets the next OCCUPIED slot, not sourceOrder + 1', () => {
    // Slots are sparse — reorders re-stamp the existing sequence rather than
    // re-packing it. `reorderSiteBlock` REJECTS a toOrder no content section
    // occupies ("That position is no longer a content section"), so
    // `sourceOrder + 1` would 400 on any page with a gap.
    const sparse = [{ blockOrder: 2 }, { blockOrder: 5 }, { blockOrder: 9 }];
    expect(reorderTargetForCopy(sparse, 5, 10)).toBe(9);
  });

  it('needs no move when the source is the last section', () => {
    expect(reorderTargetForCopy(sections, 4, 5)).toBeNull();
  });

  it('needs no move when the copy already landed directly below the source', () => {
    // At the 99 ceiling `nextContentSlot` fills the first gap instead of
    // appending; when that gap is the one right below the source the copy is
    // already in place.
    const gapped = [{ blockOrder: 2 }, { blockOrder: 4 }];
    expect(reorderTargetForCopy(gapped, 2, 3)).toBeNull();
  });

  it('targets the source itself when the copy landed above it', () => {
    // The other half of the ceiling gap-fill: moving FORWARD, the drop target
    // is the block that should end up ABOVE the copy, because the array-move
    // removes the copy first and every later index shifts down by one.
    const gapped = [{ blockOrder: 3 }, { blockOrder: 5 }];
    expect(reorderTargetForCopy(gapped, 5, 4)).toBe(5);
  });
});
