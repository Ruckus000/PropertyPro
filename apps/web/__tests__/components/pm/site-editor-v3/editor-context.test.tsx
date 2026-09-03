/**
 * SiteEditorProvider — the shared selection/move contract the canvas and the
 * Sections panel both drive.
 *
 * The provider exists so those two surfaces cannot disagree, so the assertions
 * here are about the shared invariants: end-of-list moves are soft no-ops, a
 * move is announced exactly once, and an absolute drop resolves to the right
 * position.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import {
  SiteEditorProvider,
  useSiteEditor,
  type SiteEditorContextValue,
} from '@/components/pm/site-editor-v3/editor-context';
import type { SiteBlockSummary } from '@/hooks/use-content-blocks';

const reorderMutate = vi.hoisted(() => vi.fn());
const upsertMutate = vi.hoisted(() => vi.fn());
// `duplicate` awaits the write before it can move the copy, so it needs the
// PROMISE-returning member; `toggleHidden` is fire-and-forget and uses `mutate`.
const upsertMutateAsync = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock('@/hooks/use-content-blocks', () => ({
  // FloatControls reads the published side to decide whether a removal is
  // staged or immediate; a factory missing it yields `undefined` at call time.
  usePublishedBlocks: () => ({ data: [] }),
  useReorderBlocks: () => ({ mutate: reorderMutate, isPending: false }),
  // `toggleHidden` writes through the ordinary upsert; a factory missing this
  // throws at module load and reddens every test in this file.
  useUpsertContentBlock: () => ({
    mutate: upsertMutate,
    mutateAsync: upsertMutateAsync,
    isPending: false,
  }),
}));

/** Phase 11b — every SiteBlockSummary carries the page it belongs to. */
const HOME_PAGE_ID = 10;

function block(overrides: Partial<SiteBlockSummary> & { id: number }): SiteBlockSummary {
  return {
    pageId: HOME_PAGE_ID,
    blockType: 'text',
    blockOrder: overrides.id,
    content: {},
    isDraft: false,
    publishedAt: null,
    ...overrides,
  };
}

const BLOCKS: SiteBlockSummary[] = [
  block({ id: 1, blockType: 'hero', blockOrder: 1 }),
  block({ id: 2, blockType: 'text', blockOrder: 2 }),
  block({ id: 3, blockType: 'image', blockOrder: 3 }),
  block({ id: 4, blockType: 'faq', blockOrder: 4 }),
];

let api: SiteEditorContextValue;

function Probe() {
  api = useSiteEditor();
  return null;
}

function renderProvider(blocks: SiteBlockSummary[] = BLOCKS, onSelect?: (id: number) => void) {
  return render(
    <SiteEditorProvider communityId={7} blocks={blocks} onSelect={onSelect}>
      <Probe />
    </SiteEditorProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  upsertMutateAsync.mockResolvedValue(undefined);
});

describe('SiteEditorProvider', () => {
  it('throws outside a provider rather than silently no-oping', () => {
    // Without this guard a component rendered in the wrong place would get a
    // null context and fail later with a confusing property access.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/SiteEditorProvider/);
    spy.mockRestore();
  });

  it('notifies onSelect so the shell can reveal the Sections panel', () => {
    const onSelect = vi.fn();
    renderProvider(BLOCKS, onSelect);

    act(() => api.select(3));
    expect(onSelect).toHaveBeenCalledWith(3);
    expect(api.selection?.blockId).toBe(3);
  });

  it('does NOT notify onSelect from selectSlot', () => {
    // Deliberate asymmetry with `select`. `onSelect` switches the shell to the
    // Sections tab, which unmounts the Add panel — right after adding, that
    // breaks adding a second section and buys nothing, because the inspector
    // is a separate column that opens regardless of the active tab.
    const onSelect = vi.fn();
    renderProvider(BLOCKS, onSelect);

    act(() => api.selectSlot(3, 'image'));
    expect(onSelect).not.toHaveBeenCalled();
    expect(api.selection?.blockId).toBe(3);
  });

  it('treats moving the first section up as a no-op, not an error', () => {
    renderProvider();

    expect(api.canMove(2, 'up')).toBe(false);
    act(() => api.move(2, 'up'));
    expect(reorderMutate).not.toHaveBeenCalled();
  });

  it('treats moving the last section down as a no-op, not an error', () => {
    renderProvider();

    expect(api.canMove(4, 'down')).toBe(false);
    act(() => api.move(4, 'down'));
    expect(reorderMutate).not.toHaveBeenCalled();
  });

  it('moves one position and announces it once', () => {
    renderProvider();

    act(() => api.move(2, 'down'));

    expect(reorderMutate).toHaveBeenCalledTimes(1);
    expect(reorderMutate).toHaveBeenCalledWith({ blockId: 2, direction: 'down' });
    // Sections are the three non-hero blocks; Text moves from 1st to 2nd.
    expect(screen.getByRole('status')).toHaveTextContent('Text moved to position 2 of 3.');
  });

  it('announces an upward move with the position it lands on', () => {
    renderProvider();

    act(() => api.move(4, 'up'));
    expect(screen.getByRole('status')).toHaveTextContent('FAQ moved to position 2 of 3.');
  });

  it('sends an absolute slot for a drag drop', () => {
    renderProvider();

    act(() => api.moveTo(4, 2));

    expect(reorderMutate).toHaveBeenCalledWith({ blockId: 4, toOrder: 2 });
    expect(screen.getByRole('status')).toHaveTextContent('FAQ moved to position 1 of 3.');
  });

  it('ignores a drop on the section’s own slot', () => {
    renderProvider();

    act(() => api.moveTo(3, 3));
    expect(reorderMutate).not.toHaveBeenCalled();
  });

  it('exposes exactly one live region for both surfaces', () => {
    renderProvider();
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });
});

