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
vi.mock('@/hooks/use-content-blocks', () => ({
  useReorderBlocks: () => ({ mutate: reorderMutate, isPending: false }),
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
