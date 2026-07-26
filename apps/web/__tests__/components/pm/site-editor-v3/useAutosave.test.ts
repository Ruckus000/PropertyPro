/**
 * Autosave — when a write is allowed to happen, and when it must not.
 *
 * Each `describe` below maps to one behaviour the editor's trustworthiness
 * depends on: a burst is one write, mount is never a write, a no-op is never a
 * write, two writes never race, a failure is visible and bounded, and an
 * unmount leaves nothing armed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAutosave } from '@/components/pm/site-editor-v3/useAutosave';

const DELAY = 800;

/** A promise whose settlement the test controls, so "in flight" is observable. */
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Advance fake timers and let any microtasks the timer kicked off settle. */
async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('useAutosave — 1. a burst coalesces into one save', () => {
  it('saves once with the final value after five quick edits', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ value }: { value: string }) => useAutosave(value, save, { delayMs: DELAY }),
      { initialProps: { value: '' } },
    );

    for (const value of ['H', 'He', 'Hel', 'Hell', 'Hello']) {
      rerender({ value });
      await advance(100);
    }
    expect(save).not.toHaveBeenCalled();

    await advance(DELAY);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('Hello');
  });
});

describe('useAutosave — 2. never fires on mount', () => {
  it('treats the mount value as already saved', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useAutosave({ heading: 'About us' }, save, { delayMs: DELAY }),
    );

    await advance(DELAY * 10);
    expect(save).not.toHaveBeenCalled();
    // And no phantom "saved" stamp for a write that never happened.
    expect(result.current.status).toBe('idle');
    expect(result.current.lastSavedAt).toBeNull();
  });
});

describe('useAutosave — 3. never fires on a no-op change', () => {
  it('skips a new object that is deep-equal to the saved value', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ value }: { value: Record<string, unknown> }) =>
        useAutosave(value, save, { delayMs: DELAY }),
      { initialProps: { value: { heading: 'About us', limit: 3 } } },
    );

    // Fresh identity, different key order, same content.
    rerender({ value: { limit: 3, heading: 'About us' } });
    await advance(DELAY * 2);
    expect(save).not.toHaveBeenCalled();
  });

  it('skips an edit that is reverted back to the saved value', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ value }: { value: string }) => useAutosave(value, save, { delayMs: DELAY }),
      { initialProps: { value: 'About us' } },
    );

    rerender({ value: 'About u' });
    await advance(100);
    rerender({ value: 'About us' });
    await advance(DELAY * 2);
    expect(save).not.toHaveBeenCalled();
  });
});

describe('useAutosave — 4. an in-flight save is not duplicated', () => {
  it('queues exactly one follow-up for changes made mid-request', async () => {
    const first = deferred();
    const save = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined);
    const { rerender, result } = renderHook(
      ({ value }: { value: string }) => useAutosave(value, save, { delayMs: DELAY }),
      { initialProps: { value: 'a' } },
    );

    rerender({ value: 'ab' });
    await advance(DELAY);
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('saving');

    // Two more edits land while the first request is still open.
    rerender({ value: 'abc' });
    await advance(DELAY);
    rerender({ value: 'abcd' });
    await advance(DELAY);
    expect(save).toHaveBeenCalledTimes(1);

    await act(async () => {
      first.resolve();
      await first.promise;
    });

    // Exactly one follow-up, carrying the newest value — not two racing writes.
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith('abcd');
    expect(result.current.status).toBe('saved');
    expect(result.current.lastSavedAt).toBe(Date.now());
  });
});

describe('useAutosave — 5. a failure surfaces an error and retries, but not forever', () => {
  it('reports the error, retries on a bounded backoff, and honours retry()', async () => {
    const save = vi.fn().mockRejectedValue(new Error('network down'));
    const { rerender, result } = renderHook(
      ({ value }: { value: string }) => useAutosave(value, save, { delayMs: DELAY }),
      { initialProps: { value: 'a' } },
    );

    rerender({ value: 'ab' });
    await advance(DELAY);
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('error');
    expect(result.current.error?.message).toBe('network down');

    // Two automatic retries on backoff.
    await advance(600);
    expect(save).toHaveBeenCalledTimes(2);
    await advance(2400);
    expect(save).toHaveBeenCalledTimes(3);

    // Then it stops — a dead endpoint must not become a request storm.
    await advance(60_000);
    expect(save).toHaveBeenCalledTimes(3);

    // A manual attempt still works, and a success clears the error.
    save.mockResolvedValueOnce(undefined);
    await act(async () => {
      result.current.retry();
    });
    expect(save).toHaveBeenCalledTimes(4);
    expect(result.current.status).toBe('saved');
    expect(result.current.error).toBeNull();
  });
});

describe('useAutosave — 6. unmount cancels pending work', () => {
  it('does not save, or set state, after unmount', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const save = vi.fn().mockResolvedValue(undefined);
    const { rerender, unmount } = renderHook(
      ({ value }: { value: string }) => useAutosave(value, save, { delayMs: DELAY }),
      { initialProps: { value: 'a' } },
    );

    rerender({ value: 'ab' });
    await advance(100);
    unmount();
    await advance(DELAY * 5);

    expect(save).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('does not set state when an in-flight save settles after unmount', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const pending = deferred();
    const save = vi.fn().mockReturnValue(pending.promise);
    const { rerender, unmount } = renderHook(
      ({ value }: { value: string }) => useAutosave(value, save, { delayMs: DELAY }),
      { initialProps: { value: 'a' } },
    );

    rerender({ value: 'ab' });
    await advance(DELAY);
    expect(save).toHaveBeenCalledTimes(1);

    unmount();
    await act(async () => {
      pending.resolve();
      await pending.promise;
    });

    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});

describe('useAutosave — flush and enabled', () => {
  it('flush() writes immediately without waiting for the debounce', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { rerender, result } = renderHook(
      ({ value }: { value: string }) => useAutosave(value, save, { delayMs: DELAY }),
      { initialProps: { value: 'a' } },
    );

    rerender({ value: 'ab' });
    await act(async () => {
      await result.current.flush();
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('ab');

    // The debounce timer was cancelled, not merely beaten.
    await advance(DELAY * 2);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('tracks changes but writes nothing while disabled', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ value }: { value: string }) => useAutosave(value, save, { delayMs: DELAY, enabled: false }),
      { initialProps: { value: 'a' } },
    );

    rerender({ value: 'ab' });
    await advance(DELAY * 3);
    expect(save).not.toHaveBeenCalled();
  });
});
