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
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FloatControls } from '@/components/pm/site-editor-v3/canvas/FloatControls';
import { UndoableRemoveProvider } from '@/components/pm/site-editor-v3/undoable-remove-context';
import { UNDO_WINDOW_MS } from '@/components/pm/site-editor-v3/use-undoable-remove';
import type { SiteBlockSummary } from '@/hooks/use-content-blocks';
import { SelectedSitePageProvider } from '@/hooks/use-selected-site-page';

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

/**
 * The PUBLISHED side of the shared blocks query.
 *
 * `FloatControls` reads it to decide which of the two removal shapes the
 * confirm dialog describes — the same `(pageId, blockOrder)` match the server
 * makes. Empty by default, i.e. a section that has never been published.
 */
const publishedBlocks = vi.hoisted(() => ({ value: [] as unknown[] }));
const deleteMutate = vi.hoisted(() => vi.fn());
const upsertMutate = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/use-content-blocks', () => ({
  // FloatControls reads the published side to decide whether a removal is
  // staged or immediate; a factory missing it yields `undefined` at call time.
  usePublishedBlocks: () => ({ data: publishedBlocks.value }),
  useDeleteContentBlock: () => ({ mutate: deleteMutate, isPending: false }),
  useUpsertContentBlock: () => ({ mutate: upsertMutate, isPending: false }),
}));

const toastSuccess = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
// `dismiss` is here because `useUndoableRemove` takes the undo toast down
// when its section unmounts. A factory missing a newly-added export yields
// `undefined` at call time, which reads as an unrelated component breaking.
const toastDismiss = vi.hoisted(() => vi.fn());
// Every method the site-editor tree can reach, not only the ones this file
// asserts on: corpus trap #3 — a factory missing an export yields `undefined`
// at call time, which reads as an unrelated component breaking. `info` is the
// selection repair's channel (`EditorRoot.tsx`) and had zero coverage repo-wide.
vi.mock('sonner', () => ({
  toast: { success: toastSuccess, error: toastError, dismiss: toastDismiss, info: vi.fn() },
}));

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

/** Phase 11b — every SiteBlockSummary carries the page it belongs to. */
const HOME_PAGE_ID = 10;

