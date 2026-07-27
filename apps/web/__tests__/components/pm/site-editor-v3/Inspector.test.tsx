/**
 * Inspector — docked/overlay presentation, dismissal, and focus return.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Inspector } from '@/components/pm/site-editor-v3/Inspector';
import type { CanvasSelection } from '@/components/pm/site-editor-v3/canvas/use-canvas-selection';

// The inspector asks `(max-width: 1279px)` — see the comment on Inspector. This
// mock therefore reports NARROWNESS, not width: false = docked/wide.
const isNarrowMock = vi.hoisted(() => ({ value: false }));
vi.mock('@/hooks/use-media-query', () => ({
  useMediaQuery: () => isNarrowMock.value,
  useIsDesktop: () => true,
}));

const editorMock = vi.hoisted(() => ({
  selection: null as CanvasSelection | null,
  clear: vi.fn(),
  blocks: [] as unknown[],
}));
vi.mock('@/components/pm/site-editor-v3/editor-context', () => ({
  useSiteEditor: () => ({
    selection: editorMock.selection,
    clear: editorMock.clear,
    blocks: editorMock.blocks,
  }),
}));

// The inspector now dispatches to a real form for types that have one, and
// TextForm reaches the blocks hook. Mocked completely — a partial factory
// fails at module load and reads as the inspector breaking.
vi.mock('@/hooks/use-content-blocks', () => ({
  useUpsertContentBlock: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const TEXT_SELECTION: CanvasSelection = {
  blockId: 7,
  blockOrder: 3,
  blockType: 'text',
  isMovable: true,
};

/** A stand-in for the canvas section that opened the inspector. */
function Harness() {
  return (
    <div>
      <button type="button">Text section</button>
      <Inspector communityId={42} />
    </div>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  isNarrowMock.value = false;
  editorMock.selection = null;
  editorMock.blocks = [
    { id: 7, blockType: 'text', blockOrder: 3, content: { body: 'Hello.' }, isDraft: false, publishedAt: null },
  ];
});