describe('SiteEditorProvider — toggleHidden', () => {
  it('writes hidden: true into the block’s existing content', () => {
    renderProvider([
      block({ id: 1, blockType: 'hero', blockOrder: 1 }),
      block({ id: 2, blockType: 'text', blockOrder: 2, content: { body: 'Rules' } }),
    ]);

    act(() => api.toggleHidden(2, true));

    expect(upsertMutate).toHaveBeenCalledWith({
      blockType: 'text',
      blockOrder: 2,
      content: { body: 'Rules', hidden: true },
    });
  });

  it('REMOVES the key when unhiding rather than writing hidden: false', () => {
    // `hidden` is `z.literal(true).optional()` in every block schema, so
    // absence is the only encoding of "visible" — a literal `false` 400s.
    renderProvider([
      block({ id: 1, blockType: 'hero', blockOrder: 1 }),
      block({ id: 2, blockType: 'text', blockOrder: 2, content: { body: 'Rules', hidden: true } }),
    ]);

    act(() => api.toggleHidden(2, false));

    const [payload] = upsertMutate.mock.calls[0] as [{ content: Record<string, unknown> }];
    expect(payload.content).toEqual({ body: 'Rules' });
    expect('hidden' in payload.content).toBe(false);
  });

  it('does not mutate the block’s content in place', () => {
    const content = { body: 'Rules' };
    renderProvider([block({ id: 2, blockType: 'text', blockOrder: 2, content })]);

    act(() => api.toggleHidden(2, true));
    expect(content).toEqual({ body: 'Rules' });
  });

  it('refuses the hero, which has its own endpoint', () => {
    renderProvider();
    act(() => api.toggleHidden(1, true));
    expect(upsertMutate).not.toHaveBeenCalled();
  });

  it('refuses a tombstone, which the upsert contract’s enum rejects', () => {
    renderProvider([block({ id: 2, blockType: 'tombstone', blockOrder: 2 })]);
    act(() => api.toggleHidden(2, true));
    expect(upsertMutate).not.toHaveBeenCalled();
  });

  it('ignores an unknown block id', () => {
    renderProvider();
    act(() => api.toggleHidden(999, true));
    expect(upsertMutate).not.toHaveBeenCalled();
  });
});

