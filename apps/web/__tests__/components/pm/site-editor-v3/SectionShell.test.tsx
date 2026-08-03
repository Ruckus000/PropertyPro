/**
 * SectionShell + FloatControls — the canvas selection chrome.
 *
 * The editor context is mocked rather than provided for real: these assertions
 * are about the chrome's own contract (does a click select, does Alt+Arrow ask
 * the context to move, are the controls reachable without a mouse), and
 * `editor-context.test.tsx` already covers the move semantics behind it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UndoableRemoveProvider } from '@/components/pm/site-editor-v3/undoable-remove-context';
import { SectionShell } from '@/components/pm/site-editor-v3/canvas/SectionShell';
import type { SiteBlockSummary } from '@/hooks/use-content-blocks';

const editor = vi.hoisted(() => ({
  selectedId: null as number | null,
  select: vi.fn(),
  move: vi.fn(),
  canMove: vi.fn((_id: number, _dir: 'up' | 'down') => true),
  isMoving: false,
}));

const deleteMutate = vi.hoisted(() => vi.fn());
const upsertMutate = vi.hoisted(() => vi.fn());

vi.mock('@/components/pm/site-editor-v3/editor-context', () => ({
  useSiteEditor: () => ({
    isSelected: (id: number) => editor.selectedId === id,
    select: editor.select,
    move: editor.move,
    canMove: editor.canMove,
    isMoving: editor.isMoving,
  }),
}));

vi.mock('@/hooks/use-content-blocks', () => ({
  // FloatControls reads the published side to decide whether a removal is
  // staged or immediate; a factory missing it yields `undefined` at call time.
  usePublishedBlocks: () => ({ data: [] }),
  useDeleteContentBlock: () => ({ mutate: deleteMutate, isPending: false }),
  // FloatControls' undo replays the removed section through the upsert.
  useUpsertContentBlock: () => ({ mutate: upsertMutate, isPending: false }),
}));

const toastSuccess = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
// `dismiss` is here because `useUndoableRemove` takes the undo toast down
// when its section unmounts. A factory missing a newly-added export yields
// `undefined` at call time, which reads as an unrelated component breaking.
// Every method the site-editor tree can reach, not only the ones this file
// asserts on: corpus trap #3 — a factory missing an export yields `undefined`
// at call time, which reads as an unrelated component breaking. `info` is the
// selection repair's channel (`EditorRoot.tsx`) and had zero coverage repo-wide.
vi.mock('sonner', () => ({
  toast: { success: toastSuccess, error: toastError, dismiss: vi.fn(), info: vi.fn() },
}));

/** Phase 11b — every SiteBlockSummary carries the page it belongs to. */
const HOME_PAGE_ID = 10;

function block(overrides: Partial<SiteBlockSummary> & { id: number }): SiteBlockSummary {
  return {
    pageId: HOME_PAGE_ID,
    blockType: 'text',
    blockOrder: 2,
    content: {},
    isDraft: false,
    publishedAt: null,
    ...overrides,
  };
}

const TEXT = block({ id: 2 });
const HERO = block({ id: 1, blockType: 'hero', blockOrder: 1 });

function renderShell(b: SiteBlockSummary = TEXT) {
  return render(
    <UndoableRemoveProvider communityId={7}>
    <SectionShell block={b} communityId={7}>
      <p>Section body</p>
    </SectionShell>,
    </UndoableRemoveProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  editor.selectedId = null;
  editor.isMoving = false;
  editor.canMove = vi.fn(() => true);
});

describe('SectionShell — selection', () => {
  it('selects on click', async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByText('Section body'));
    expect(editor.select).toHaveBeenCalledWith(2);
  });

  it('is reachable and selectable by keyboard, not mouse-only', async () => {
    const user = userEvent.setup();
    renderShell();

    const shell = screen.getByRole('group', { name: 'Text section' });
    await user.tab();
    expect(shell).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(editor.select).toHaveBeenCalledWith(2);
  });

  it('marks the selected section for styling', () => {
    editor.selectedId = 2;
    renderShell();
    expect(screen.getByRole('group', { name: 'Text section' })).toHaveAttribute(
      'data-selected',
      'true',
    );
  });
});

