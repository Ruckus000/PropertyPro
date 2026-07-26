/**
 * Confirm-then-remove + undo toast (Phase 3).
 *
 * The interesting behaviour is not "does it delete" — it's the two failure modes
 * a naive implementation ships with: a removal that happens without asking, and
 * an Undo that survives its own window and re-writes a section at an order the
 * PM has since reused. Both are asserted here.
 *
 * `sonner` is mocked so the toast's action callback can be invoked directly:
 * the real Toaster renders in the root layout, and mounting a second one in a
 * test would only duplicate what we already have a handle on.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FloatControls } from '@/components/pm/site-editor-v3/canvas/FloatControls';
import { UNDO_WINDOW_MS } from '@/components/pm/site-editor-v3/use-undoable-remove';
import type { SiteBlockSummary } from '@/hooks/use-content-blocks';

const editor = vi.hoisted(() => ({
  move: vi.fn(),
  canMove: vi.fn(() => true),
}));

vi.mock('@/components/pm/site-editor-v3/editor-context', () => ({
  useSiteEditor: () => ({
    isSelected: () => false,
    select: vi.fn(),
    move: editor.move,
    canMove: editor.canMove,
    isMoving: false,
  }),
}));

const deleteMutate = vi.hoisted(() => vi.fn());
const upsertMutate = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/use-content-blocks', () => ({
  useDeleteContentBlock: () => ({ mutate: deleteMutate, isPending: false }),
  useUpsertContentBlock: () => ({ mutate: upsertMutate, isPending: false }),
}));

const toastSuccess = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError } }));

type ToastOptions = {
  duration?: number;
  dismissible?: boolean;
  closeButton?: boolean;
  action?: { label: string; onClick: () => void };
  onDismiss?: () => void;
  onAutoClose?: () => void;
};

/** The options object from the most recent `toast.success(msg, options)` call. */
function lastToastOptions(): ToastOptions {
  const call = toastSuccess.mock.calls.at(-1);
  expect(call).toBeDefined();
  return (call![1] ?? {}) as ToastOptions;
}

