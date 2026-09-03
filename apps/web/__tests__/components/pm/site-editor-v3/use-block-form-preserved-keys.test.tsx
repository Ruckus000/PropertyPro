/**
 * `useBlockForm` — keys the FORMS do not own, carried across a save.
 *
 * The PATCH route fully REPLACES a block's content (`blocks/route.ts` —
 * `content: parse.data`, no server-side merge), and seven of the ten inspector
 * forms build their canonical payload as a fresh object literal with no spread
 * of the stored content. So any key a form does not re-emit is destroyed the
 * next time the PM edits that section.
 *
 * `hidden` is set entirely outside the forms — by the section list's eye
 * toggle — so it is exactly such a key. Without preservation a PM who hides a
 * section, then reopens it to fix a typo, silently republishes it: the
 * debounced autosave they never confirmed PATCHes content with no `hidden`
 * key, and because `hiddenSchema` is `z.literal(true)` absence IS visible.
 * There is no partial state to notice.
 *
 * Asserted at the hook rather than in each form because that is where the fix
 * lives — one place closing all seven, and the next block type added cannot
 * repeat the mistake. `SorEmptyTextForm` survives today only by accident (it
 * spreads `...draft.rest`); nothing held the other seven.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), dismiss: vi.fn(), info: vi.fn() },
}));

import { useBlockForm } from '@/components/pm/site-editor-v3/inspector/use-block-form';

const DELAY = 800;

interface Draft {
  heading: string;
}

/** Mirrors a real form: a tolerant parse, and a projection that rebuilds from scratch. */
function options(save: (content: unknown) => Promise<void>, content: unknown) {
  return {
    content,
    toDraft: (raw: unknown): Draft => ({
      heading: typeof (raw as Draft | null)?.heading === 'string' ? (raw as Draft).heading : '',
    }),
    // Deliberately NO spread of the stored content — the shape all seven
    // unsafe forms have, and the shape the hook has to compensate for.
    toCanonical: (draft: Draft) => (draft.heading.length === 0 ? null : { heading: draft.heading }),
    save,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('useBlockForm — editor-managed keys survive a form save', () => {
  it('keeps hidden: true when the PM edits a hidden section', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useBlockForm(options(save, { heading: 'A', hidden: true })),
    );

    act(() => {
      result.current.setDraft({ heading: 'Fixed a typo' });
    });
    await act(async () => {
      vi.advanceTimersByTime(DELAY + 50);
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ heading: 'Fixed a typo', hidden: true });
  });

  it('does not GRANT hidden to a section that never had it', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useBlockForm(options(save, { heading: 'A' })));

    act(() => {
      result.current.setDraft({ heading: 'B' });
    });
    await act(async () => {
      vi.advanceTimersByTime(DELAY + 50);
    });

    expect(save).toHaveBeenCalledTimes(1);
    const [payload] = save.mock.calls[0] as [Record<string, unknown>];
    expect(payload).toEqual({ heading: 'B' });
    expect('hidden' in payload).toBe(false);
  });

  it('drops the flag once the PM has unhidden the section', async () => {
    // Unhiding goes through `toggleHidden`, which writes content with the key
    // ABSENT and invalidates the blocks query — so the `content` prop the form
    // sees afterwards no longer carries it, and neither must the next save.
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      (content: unknown) => useBlockForm(options(save, content)),
      { initialProps: { heading: 'A', hidden: true } as Record<string, unknown> },
    );

    rerender({ heading: 'A' });
    act(() => {
      result.current.setDraft({ heading: 'B' });
    });
    await act(async () => {
      vi.advanceTimersByTime(DELAY + 50);
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ heading: 'B' });
  });

  it('never turns an unsaveable null projection into an object', async () => {
    // `toCanonical` returns null to mean "not valid enough to save yet".
    // Splicing a key in would make it saveable and write a block with no body.
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useBlockForm(options(save, { heading: 'A', hidden: true })),
    );

    act(() => {
      result.current.setDraft({ heading: '' });
    });
    await act(async () => {
      vi.advanceTimersByTime(DELAY + 50);
    });

    expect(save).not.toHaveBeenCalled();
    expect(result.current.isIncomplete).toBe(true);
  });

  it('still adopts a foreign edit to a hidden section, rather than reading as dirty', async () => {
    // The preservation is applied to BOTH sides of the hook's dirty check, so
    // it cancels out. Sourcing only `canonical` from it would make every hidden
    // block compare unequal to its own baseline — permanently "dirty", so a
    // discard or another tab's edit would never be adopted.
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      (content: unknown) => useBlockForm(options(save, content)),
      { initialProps: { heading: 'A', hidden: true } as Record<string, unknown> },
    );

    rerender({ heading: 'From another tab', hidden: true });

    expect(result.current.draft).toEqual({ heading: 'From another tab' });
    await act(async () => {
      vi.advanceTimersByTime(DELAY + 50);
    });
    // Adopting is not an edit.
    expect(save).not.toHaveBeenCalled();
  });
});
