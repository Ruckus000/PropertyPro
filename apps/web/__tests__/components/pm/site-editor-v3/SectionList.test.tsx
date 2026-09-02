/**
 * SectionList — the Sections tool panel.
 *
 * The provider is mocked rather than rendered: this suite is about the panel's
 * own contract (order, selection, and the two reorder routes resolving to the
 * right `move`/`moveTo` arguments), and the provider's own invariants are
 * covered in editor-context.test.tsx.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { SectionList } from '@/components/pm/site-editor-v3/panels/SectionList';
import type { SiteBlockSummary } from '@/hooks/use-content-blocks';

const selectMock = vi.hoisted(() => vi.fn());
const moveMock = vi.hoisted(() => vi.fn());
const moveToMock = vi.hoisted(() => vi.fn());

const state = vi.hoisted(() => ({
  sections: [] as Array<Record<string, unknown>>,
  selectedId: null as number | null,
  isMoving: false,
}));

vi.mock('@/components/pm/site-editor-v3/editor-context', () => ({
  useSiteEditor: () => {
    const sections = state.sections as unknown as SiteBlockSummary[];
    const indexOf = (blockId: number) => sections.findIndex((b) => b.id === blockId);
    return {
      blocks: sections,
      movableSections: sections,
      selection: null,
      isSelected: (blockId: number) => state.selectedId === blockId,
      select: selectMock,
      clear: vi.fn(),
      canMove: (blockId: number, direction: 'up' | 'down') => {
        const index = indexOf(blockId);
        if (index === -1) return false;
        return direction === 'up' ? index > 0 : index < sections.length - 1;
      },
      move: moveMock,
      moveTo: moveToMock,
      isMoving: state.isMoving,
      // Not asserted here — the hide/duplicate contract lives in
      // `__tests__/pm/site-editor-v3/section-list-hide.test.tsx`. Present so a
      // contributor who extends this file and clicks one of those buttons gets
      // their own assertion failing, not a confusing `undefined is not a
      // function` from a member the component destructures.
      toggleHidden: vi.fn(),
      duplicate: vi.fn(),
    };
  },
}));

/** Phase 11b — every SiteBlockSummary carries the page it belongs to. */
const HOME_PAGE_ID = 10;

function section(id: number, blockType: string, blockOrder: number, isDraft = false) {
  return { id, pageId: HOME_PAGE_ID, blockType, blockOrder, content: {}, isDraft, publishedAt: null };
}

/** Slot orders deliberately non-contiguous — `toOrder` is a slot, not an index. */
const SECTIONS = [
  section(11, 'text', 2),
  section(12, 'documents', 5),
  section(13, 'faq', 9),
];

/** jsdom has no DataTransfer; the component only needs these three members. */
function dataTransfer() {
  return { setData: vi.fn(), getData: vi.fn(), effectAllowed: '', dropEffect: '' };
}

