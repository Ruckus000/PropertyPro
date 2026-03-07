/**
 * Tests for the Puck ↔ DB translation layer.
 *
 * Covers ADR-002 critical issues and edge cases:
 * - Round-trip conversion (rows → Puck Data → ChangeSet)
 * - Empty block list
 * - All 7 block types in a single page
 * - Draft + published blocks coexisting
 * - Reorder detection
 * - Create / update / delete detection
 * - Content with special characters and empty strings
 */
import { describe, it, expect } from 'vitest';
import {
  rowsToPuckData,
  diffPuckData,
  diffDirtyBlocks,
  classifyAction,
  contentEqual,
  type SiteBlockRow,
} from '../../src/components/site-builder/puck/translate';
import type { Data } from '@puckeditor/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<SiteBlockRow> & Pick<SiteBlockRow, 'id' | 'block_type' | 'block_order'>): SiteBlockRow {
  return {
    community_id: 1,
    content: {},
    is_draft: true,
    published_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// rowsToPuckData
// ---------------------------------------------------------------------------

describe('rowsToPuckData', () => {
  it('converts an empty row list to empty Puck Data', () => {
    const { data, idMap, knownState } = rowsToPuckData([]);

    expect(data.content).toEqual([]);
    expect(data.root).toEqual({ props: {} });
    expect(idMap.size).toBe(0);
    expect(knownState.order).toEqual([]);
  });

  it('converts rows to Puck Data with correct ordering', () => {
    const rows: SiteBlockRow[] = [
      makeRow({ id: 2, block_type: 'text', block_order: 1, content: { body: 'Hello', format: 'plain' } }),
      makeRow({ id: 1, block_type: 'hero', block_order: 0, content: { headline: 'Welcome' } }),
    ];

    const { data, idMap, knownState } = rowsToPuckData(rows);

    // Should be sorted by block_order
    expect(data.content).toHaveLength(2);
    expect(data.content[0]!.type).toBe('hero');
    expect(data.content[0]!.props.id).toBe('block-1');
    expect(data.content[0]!.props.headline).toBe('Welcome');

    expect(data.content[1]!.type).toBe('text');
    expect(data.content[1]!.props.id).toBe('block-2');
    expect(data.content[1]!.props.body).toBe('Hello');

    // IdMap
    expect(idMap.get('block-1')).toBe(1);
    expect(idMap.get('block-2')).toBe(2);

    // Known state
    expect(knownState.order).toEqual(['block-1', 'block-2']);
    expect(knownState.content.get('block-1')).toEqual({ headline: 'Welcome' });
  });

  it('handles all 7 block types in a single page', () => {
    const types = ['hero', 'announcements', 'documents', 'meetings', 'contact', 'text', 'image'];
    const rows = types.map((type, i) =>
      makeRow({ id: i + 1, block_type: type, block_order: i }),
    );

    const { data, idMap } = rowsToPuckData(rows);

    expect(data.content).toHaveLength(7);
    expect(idMap.size).toBe(7);
    types.forEach((type, i) => {
      expect(data.content[i]!.type).toBe(type);
    });
  });

  it('preserves draft and published status in knownState', () => {
    const rows: SiteBlockRow[] = [
      makeRow({ id: 1, block_type: 'hero', block_order: 0, is_draft: false }),
      makeRow({ id: 2, block_type: 'text', block_order: 1, is_draft: true }),
    ];

    const { knownState } = rowsToPuckData(rows);

    expect(knownState.drafts.get('block-1')).toBe(false);
    expect(knownState.drafts.get('block-2')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// diffPuckData
// ---------------------------------------------------------------------------

describe('diffPuckData', () => {
  it('returns empty changeset when nothing changed', () => {
    const rows: SiteBlockRow[] = [
      makeRow({ id: 1, block_type: 'hero', block_order: 0, content: { headline: 'Hi' } }),
    ];
    const { data, idMap, knownState } = rowsToPuckData(rows);

    const changeSet = diffPuckData(data, idMap, knownState);

    expect(changeSet.creates).toHaveLength(0);
    expect(changeSet.updates).toHaveLength(0);
    expect(changeSet.deletes).toHaveLength(0);
    expect(changeSet.reorder).toBeNull();
  });

  it('detects content updates', () => {
    const rows: SiteBlockRow[] = [
      makeRow({ id: 1, block_type: 'hero', block_order: 0, content: { headline: 'Original' } }),
    ];
    const { data, idMap, knownState } = rowsToPuckData(rows);

    // Simulate editing in Puck
    const edited: Data = {
      ...data,
      content: [
        {
          type: 'hero',
          props: { id: 'block-1', headline: 'Updated' },
        },
      ],
    };

    const changeSet = diffPuckData(edited, idMap, knownState);

    expect(changeSet.updates).toHaveLength(1);
    expect(changeSet.updates[0]!.dbId).toBe(1);
    expect(changeSet.updates[0]!.content).toEqual({ headline: 'Updated' });
    expect(changeSet.creates).toHaveLength(0);
    expect(changeSet.deletes).toHaveLength(0);
    expect(changeSet.reorder).toBeNull();
  });

  it('detects new blocks (creates)', () => {
    const rows: SiteBlockRow[] = [
      makeRow({ id: 1, block_type: 'hero', block_order: 0, content: { headline: 'Hi' } }),
    ];
    const { data, idMap, knownState } = rowsToPuckData(rows);

    // Add a new block in Puck
    const withNew: Data = {
      ...data,
      content: [
        ...data.content,
        {
          type: 'text',
          props: { id: 'text-abc123', body: 'New text', format: 'plain' },
        },
      ],
    };

    const changeSet = diffPuckData(withNew, idMap, knownState);

    expect(changeSet.creates).toHaveLength(1);
    expect(changeSet.creates[0]!.puckId).toBe('text-abc123');
    expect(changeSet.creates[0]!.blockType).toBe('text');
    expect(changeSet.creates[0]!.content).toEqual({ body: 'New text', format: 'plain' });
    expect(changeSet.creates[0]!.order).toBe(1);
  });

  it('detects deleted blocks', () => {
    const rows: SiteBlockRow[] = [
      makeRow({ id: 1, block_type: 'hero', block_order: 0, content: { headline: 'Hi' } }),
      makeRow({ id: 2, block_type: 'text', block_order: 1, content: { body: 'Hello' } }),
    ];
    const { data, idMap, knownState } = rowsToPuckData(rows);

    // Remove second block
    const withDelete: Data = {
      ...data,
      content: [data.content[0]!],
    };

    const changeSet = diffPuckData(withDelete, idMap, knownState);

    expect(changeSet.deletes).toHaveLength(1);
    expect(changeSet.deletes[0]!.dbId).toBe(2);
    expect(changeSet.deletes[0]!.puckId).toBe('block-2');
  });

  it('detects reorder', () => {
    const rows: SiteBlockRow[] = [
      makeRow({ id: 1, block_type: 'hero', block_order: 0, content: { headline: 'Hi' } }),
      makeRow({ id: 2, block_type: 'text', block_order: 1, content: { body: 'Hello' } }),
    ];
    const { data, idMap, knownState } = rowsToPuckData(rows);

    // Swap order
    const reordered: Data = {
      ...data,
      content: [data.content[1]!, data.content[0]!],
    };

    const changeSet = diffPuckData(reordered, idMap, knownState);

    expect(changeSet.reorder).not.toBeNull();
    expect(changeSet.reorder).toHaveLength(2);
    expect(changeSet.reorder).toEqual([
      { dbId: 2, blockOrder: 0 },
      { dbId: 1, blockOrder: 1 },
    ]);
  });

  it('handles rapid add-edit-delete sequence', () => {
    const rows: SiteBlockRow[] = [
      makeRow({ id: 1, block_type: 'hero', block_order: 0, content: { headline: 'Hi' } }),
    ];
    const { data, idMap, knownState } = rowsToPuckData(rows);

    // Simulate: edited existing, added new, removed nothing
    const edited: Data = {
      ...data,
      content: [
        {
          type: 'hero',
          props: { id: 'block-1', headline: 'Changed' },
        },
        {
          type: 'contact',
          props: { id: 'contact-new', boardEmail: 'test@test.com' },
        },
      ],
    };

    const changeSet = diffPuckData(edited, idMap, knownState);

    expect(changeSet.creates).toHaveLength(1);
    expect(changeSet.updates).toHaveLength(1);
    expect(changeSet.deletes).toHaveLength(0);
  });

  it('handles empty block list (no blocks)', () => {
    const { data, idMap, knownState } = rowsToPuckData([]);

    const changeSet = diffPuckData(data, idMap, knownState);

    expect(changeSet.creates).toHaveLength(0);
    expect(changeSet.updates).toHaveLength(0);
    expect(changeSet.deletes).toHaveLength(0);
    expect(changeSet.reorder).toBeNull();
  });

  it('does not report reorder when only 1 block exists', () => {
    const rows: SiteBlockRow[] = [
      makeRow({ id: 1, block_type: 'hero', block_order: 0, content: {} }),
    ];
    const { data, idMap, knownState } = rowsToPuckData(rows);

    const changeSet = diffPuckData(data, idMap, knownState);

    expect(changeSet.reorder).toBeNull();
  });

  it('handles content with special characters and empty strings', () => {
    const rows: SiteBlockRow[] = [
      makeRow({
        id: 1,
        block_type: 'text',
        block_order: 0,
        content: { body: '<script>alert("xss")</script>', format: 'plain' },
      }),
    ];
    const { data, idMap, knownState } = rowsToPuckData(rows);

    // Change to empty string
    const edited: Data = {
      ...data,
      content: [
        {
          type: 'text',
          props: { id: 'block-1', body: '', format: 'plain' },
        },
      ],
    };

    const changeSet = diffPuckData(edited, idMap, knownState);

    expect(changeSet.updates).toHaveLength(1);
    expect(changeSet.updates[0]!.content.body).toBe('');
  });
});

// ---------------------------------------------------------------------------
// contentEqual
// ---------------------------------------------------------------------------

describe('contentEqual', () => {
  it('returns true for identical objects', () => {
    expect(contentEqual({ a: 1, b: 'x' }, { a: 1, b: 'x' })).toBe(true);
  });

  it('returns false for different values', () => {
    expect(contentEqual({ a: 1 }, { a: 2 })).toBe(false);
  });

  it('returns false for different key counts', () => {
    expect(contentEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it('deep-compares arrays', () => {
    expect(contentEqual({ ids: [1, 2, 3] }, { ids: [1, 2, 3] })).toBe(true);
    expect(contentEqual({ ids: [1, 2, 3] }, { ids: [1, 2, 4] })).toBe(false);
  });

  it('deep-compares nested objects', () => {
    expect(contentEqual({ meta: { a: 1 } }, { meta: { a: 1 } })).toBe(true);
    expect(contentEqual({ meta: { a: 1 } }, { meta: { a: 2 } })).toBe(false);
  });

  it('returns true for objects with same content but different key order', () => {
    const obj1 = { a: 1, b: { c: 3, d: 4 } };
    const obj2 = { b: { d: 4, c: 3 }, a: 1 };
    expect(contentEqual(obj1, obj2)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// classifyAction (ADR-002 #7)
// ---------------------------------------------------------------------------

describe('classifyAction', () => {
  it('classifies content-change actions as "content"', () => {
    expect(classifyAction('replace')).toBe('content');
    expect(classifyAction('replaceRoot')).toBe('content');
  });

  it('classifies structural actions as "structural"', () => {
    expect(classifyAction('insert')).toBe('structural');
    expect(classifyAction('remove')).toBe('structural');
    expect(classifyAction('reorder')).toBe('structural');
    expect(classifyAction('move')).toBe('structural');
    expect(classifyAction('duplicate')).toBe('structural');
  });

  it('classifies UI-only actions as null', () => {
    expect(classifyAction('setUi')).toBeNull();
    expect(classifyAction('registerZone')).toBeNull();
    expect(classifyAction('unregisterZone')).toBeNull();
  });

  it('defaults unknown actions to "structural"', () => {
    expect(classifyAction('unknown')).toBe('structural');
    expect(classifyAction('setData')).toBe('structural');
  });
});

// ---------------------------------------------------------------------------
// diffDirtyBlocks (ADR-002 #7)
// ---------------------------------------------------------------------------

describe('diffDirtyBlocks', () => {
  it('only diffs blocks in the dirty set', () => {
    const rows: SiteBlockRow[] = [
      makeRow({ id: 1, block_type: 'hero', block_order: 0, content: { headline: 'Hi' } }),
      makeRow({ id: 2, block_type: 'text', block_order: 1, content: { body: 'Hello' } }),
    ];
    const { data, idMap, knownState } = rowsToPuckData(rows);

    // Edit both blocks
    const edited: Data = {
      ...data,
      content: [
        { type: 'hero', props: { id: 'block-1', headline: 'Changed' } },
        { type: 'text', props: { id: 'block-2', body: 'Changed too' } },
      ],
    };

    // Only mark block-1 as dirty
    const dirty = new Set(['block-1']);
    const changeSet = diffDirtyBlocks(edited, idMap, knownState, dirty);

    expect(changeSet.updates).toHaveLength(1);
    expect(changeSet.updates[0]!.dbId).toBe(1);
    expect(changeSet.creates).toHaveLength(0);
    expect(changeSet.deletes).toHaveLength(0);
    expect(changeSet.reorder).toBeNull();
  });

  it('returns empty changeset for unchanged dirty blocks', () => {
    const rows: SiteBlockRow[] = [
      makeRow({ id: 1, block_type: 'hero', block_order: 0, content: { headline: 'Hi' } }),
    ];
    const { data, idMap, knownState } = rowsToPuckData(rows);

    // Mark as dirty but content unchanged
    const dirty = new Set(['block-1']);
    const changeSet = diffDirtyBlocks(data, idMap, knownState, dirty);

    expect(changeSet.updates).toHaveLength(0);
  });

  it('ignores new blocks without DB IDs', () => {
    const rows: SiteBlockRow[] = [
      makeRow({ id: 1, block_type: 'hero', block_order: 0, content: { headline: 'Hi' } }),
    ];
    const { data, idMap, knownState } = rowsToPuckData(rows);

    // Add a new block and mark it dirty
    const withNew: Data = {
      ...data,
      content: [
        ...data.content,
        { type: 'text', props: { id: 'new-block', body: 'New' } },
      ],
    };

    const dirty = new Set(['new-block']);
    const changeSet = diffDirtyBlocks(withNew, idMap, knownState, dirty);

    // New blocks need full diff to be detected — dirty blocks only handles updates
    expect(changeSet.updates).toHaveLength(0);
    expect(changeSet.creates).toHaveLength(0);
  });
});