describe('Inspector — empty selection', () => {
  it('renders nothing at all when no section is selected', () => {
    const { container } = render(<Inspector communityId={42} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing in overlay mode either', () => {
    isNarrowMock.value = true;
    render(<Inspector communityId={42} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Inspector — presentation', () => {
  it('docks as a column at or above 1280px', () => {
    editorMock.selection = TEXT_SELECTION;
    render(<Inspector communityId={42} />);
    expect(screen.getByRole('complementary', { name: 'Text settings' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // The overlay is code-split (see the `dynamic` call in Inspector), so it
  // resolves a tick after render. `find*` rather than `get*` is the assertion
  // that it actually arrives — a bare `get*` here would only prove the
  // placeholder rendered.
  it('overlays as a sheet below 1280px', async () => {
    isNarrowMock.value = true;
    editorMock.selection = TEXT_SELECTION;
    render(<Inspector communityId={42} />);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('names the selected section in both modes', async () => {
    editorMock.selection = { ...TEXT_SELECTION, blockType: 'documents' };
    const docked = render(<Inspector communityId={42} />);
    expect(screen.getByText('Documents settings')).toBeInTheDocument();
    docked.unmount();

    isNarrowMock.value = true;
    render(<Inspector communityId={42} />);
    expect(await screen.findByText('Documents settings')).toBeInTheDocument();
  });

  it('renders the edit form for a section type that has one', async () => {
    editorMock.selection = TEXT_SELECTION;
    render(<Inspector communityId={42} />);
    // The form is code-split, so `find*` is the assertion that it actually
    // arrived rather than that the skeleton rendered.
    expect(await screen.findByLabelText(/Body/)).toHaveValue('Hello.');
  });

  it('explains itself for a section type with no form yet, rather than showing an empty panel', () => {
    editorMock.selection = { ...TEXT_SELECTION, blockType: 'contact' };
    render(<Inspector communityId={42} />);
    expect(screen.getByText(/arrive in a later update/i)).toBeInTheDocument();
  });
});

describe('Inspector — dismissal', () => {
  it('clears the selection from the docked close button', async () => {
    const user = userEvent.setup();
    editorMock.selection = TEXT_SELECTION;
    render(<Inspector communityId={42} />);
    await user.click(screen.getByRole('button', { name: 'Close settings' }));
    expect(editorMock.clear).toHaveBeenCalledTimes(1);
  });

  it('clears the selection from the overlay close button', async () => {
    const user = userEvent.setup();
    isNarrowMock.value = true;
    editorMock.selection = TEXT_SELECTION;
    render(<Inspector communityId={42} />);
    await user.click(await screen.findByRole('button', { name: /close/i }));
    expect(editorMock.clear).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape while docked, even when focus is still on the canvas', async () => {
    const user = userEvent.setup();
    editorMock.selection = TEXT_SELECTION;
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Text section' }));
    await user.keyboard('{Escape}');
    expect(editorMock.clear).toHaveBeenCalled();
  });

  it('closes on Escape while overlaid', async () => {
    const user = userEvent.setup();
    isNarrowMock.value = true;
    editorMock.selection = TEXT_SELECTION;
    render(<Inspector communityId={42} />);
    // Wait for the code-split sheet before pressing Escape — Radix owns the
    // key handling, so the assertion is meaningless until it has mounted.
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    expect(editorMock.clear).toHaveBeenCalled();
  });
});

describe('Inspector — focus return', () => {
  it('returns focus to whatever opened it when the docked panel closes', async () => {
    const user = userEvent.setup();
    const view = render(<Harness />);

    const trigger = screen.getByRole('button', { name: 'Text section' });
    await user.click(trigger);
    expect(trigger).toHaveFocus();

    editorMock.selection = TEXT_SELECTION;
    view.rerender(<Harness />);
    expect(screen.getByRole('complementary')).toBeInTheDocument();

    editorMock.selection = null;
    view.rerender(<Harness />);
    expect(trigger).toHaveFocus();
  });

  it('tracks the LATEST selected section as the trigger, not the first', async () => {
    // Regression: capturing the trigger only on the closed->open edge left the
    // ref pointing at the first section selected. Selecting a second one while
    // the panel was already open and then closing dragged focus backwards to a
    // section the PM had moved on from.
    const user = userEvent.setup();
    function TwoTriggers() {
      return (
        <div>
          <button type="button">Text section</button>
          <button type="button">Image section</button>
          <Inspector communityId={42} />
        </div>
      );
    }
    const view = render(<TwoTriggers />);

    const first = screen.getByRole('button', { name: 'Text section' });
    const second = screen.getByRole('button', { name: 'Image section' });

    await user.click(first);
    editorMock.selection = TEXT_SELECTION;
    view.rerender(<TwoTriggers />);

    // Panel stays open; the PM picks a different section.
    await user.click(second);
    editorMock.selection = { blockId: 8, blockOrder: 4, blockType: 'image', isMovable: true };
    view.rerender(<TwoTriggers />);

    // Focus is stranded (e.g. the section unmounted under the PM), so the
    // inspector restores — and it must restore to the second section.
    second.blur();
    editorMock.selection = null;
    view.rerender(<TwoTriggers />);
    expect(second).toHaveFocus();
    expect(first).not.toHaveFocus();
  });

  it('leaves focus alone when the PM has already moved it elsewhere', async () => {
    // Stealing focus back from wherever the PM went next is a worse bug than
    // not restoring it at all.
    const user = userEvent.setup();
    function WithElsewhere() {
      return (
        <div>
          <button type="button">Text section</button>
          <button type="button">Somewhere else</button>
          <Inspector communityId={42} />
        </div>
      );
    }
    const view = render(<WithElsewhere />);
    await user.click(screen.getByRole('button', { name: 'Text section' }));
    editorMock.selection = TEXT_SELECTION;
    view.rerender(<WithElsewhere />);

    const elsewhere = screen.getByRole('button', { name: 'Somewhere else' });
    elsewhere.focus();

    editorMock.selection = null;
    view.rerender(<WithElsewhere />);
    expect(elsewhere).toHaveFocus();
  });

  it('does not throw when the trigger has been unmounted meanwhile', () => {
    const view = render(<Harness />);
    screen.getByRole('button', { name: 'Text section' }).focus();

    editorMock.selection = TEXT_SELECTION;
    view.rerender(<Harness />);

    // The section the PM selected disappears (a discard, another PM's publish).
    editorMock.selection = null;
    expect(() => view.rerender(<Inspector communityId={42} />)).not.toThrow();
  });
});