function grip(id: number) {
  return screen.getByTestId(`section-grip-${id}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  state.sections = [...SECTIONS];
  state.selectedId = null;
  state.isMoving = false;
});

describe('SectionList — rendering', () => {
  it('lists the sections in slot order with their human labels', () => {
    render(<SectionList />);
    const rows = within(screen.getByRole('list', { name: 'Page sections' })).getAllByRole(
      'listitem',
    );
    expect(rows.map((row) => row.getAttribute('data-block-id'))).toEqual(['11', '12', '13']);
    expect(screen.getByText('Text')).toBeInTheDocument();
    expect(screen.getByText('Documents')).toBeInTheDocument();
    expect(screen.getByText('FAQ')).toBeInTheDocument();
  });

  it('marks unpublished sections as drafts', () => {
    state.sections = [section(11, 'text', 2, true), section(12, 'faq', 5, false)];
    render(<SectionList />);
    expect(screen.getAllByText('Draft')).toHaveLength(1);
  });

  it('selects a section when its row is clicked', () => {
    render(<SectionList />);
    fireEvent.click(screen.getByText('Documents'));
    expect(selectMock).toHaveBeenCalledWith(12);
  });

  it('shows an empty state rather than a bare list when there are no sections', () => {
    state.sections = [];
    render(<SectionList />);
    expect(screen.getByText('This page has no sections yet')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('scopes the empty state to the PAGE, not the site', () => {
    /*
     * `movableSections` has been page-scoped since D-C2, so this panel's empty
     * state is reached on a PM's second page while home still holds a dozen
     * sections. It said "Add your first section" / "Sections you add to YOUR
     * SITE" — false on both counts, and contradicting the canvas one column
     * over, which round 5 corrected to "This page is empty" for exactly this
     * reason. Round 5's fix list was hand-written and this panel was not on it.
     *
     * Revert check (production line): the `title`/`description` pair on
     * `SectionList.tsx`'s `EmptyState`.
     */
    state.sections = [];
    render(<SectionList />);

    // BOTH lines are page-scoped — the title and the description. Matching
    // once would pass on a fix that corrected only the heading.
    expect(screen.getAllByText(/this page/i)).toHaveLength(2);
    expect(screen.queryByText(/your site/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/your first section/i)).not.toBeInTheDocument();
  });

  it('offers a way to add when the empty state names adding', () => {
    // This empty state used to be titled "Add your first section" with no
    // action at all — it named the one thing the v3 editor could not do.
    state.sections = [];
    const onAddSection = vi.fn();
    render(<SectionList onAddSection={onAddSection} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add a section' }));
    expect(onAddSection).toHaveBeenCalled();
  });

  it('still renders standalone without an add handler', () => {
    state.sections = [];
    render(<SectionList />);
    expect(screen.getByText('This page has no sections yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add a section' })).not.toBeInTheDocument();
  });
});

describe('SectionList — drag reorder', () => {
  it('drops onto the target slot using its absolute blockOrder', () => {
    // Dragging the last section onto the first must send that row's *slot*
    // (2), not its index (0) — the two diverge whenever orders are sparse.
    render(<SectionList />);
    const source = screen.getByTestId('section-row-13');
    const target = screen.getByTestId('section-row-11');
    const dt = dataTransfer();

    fireEvent.dragStart(source, { dataTransfer: dt });
    fireEvent.dragOver(target, { dataTransfer: dt });
    fireEvent.drop(target, { dataTransfer: dt });

    expect(moveToMock).toHaveBeenCalledTimes(1);
    expect(moveToMock).toHaveBeenCalledWith(13, 2);
  });

  it('shows a drop indicator on the hovered row while dragging', () => {
    render(<SectionList />);
    const source = screen.getByTestId('section-row-11');
    const target = screen.getByTestId('section-row-13');
    const dt = dataTransfer();

    expect(screen.queryByTestId('section-drop-indicator')).not.toBeInTheDocument();

    fireEvent.dragStart(source, { dataTransfer: dt });
    fireEvent.dragOver(target, { dataTransfer: dt });

    const indicator = screen.getByTestId('section-drop-indicator');
    expect(target).toContainElement(indicator);
  });

  it('clears the drop indicator when the drag is abandoned', () => {
    render(<SectionList />);
    const source = screen.getByTestId('section-row-11');
    const dt = dataTransfer();

    fireEvent.dragStart(source, { dataTransfer: dt });
    fireEvent.dragOver(screen.getByTestId('section-row-12'), { dataTransfer: dt });
    fireEvent.dragEnd(source);

    expect(screen.queryByTestId('section-drop-indicator')).not.toBeInTheDocument();
  });

  it('does not reorder on a drop that never started as a drag', () => {
    render(<SectionList />);
    fireEvent.drop(screen.getByTestId('section-row-11'), { dataTransfer: dataTransfer() });
    expect(moveToMock).not.toHaveBeenCalled();
  });
});

describe('SectionList — keyboard parity', () => {
  it('moves a section up with ArrowUp on its grip', () => {
    render(<SectionList />);
    fireEvent.keyDown(grip(12), { key: 'ArrowUp' });
    expect(moveMock).toHaveBeenCalledWith(12, 'up');
  });

  it('moves a section down with ArrowDown on its grip', () => {
    render(<SectionList />);
    fireEvent.keyDown(grip(12), { key: 'ArrowDown' });
    expect(moveMock).toHaveBeenCalledWith(12, 'down');
  });

  it('reaches the far end of the list with Home/End, matching a long drag', () => {
    // Arrow keys alone are strictly weaker than a pointer drag, which can cross
    // the whole list in one gesture.
    render(<SectionList />);
    fireEvent.keyDown(grip(13), { key: 'Home' });
    expect(moveToMock).toHaveBeenCalledWith(13, 2);

    fireEvent.keyDown(grip(11), { key: 'End' });
    expect(moveToMock).toHaveBeenCalledWith(11, 9);
  });

  it('ignores unrelated keys on the grip', () => {
    render(<SectionList />);
    fireEvent.keyDown(grip(12), { key: 'a' });
    expect(moveMock).not.toHaveBeenCalled();
    expect(moveToMock).not.toHaveBeenCalled();
  });

  it('names the grip as a sortable item and keeps its position current', () => {
    render(<SectionList />);
    const handle = grip(12);
    expect(handle).toHaveAttribute('aria-roledescription', 'sortable item');
    expect(handle).toHaveAttribute('aria-label', 'Reorder Documents section, position 2 of 3');
    expect(handle).toHaveAttribute('aria-keyshortcuts');
    expect(handle).toHaveAccessibleDescription(/Arrow Up or Arrow Down/);
  });

  it('renders no live region of its own — the provider owns the only one', () => {
    render(<SectionList />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('SectionList — impossible moves', () => {
  it('disables rather than hides the move controls at the ends of the list', () => {
    render(<SectionList />);
    expect(screen.getByRole('button', { name: 'Move Text section up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Text section down' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Move FAQ section down' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move FAQ section up' })).toBeEnabled();
  });

  it('keeps the grip usable at the ends, where one direction still works', () => {
    // Disabling the first row's grip would take away its ability to move DOWN.
    render(<SectionList />);
    expect(grip(11)).toBeEnabled();
    expect(grip(13)).toBeEnabled();
  });

  it('disables the grip only when the section cannot move either way', () => {
    state.sections = [section(11, 'text', 2)];
    render(<SectionList />);
    expect(grip(11)).toBeDisabled();
    expect(grip(11)).toBeInTheDocument();
  });
});