describe('SectionShell — Alt+Arrow reordering', () => {
  it('moves up on Alt+ArrowUp when selected', async () => {
    const user = userEvent.setup();
    editor.selectedId = 2;
    renderShell();

    screen.getByRole('group', { name: 'Text section' }).focus();
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}');

    expect(editor.move).toHaveBeenCalledWith(2, 'up');
  });

  it('moves down on Alt+ArrowDown when selected', async () => {
    const user = userEvent.setup();
    editor.selectedId = 2;
    renderShell();

    screen.getByRole('group', { name: 'Text section' }).focus();
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');

    expect(editor.move).toHaveBeenCalledWith(2, 'down');
  });

  it('ignores Alt+Arrow on a section that is not selected', async () => {
    const user = userEvent.setup();
    renderShell();

    screen.getByRole('group', { name: 'Text section' }).focus();
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}');

    expect(editor.move).not.toHaveBeenCalled();
  });

  it('does not re-check bounds itself — the context owns the soft stop', async () => {
    // First-up / last-down must be a silent no-op, and the shell must not
    // duplicate that test (two predicates drift). It always delegates.
    const user = userEvent.setup();
    editor.selectedId = 2;
    editor.canMove = vi.fn(() => false);
    renderShell();

    screen.getByRole('group', { name: 'Text section' }).focus();
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}');

    expect(editor.move).toHaveBeenCalledWith(2, 'up');
    expect(toastError).not.toHaveBeenCalled();
  });
});

describe('FloatControls', () => {
  it('renders the controls without any hover event — they are not hover-only', () => {
    renderShell();

    const up = screen.getByRole('button', { name: 'Move Text section up' });
    const down = screen.getByRole('button', { name: 'Move Text section down' });
    const remove = screen.getByRole('button', { name: 'Remove Text section' });

    for (const control of [up, down, remove]) {
      expect(control).toBeInTheDocument();
      control.focus();
      expect(control).toHaveFocus();
    }
  });

  it('is reachable by Tab straight after the section', async () => {
    const user = userEvent.setup();
    renderShell();

    await user.tab(); // the section
    await user.tab(); // move up
    expect(screen.getByRole('button', { name: 'Move Text section up' })).toHaveFocus();
  });

  it('disables rather than hides move-up at the top of the list', () => {
    editor.canMove = vi.fn((_id, dir) => dir !== 'up');
    renderShell();

    expect(screen.getByRole('button', { name: 'Move Text section up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Text section down' })).toBeEnabled();
  });

  it('disables rather than hides move-down at the bottom of the list', () => {
    editor.canMove = vi.fn((_id, dir) => dir !== 'down');
    renderShell();

    expect(screen.getByRole('button', { name: 'Move Text section down' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Text section up' })).toBeEnabled();
  });

  it('moves without also selecting — the click must not double-fire', async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole('button', { name: 'Move Text section down' }));

    expect(editor.move).toHaveBeenCalledWith(2, 'down');
    expect(editor.select).not.toHaveBeenCalled();
  });

  it('asks before removing — the trash control confirms, it does not delete', async () => {
    // Phase 3 put a Radix alert-dialog in front of the delete. The removal
    // flow itself (confirm/cancel, toast copy, undo) lives in
    // undo-toast.test.tsx; here we only assert the shell's control no longer
    // mutates on a single click.
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole('button', { name: 'Remove Text section' }));

    // The dialog is code-split and mounted on demand, so it resolves a tick
    // after the click.
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(
      'Remove the Text section?',
    );
    expect(deleteMutate).not.toHaveBeenCalled();
  });
});

describe('SectionShell — the hero', () => {
  it('is selectable but exposes no move or remove controls', async () => {
    const user = userEvent.setup();
    renderShell(HERO);

    await user.click(screen.getByText('Section body'));
    expect(editor.select).toHaveBeenCalledWith(1);

    expect(screen.queryByRole('button', { name: /Move Welcome section/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Remove Welcome section/ })).toBeNull();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
