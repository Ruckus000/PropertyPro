/**
 * TextForm — the first per-block inspector form, and therefore the proof that
 * the whole chain works: tolerant parse, canonicalisation, debounced autosave,
 * echo suppression, foreign-change adoption, and flush on unmount.
 *
 * The reconciliation rules are the interesting part. They live in
 * `useBlockForm`, but they are only meaningful through a real form, so they
 * are exercised here rather than against the hook in isolation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TextForm } from '@/components/pm/site-editor-v3/inspector/forms/TextForm';
import { settleAutosave } from './autosave-harness';

const upsertMock = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-content-blocks', () => ({
  // FloatControls reads the published side to decide whether a removal is
  // staged or immediate; a factory missing it yields `undefined` at call time.
  usePublishedBlocks: () => ({ data: [] }),
  // Mock the module COMPLETELY for what this subtree reaches. A partial
  // factory fails only at module load, for whichever component reaches the
  // missing export, and reads as an unrelated component breaking.
  useUpsertContentBlock: () => ({ mutateAsync: upsertMock, isPending: false }),
}));

function renderForm(content: unknown) {
  return render(
    <TextForm communityId={42} blockType="text" blockOrder={3} content={content} />,
  );
}

/** Advance past the autosave debounce and let the write settle. */

beforeEach(() => {
  upsertMock.mockReset();
  upsertMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('TextForm — parsing', () => {
  it('opens a block whose stored content fails its schema, so it can be fixed', () => {
    // A block that went invalid (a bad import, an older shape) must still be
    // editable — this form is the only place a PM can repair it.
    renderForm({ body: 42, heading: null, stray: 'ignored' });

    expect(screen.getByLabelText(/Body/)).toHaveValue('');
    expect(screen.getByLabelText('Heading')).toHaveValue('');
  });

  it('renders stored content into the fields', () => {
    renderForm({ heading: 'Pool rules', body: 'No diving.' });

    expect(screen.getByLabelText('Heading')).toHaveValue('Pool rules');
    expect(screen.getByLabelText(/Body/)).toHaveValue('No diving.');
  });
});

describe('TextForm — saving', () => {
  it('writes once per burst, not once per keystroke', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderForm({ body: 'Start.' });

    await user.type(screen.getByLabelText(/Body/), ' More');
    expect(upsertMock).not.toHaveBeenCalled();

    await settleAutosave();
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock).toHaveBeenCalledWith({
      blockType: 'text',
      blockOrder: 3,
      content: { body: 'Start. More' },
    });
  });

  it('omits an emptied heading instead of sending an empty string', async () => {
    // `''` is a real value to stableStringify, so {heading:'', body} and
    // {body} are different keys — clear-and-retype would write twice. It also
    // fails `z.string().min(1)` at publish.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderForm({ heading: 'Old', body: 'Body text.' });

    await user.clear(screen.getByLabelText('Heading'));
    await settleAutosave();

    expect(upsertMock).toHaveBeenCalledWith({
      blockType: 'text',
      blockOrder: 3,
      content: { body: 'Body text.' },
    });
  });

  it('does not save while the required body is empty, and says so', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderForm({ body: 'Something.' });

    await user.clear(screen.getByLabelText(/Body/));
    await settleAutosave();

    expect(upsertMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Add some text before this section can be saved/i)).toBeInTheDocument();
  });

  it('saves nothing on mount', async () => {
    // Opening a section must never manufacture a write, or the change count
    // grows just from looking at the page.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderForm({ heading: 'Pool rules', body: 'No diving.' });

    await settleAutosave();
    expect(upsertMock).not.toHaveBeenCalled();
  });
});

describe('TextForm — reconciliation', () => {
  it('does not clobber in-progress typing when the save echo comes back', async () => {
    // The refetch after a save returns exactly what we wrote. By content that
    // reads as an incoming change; adopting it would overwrite the draft with
    // a version up to one debounce window stale.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const view = renderForm({ body: 'One' });

    await user.type(screen.getByLabelText(/Body/), ' two');
    await settleAutosave();
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ content: { body: 'One two' } }),
    );

    // The PM keeps typing while the refetch is in flight...
    await user.type(screen.getByLabelText(/Body/), ' three');
    // ...and the echo of the PREVIOUS save lands.
    view.rerender(
      <TextForm communityId={42} blockType="text" blockOrder={3} content={{ body: 'One two' }} />,
    );

    expect(screen.getByLabelText(/Body/)).toHaveValue('One two three');
  });

  it('adopts a foreign change when the form is clean', async () => {
    // A discard, a revert, another tab. With nothing unsaved, showing the PM
    // the truth is the point.
    const view = renderForm({ body: 'Original.' });

    view.rerender(
      <TextForm communityId={42} blockType="text" blockOrder={3} content={{ body: 'Reverted.' }} />,
    );

    await waitFor(() => expect(screen.getByLabelText(/Body/)).toHaveValue('Reverted.'));
  });

  it('keeps the PM text when a foreign change arrives mid-edit', async () => {
    // Deliberate limitation of this phase: last-writer-wins, not conflict
    // resolution. Losing what someone is actively typing is the worse failure.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const view = renderForm({ body: 'Original.' });

    await user.clear(screen.getByLabelText(/Body/));
    await user.type(screen.getByLabelText(/Body/), 'My unsaved edit');

    view.rerender(
      <TextForm communityId={42} blockType="text" blockOrder={3} content={{ body: 'Someone else.' }} />,
    );

    expect(screen.getByLabelText(/Body/)).toHaveValue('My unsaved edit');
  });
});

describe('TextForm — unmount', () => {
  it('flushes a pending edit rather than dropping it', async () => {
    // EditorShell unmounts the whole editor at 768px and swaps docked for
    // overlay at 1280px. Without a flush, everything inside the debounce
    // window is lost on a resize.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const view = renderForm({ body: 'Start.' });

    await user.type(screen.getByLabelText(/Body/), ' edited');
    expect(upsertMock).not.toHaveBeenCalled();

    await act(async () => {
      view.unmount();
      await Promise.resolve();
    });

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ content: { body: 'Start. edited' } }),
    );
  });
});

describe('TextForm — a hidden section stays hidden through an edit', () => {
  it('carries hidden: true through the real form, not just the hook', async () => {
    // The end of the chain the hook-level suite starts
    // (`use-block-form-preserved-keys.test.tsx`): `toCanonical` here really
    // does rebuild content as a fresh literal, and the PATCH route really does
    // replace content wholesale — so without preservation this write is what
    // silently republishes a section the PM hid.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderForm({ body: 'No divng.', hidden: true });

    await user.clear(screen.getByLabelText(/Body/));
    await user.type(screen.getByLabelText(/Body/), 'No diving.');
    await settleAutosave();

    expect(upsertMock).toHaveBeenLastCalledWith({
      blockType: 'text',
      blockOrder: 3,
      content: { body: 'No diving.', hidden: true },
    });
  });
});