function block(overrides: Partial<SiteBlockSummary> = {}): SiteBlockSummary {
  return {
    id: 2,
    pageId: HOME_PAGE_ID,
    blockType: 'text',
    blockOrder: 4,
    content: { heading: 'Pool rules', body: 'No glass.' },
    isDraft: false,
    publishedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderControls(b: SiteBlockSummary = block()) {
  return render(
    <UndoableRemoveProvider communityId={7}>
      <FloatControls block={b} communityId={7} />
    </UndoableRemoveProvider>,
  );
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
  publishedBlocks.value = [];
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

  it('does not promise a live-site change for a section that was never published', async () => {
    /*
     * The dialog said, unconditionally:
     *
     *   "It disappears from your site straight away, and from the live site the
     *    next time you publish."
     *
     * …while the toast it fires seconds later branches on exactly the fact it
     * ignored, and the toast is the one that is right. On a page the PM has just
     * created — which since 11b-3 is every page they add — publishing removes
     * the section from nothing, because it was never there.
     *
     * Not merely untrue: it invites an action on a false premise. A PM who
     * believes the removal is half-done publishes to finish it, and publishing
     * is all-or-nothing, so everything else in the draft ships with it.
     *
     * Revert check (production line): `describeSectionRemoval(hasPublishedCounterpart)`
     * in `FloatControls.tsx`, restored to the unconditional string.
     */
    const user = userEvent.setup();
    publishedBlocks.value = []; // never published
    renderControls();
    const dialog = await openConfirm(user);

    expect(within(dialog).getByText(/never been published/i)).toBeInTheDocument();
    expect(within(dialog).queryByText(/next time you publish/i)).not.toBeInTheDocument();
  });

  it('DOES promise a live-site change for a section that is published', async () => {
    /*
     * The positive control, and what stops the fix becoming "never mention the
     * live site". Same slot, same page — only the published side differs, which
     * is the one dimension under test.
     */
    const user = userEvent.setup();
    publishedBlocks.value = [
      { id: 99, pageId: HOME_PAGE_ID, blockOrder: 4, blockType: 'text', content: {} },
    ];
    renderControls();
    const dialog = await openConfirm(user);

    expect(within(dialog).getByText(/next time you publish/i)).toBeInTheDocument();
    expect(within(dialog).queryByText(/never been published/i)).not.toBeInTheDocument();
  });

  it('matches the published row by page AND slot, not by slot alone', async () => {
    /*
     * `block_order` is community-unique only until 11c drops the three-column
     * index, and the server compares `(pageId, blockOrder)`. A slot-only match
     * would read another page's published row as this section's and describe the
     * wrong outcome — silently, and only on multi-page sites.
     */
    const user = userEvent.setup();
    publishedBlocks.value = [
      // Same slot, DIFFERENT page.
      { id: 99, pageId: HOME_PAGE_ID + 1, blockOrder: 4, blockType: 'text', content: {} },
    ];
    renderControls();
    const dialog = await openConfirm(user);

    expect(within(dialog).getByText(/never been published/i)).toBeInTheDocument();
  });

  it('deletes by block order once confirmed', async () => {
    const user = userEvent.setup();
    deleteMutate.mockImplementation((_input, opts) => opts.onSuccess({ staged: true }));
    renderControls();
    await openConfirm(user);

    await user.click(screen.getByRole('button', { name: 'Remove section' }));

    expect(deleteMutate).toHaveBeenCalledWith(
      { blockOrder: 4, pageId: HOME_PAGE_ID },
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
        pageId: HOME_PAGE_ID,
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  /**
   * D-UNDO. The write hooks otherwise resolve the CURRENTLY-selected page, and
   * "currently" is the wrong tense for a replay: an undo issued after a page
   * switch would restore the section onto the page the PM is looking at rather
   * than the one they removed it from — silently, with the PM believing they
   * undid something.
   */
  it('restores an undone removal to the page it was removed from', async () => {
    const user = userEvent.setup();
    deleteMutate.mockImplementation((_input, opts) => opts.onSuccess({ staged: true }));
    const removed = block({ pageId: 10 });

    const { rerender } = render(
      <SelectedSitePageProvider pageId={10}>
        <UndoableRemoveProvider communityId={7}>
          <FloatControls block={removed} communityId={7} />
        </UndoableRemoveProvider>
      </SelectedSitePageProvider>,
    );
    await openConfirm(user);
    await user.click(screen.getByRole('button', { name: 'Remove section' }));
    expect(deleteMutate).toHaveBeenCalledWith(
      expect.objectContaining({ pageId: 10 }),
      expect.anything(),
    );

    // The PM moves to another page before hitting Undo.
    rerender(
      <SelectedSitePageProvider pageId={55}>
        <UndoableRemoveProvider communityId={7}>
          <FloatControls block={removed} communityId={7} />
        </UndoableRemoveProvider>
      </SelectedSitePageProvider>,
    );
    lastToastOptions().action!.onClick();

    expect(upsertMutate).toHaveBeenCalledWith(
      expect.objectContaining({ blockOrder: 4, pageId: 10 }),
      expect.anything(),
    );
  });

  it('captures the selected page at removal time for an unadopted block', async () => {
    // A pre-11b row carries pageId: null, so the page has to come from the
    // selection — captured when the removal happens, not read back later.
    const user = userEvent.setup();
    deleteMutate.mockImplementation((_input, opts) => opts.onSuccess({ staged: true }));
    const legacy = block({ pageId: null });

    const { rerender } = render(
      <SelectedSitePageProvider pageId={10}>
        <UndoableRemoveProvider communityId={7}>
          <FloatControls block={legacy} communityId={7} />
        </UndoableRemoveProvider>
      </SelectedSitePageProvider>,
    );
    await openConfirm(user);
    await user.click(screen.getByRole('button', { name: 'Remove section' }));

    rerender(
      <SelectedSitePageProvider pageId={55}>
        <UndoableRemoveProvider communityId={7}>
          <FloatControls block={legacy} communityId={7} />
        </UndoableRemoveProvider>
      </SelectedSitePageProvider>,
    );
    lastToastOptions().action!.onClick();

    expect(upsertMutate).toHaveBeenCalledWith(
      expect.objectContaining({ pageId: 10 }),
      expect.anything(),
    );
  });

  it('omits the page entirely outside a selected-page provider', async () => {
    // The onboarding wizard's tree. `useSelectedSitePage()` must return null,
    // not throw, and a null block page then leaves the server to default.
    const options = await removeAndGetToast(block({ pageId: null }));
    options.action!.onClick();

    expect(upsertMutate).toHaveBeenCalledWith(
      expect.objectContaining({ pageId: null }),
      expect.anything(),
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

describe('the removed section leaves the canvas — the ordinary path', () => {
  /*
   * The case that made the previous design wrong, and that this file could not
   * see while it mounted `FloatControls` alone and never unmounted it.
   *
   * A removal writes a TOMBSTONE — a new row, new id, a type no view renders —
   * so `Canvas`'s `blocksForPage(...).filter(hasView)` drops the original id and
   * `SectionShell key={block.id}` unmounts on the refetch the delete triggers.
   * That is every removal, not an edge case.
   *
   * While the pending payload and the toast id lived in `useUndoableRemove`,
   * that unmount ran a cleanup which dismissed the toast it had just created.
   * The undo host now sits above the section, so the section going away takes
   * nothing with it.
   */
  it('keeps the Undo offer alive after the section unmounts', async () => {
    const user = userEvent.setup();
    deleteMutate.mockImplementation((_input, opts) => opts.onSuccess({ staged: true }));
    const removed = block({ pageId: 10 });

    const { rerender } = render(
      <SelectedSitePageProvider pageId={10}>
        <UndoableRemoveProvider communityId={7}>
          <FloatControls block={removed} communityId={7} />
        </UndoableRemoveProvider>
      </SelectedSitePageProvider>,
    );
    await openConfirm(user);
    await user.click(screen.getByRole('button', { name: 'Remove section' }));

    // The refetch lands and the section is gone from the canvas. The host stays.
    rerender(
      <SelectedSitePageProvider pageId={10}>
        <UndoableRemoveProvider communityId={7} />
      </SelectedSitePageProvider>,
    );

    // Not dismissed…
    expect(toastDismiss).not.toHaveBeenCalled();
    // …and still able to put the section back.
    lastToastOptions().action!.onClick();
    expect(upsertMutate).toHaveBeenCalledWith(
      expect.objectContaining({ blockOrder: 4, pageId: 10 }),
      expect.anything(),
    );
  });
});