describe('SiteEditorProvider — duplicate', () => {
  const PAGE = [
    block({ id: 1, blockType: 'hero', blockOrder: 1 }),
    block({ id: 2, blockType: 'text', blockOrder: 2, content: { body: 'Welcome' } }),
    block({
      id: 3,
      blockType: 'image',
      blockOrder: 3,
      content: { imagePath: '7/content/pool.jpg', altText: 'Pool', hidden: true },
    }),
    block({ id: 4, blockType: 'text', blockOrder: 4, content: { body: 'Rules' } }),
  ];

  /** The refetch landing: the same page, now carrying the written copy. */
  function withCopy(extra: SiteBlockSummary) {
    return [...PAGE, extra];
  }

  it('appends the copy to the next free slot on the page', async () => {
    renderProvider(PAGE);

    await act(async () => {
      api.duplicate(3);
    });

    // Slot 5 (max + 1), the same allocator the Add panel uses. No `pageId`:
    // the source is on the selected page by construction, which is the write
    // hook's default. `hidden` is dropped — the copy starts visible.
    expect(upsertMutateAsync).toHaveBeenCalledWith({
      blockType: 'image',
      blockOrder: 5,
      content: { imagePath: '7/content/pool.jpg', altText: 'Pool' },
    });
  });

  it('waits for the refetch before moving the copy below its source', async () => {
    const { rerender } = renderProvider(PAGE);

    await act(async () => {
      api.duplicate(3);
    });
    // The copy is not in the list yet, so there is nothing to move. This is the
    // whole point of the deferral: the new row's id does not exist until the
    // invalidation refetch delivers it, and the upsert resolves to void.
    expect(reorderMutate).not.toHaveBeenCalled();

    await act(async () => {
      rerender(
        <SiteEditorProvider
          communityId={7}
          blocks={withCopy(block({ id: 50, blockType: 'image', blockOrder: 5 }))}
        >
          <Probe />
        </SiteEditorProvider>,
      );
    });

    // toOrder 4, the source's next NEIGHBOUR — not `sourceOrder + 1`. A reorder
    // is an array move onto an occupied slot.
    expect(reorderMutate).toHaveBeenCalledWith({ blockId: 50, toOrder: 4 });
  });

  it('moves the copy exactly once, not on every later refetch', async () => {
    const { rerender } = renderProvider(PAGE);
    await act(async () => {
      api.duplicate(3);
    });

    const arrived = withCopy(block({ id: 50, blockType: 'image', blockOrder: 5 }));
    for (const _pass of [1, 2]) {
      await act(async () => {
        rerender(
          <SiteEditorProvider communityId={7} blocks={arrived}>
            <Probe />
          </SiteEditorProvider>,
        );
      });
    }

    expect(reorderMutate).toHaveBeenCalledTimes(1);
  });

  it('does not mistake another section for the copy', async () => {
    const { rerender } = renderProvider(PAGE);
    await act(async () => {
      api.duplicate(3);
    });

    // A `text` row at the awaited slot is somebody else's write, not our image
    // copy. Moving it would reorder a section the PM never touched.
    await act(async () => {
      rerender(
        <SiteEditorProvider
          communityId={7}
          blocks={withCopy(block({ id: 60, blockType: 'text', blockOrder: 5 }))}
        >
          <Probe />
        </SiteEditorProvider>,
      );
    });

    expect(reorderMutate).not.toHaveBeenCalled();
  });

  it('leaves the copy where it landed when the source is the last section', async () => {
    const { rerender } = renderProvider(PAGE);

    await act(async () => {
      api.duplicate(4);
    });
    await act(async () => {
      rerender(
        <SiteEditorProvider
          communityId={7}
          blocks={withCopy(block({ id: 51, blockType: 'text', blockOrder: 5 }))}
        >
          <Probe />
        </SiteEditorProvider>,
      );
    });

    // Appending IS "directly below" here, so a reorder would be a wasted
    // request the server answers as a no-op.
    expect(reorderMutate).not.toHaveBeenCalled();
  });

  it('refuses the hero, which has its own endpoint', async () => {
    renderProvider(PAGE);
    await act(async () => {
      api.duplicate(1);
    });
    expect(upsertMutateAsync).not.toHaveBeenCalled();
  });

  it('ignores an unknown block id', async () => {
    renderProvider(PAGE);
    await act(async () => {
      api.duplicate(999);
    });
    expect(upsertMutateAsync).not.toHaveBeenCalled();
  });

  it('reports a full page instead of writing', async () => {
    // Slots 2..99 all taken: `nextContentSlot` returns null and there is
    // nowhere for a copy to go.
    const full = [
      block({ id: 1, blockType: 'hero', blockOrder: 1 }),
      ...Array.from({ length: 98 }, (_unused, i) =>
        block({ id: 100 + i, blockType: 'text', blockOrder: 2 + i }),
      ),
    ];
    renderProvider(full);

    await act(async () => {
      api.duplicate(100);
    });

    expect(upsertMutateAsync).not.toHaveBeenCalled();
    expect(api.duplicateError).toMatch(/full/i);
  });

  it('reports a failed write rather than swallowing it', async () => {
    upsertMutateAsync.mockRejectedValueOnce(new Error('Section limit reached'));
    renderProvider(PAGE);

    await act(async () => {
      api.duplicate(3);
    });

    expect(api.duplicateError).toBe('Section limit reached');
    expect(reorderMutate).not.toHaveBeenCalled();
  });

  it('refuses a second duplicate while the first write is still in flight', async () => {
    // The collision this prevents: `useUpsertContentBlock` only INVALIDATES on
    // success — it writes nothing optimistically — so until the refetch lands
    // `blocks` still has no copy and a second call computes the SAME slot.
    // `upsertPublishedBlock` soft-deletes whatever occupies
    // (pageId, blockOrder, isDraft) before inserting, so the second write would
    // replace the first. Both PATCHes return 200, so nothing would surface it.
    let settleWrite: () => void = () => {};
    upsertMutateAsync.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          settleWrite = () => resolve();
        }),
    );
    renderProvider(PAGE);

    await act(async () => {
      api.duplicate(3);
    });
    expect(api.isDuplicating).toBe(true);

    await act(async () => {
      api.duplicate(2);
    });
    expect(upsertMutateAsync).toHaveBeenCalledTimes(1);

    await act(async () => {
      settleWrite();
    });
    expect(api.isDuplicating).toBe(false);
  });

  it('releases the guard when the write fails, so the PM can retry', async () => {
    upsertMutateAsync.mockRejectedValueOnce(new Error('nope'));
    renderProvider(PAGE);

    await act(async () => {
      api.duplicate(3);
    });
    expect(api.isDuplicating).toBe(false);

    await act(async () => {
      api.duplicate(3);
    });
    expect(upsertMutateAsync).toHaveBeenCalledTimes(2);
  });

  it('clears a previous failure when a duplicate succeeds', async () => {
    upsertMutateAsync.mockRejectedValueOnce(new Error('Section limit reached'));
    renderProvider(PAGE);
    await act(async () => {
      api.duplicate(3);
    });
    expect(api.duplicateError).not.toBeNull();

    await act(async () => {
      api.duplicate(2);
    });
    expect(api.duplicateError).toBeNull();
  });
});