function block(overrides: Partial<SiteBlockSummary> = {}): SiteBlockSummary {
  return {
    id: 2,
    blockType: 'text',
    blockOrder: 4,
    content: { heading: 'Pool rules', body: 'No glass.' },
    isDraft: false,
    publishedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderControls(b: SiteBlockSummary = block()) {
  return render(<FloatControls block={b} communityId={7} />);
}

/**
 * Opens the confirmation via the trash control.
 *
 * `findBy` rather than `getBy`: the dialog is code-split and mounted only once
 * opened, so it resolves a tick after the click.
 */
async function openConfirm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Remove Text section' }));
  return screen.findByRole('alertdialog');
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('removal confirmation', () => {
  it('asks before removing anything', async () => {
    const user = userEvent.setup();
    renderControls();

    expect(screen.queryByRole('alertdialog')).toBeNull();
    const dialog = await openConfirm(user);

    expect(dialog).toHaveTextContent('Remove the Text section?');
    expect(deleteMutate).not.toHaveBeenCalled();
  });

  it('does not delete when cancelled', async () => {
    const user = userEvent.setup();
    renderControls();
    await openConfirm(user);

    await user.click(screen.getByRole('button', { name: 'Keep section' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(deleteMutate).not.toHaveBeenCalled();
  });

  it('does not delete when dismissed with Escape', async () => {
    const user = userEvent.setup();
    renderControls();
    await openConfirm(user);

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(deleteMutate).not.toHaveBeenCalled();
  });

  it('deletes by block order once confirmed', async () => {
    const user = userEvent.setup();
    deleteMutate.mockImplementation((_input, opts) => opts.onSuccess({ staged: true }));
    renderControls();
    await openConfirm(user);

    await user.click(screen.getByRole('button', { name: 'Remove section' }));

    expect(deleteMutate).toHaveBeenCalledWith(
      { blockOrder: 4 },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('surfaces a failed removal instead of pretending it worked', async () => {
    const user = userEvent.setup();
    deleteMutate.mockImplementation((_input, opts) => opts.onError(new Error('Boom.')));
    renderControls();
    await openConfirm(user);

    await user.click(screen.getByRole('button', { name: 'Remove section' }));

    expect(toastError).toHaveBeenCalledWith("We couldn't remove that section. Boom.");
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});

describe('removal toast copy', () => {
  it('says the removal is staged when the section is published', async () => {
    const user = userEvent.setup();
    deleteMutate.mockImplementation((_input, opts) => opts.onSuccess({ staged: true }));
    renderControls();
    await openConfirm(user);
    await user.click(screen.getByRole('button', { name: 'Remove section' }));

    expect(toastSuccess).toHaveBeenCalledWith(
      'Text section will be removed when you publish.',
      expect.any(Object),
    );
  });

  it('says the removal is immediate for a draft-only section', async () => {
    const user = userEvent.setup();
    deleteMutate.mockImplementation((_input, opts) => opts.onSuccess({ staged: false }));
    renderControls(block({ isDraft: true, publishedAt: null }));
    await openConfirm(user);
    await user.click(screen.getByRole('button', { name: 'Remove section' }));

    expect(toastSuccess).toHaveBeenCalledWith('Text section removed.', expect.any(Object));
  });
});

describe('undo', () => {
  async function removeAndGetToast(b: SiteBlockSummary = block(), staged = true) {
    const user = userEvent.setup();
    deleteMutate.mockImplementation((_input, opts) => opts.onSuccess({ staged }));
    renderControls(b);
    await openConfirm(user);
    await user.click(screen.getByRole('button', { name: 'Remove section' }));
    return lastToastOptions();
  }

  it('restores the prior draft by replaying the captured block', async () => {
    const options = await removeAndGetToast();

    expect(options.action?.label).toBe('Undo');
    options.action!.onClick();

    expect(upsertMutate).toHaveBeenCalledWith(
      {
        blockType: 'text',
        blockOrder: 4,
        content: { heading: 'Pool rules', body: 'No glass.' },
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('confirms the restore', async () => {
    upsertMutate.mockImplementation((_input, opts) => opts.onSuccess());
    const options = await removeAndGetToast();
    options.action!.onClick();

    expect(toastSuccess).toHaveBeenLastCalledWith('Text section restored.');
  });

  it('reports a failed restore rather than leaving the section gone in silence', async () => {
    upsertMutate.mockImplementation((_input, opts) => opts.onError(new Error('Nope.')));
    const options = await removeAndGetToast();
    options.action!.onClick();

    expect(toastError).toHaveBeenCalledWith("We couldn't restore that section. Nope.");
  });

  it('is offered for the immediate (draft-only) removal too', async () => {
    const options = await removeAndGetToast(block({ isDraft: true, publishedAt: null }), false);
    expect(options.action?.label).toBe('Undo');
  });

  it('is dismissible, and dismissing releases the captured payload', async () => {
    const options = await removeAndGetToast();

    expect(options.dismissible).toBe(true);
    expect(options.closeButton).toBe(true);

    options.onDismiss!();
    options.action!.onClick();

    expect(upsertMutate).not.toHaveBeenCalled();
  });

  it('is impossible once the window has expired — not silently broken', () => {
    // fireEvent rather than userEvent: userEvent's own internal waits are
    // coupled to the clock, and this assertion needs the clock under control.
    vi.useFakeTimers();
    deleteMutate.mockImplementation((_input, opts) => opts.onSuccess({ staged: true }));
    renderControls();

    fireEvent.click(screen.getByRole('button', { name: 'Remove Text section' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove section' }));

    const options = lastToastOptions();
    expect(options.action?.label).toBe('Undo');
    expect(options.duration).toBe(UNDO_WINDOW_MS);

    vi.advanceTimersByTime(UNDO_WINDOW_MS + 1);
    options.action!.onClick();

    // The payload was released with the window: no stale write lands at an
    // order the PM may have refilled since.
    expect(upsertMutate).not.toHaveBeenCalled();
  });

  it('cannot fire twice — a second undo is a no-op, not a duplicate insert', async () => {
    const options = await removeAndGetToast();

    options.action!.onClick();
    options.action!.onClick();

    expect(upsertMutate).toHaveBeenCalledTimes(1);
  });

  it('offers no undo for a block type the upsert contract cannot express', async () => {
    const user = userEvent.setup();
    deleteMutate.mockImplementation((_input, opts) => opts.onSuccess({ staged: true }));
    renderControls(block({ blockType: 'mystery' }));

    await user.click(screen.getByRole('button', { name: 'Remove mystery section' }));
    await user.click(screen.getByRole('button', { name: 'Remove section' }));

    // Plain toast, no options object — better a missing affordance than an
    // Undo that 400s on an unknown blockType.
    expect(toastSuccess).toHaveBeenCalledWith('mystery section will be removed when you publish.');
  });
});

describe('accessibility contract', () => {
  it('keeps the remove control mounted and focusable without any hover', () => {
    renderControls();
    const remove = screen.getByRole('button', { name: 'Remove Text section' });

    remove.focus();
    expect(remove).toHaveFocus();
  });

  it('moves focus into the dialog and back out on cancel — Radix owns the trap', async () => {
    const user = userEvent.setup();
    renderControls();
    const trigger = screen.getByRole('button', { name: 'Remove Text section' });

    await user.click(trigger);
    await waitFor(() => expect(screen.getByRole('alertdialog')).toContainElement(
      document.activeElement as HTMLElement,
    ));

    await user.click(screen.getByRole('button', { name: 'Keep section' }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
