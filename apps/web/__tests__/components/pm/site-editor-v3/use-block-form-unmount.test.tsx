/**
 * The inspector form's unmount contract — asserted at the SEAM, not on the leaf.
 *
 * `useAutosave.test.ts` proves "an unmount leaves nothing armed", which is true
 * of the hook in isolation and is exactly what makes it look, read alone, as
 * though an unmount DISCARDS a pending edit: its cleanup clears the debounce
 * without saving (`useAutosave.ts`, mount effect).
 *
 * It does not, because nothing consumes `useAutosave` bare. Its only consumer
 * in the editor is `useBlockForm`, which wraps it in a flush-on-unmount effect
 * written for precisely this class of unmount. The 11b-3 review read the leaf
 * and concluded a page switch silently drops an in-flight inspector edit; these
 * cases are the composition that settles it, and they are what would fail if a
 * future refactor dropped the wrapper — the leaf test would stay green.
 *
 * Corpus trap #6: a component contract asserted in isolation cannot see the
 * composition that forgets it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useBlockForm } from '@/components/pm/site-editor-v3/inspector/use-block-form';

const DELAY = 800;

interface Draft {
  heading: string;
}

/**
 * Mirrors a real inspector form: a tolerant parse, and a canonical projection
 * that refuses to persist an empty required field.
 */
function options(save: (content: unknown) => Promise<void>, content: unknown = { heading: 'A' }) {
  return {
    content,
    toDraft: (raw: unknown): Draft => ({
      heading: typeof (raw as Draft | null)?.heading === 'string' ? (raw as Draft).heading : '',
    }),
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

describe('useBlockForm — unmount while an edit is still inside the debounce window', () => {
  it('flushes the pending edit rather than discarding it', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() => useBlockForm(options(save)));

    // Type, and stop short of the debounce firing. This is the whole window the
    // review claimed was lost: the debounce re-arms on every keystroke, so an
    // un-idle edit is entirely pending, not merely its last 800ms.
    act(() => {
      result.current.setDraft({ heading: 'Edited' });
    });
    await act(async () => {
      vi.advanceTimersByTime(DELAY - 1);
    });
    expect(save).not.toHaveBeenCalled();

    await act(async () => {
      unmount();
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ heading: 'Edited' });
  });

  it('writes the LAST value typed, not the one that armed the debounce', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() => useBlockForm(options(save)));

    act(() => {
      result.current.setDraft({ heading: 'First' });
    });
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    act(() => {
      result.current.setDraft({ heading: 'Second' });
    });

    await act(async () => {
      unmount();
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ heading: 'Second' });
  });

  it('does not write when the draft is unchanged, so an unmount is not itself an edit', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { unmount } = renderHook(() => useBlockForm(options(save)));

    await act(async () => {
      unmount();
    });

    expect(save).not.toHaveBeenCalled();
  });

  it('does not write an incomplete draft — an emptied required field is not persisted', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() => useBlockForm(options(save)));

    act(() => {
      result.current.setDraft({ heading: '' });
    });
    await act(async () => {
      unmount();
    });

    expect(save).not.toHaveBeenCalled();
  });
});
