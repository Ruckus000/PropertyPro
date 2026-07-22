import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMediaQuery, useIsDesktop } from '@/hooks/use-media-query';

type Listener = (event: MediaQueryListEvent) => void;

function installMatchMedia(initialMatches: boolean) {
  const listeners = new Set<Listener>();
  const mql = {
    matches: initialMatches,
    media: '',
    addEventListener: (_: string, cb: Listener) => listeners.add(cb),
    removeEventListener: (_: string, cb: Listener) => listeners.delete(cb),
  };
  const matchMedia = vi.fn((query: string) => {
    mql.media = query;
    return mql as unknown as MediaQueryList;
  });
  window.matchMedia = matchMedia as unknown as typeof window.matchMedia;

  return {
    matchMedia,
    /** Simulate a viewport change firing the `change` event. */
    emit(matches: boolean) {
      mql.matches = matches;
      listeners.forEach((cb) => cb({ matches } as MediaQueryListEvent));
    },
    listenerCount: () => listeners.size,
  };
}

const originalMatchMedia = window.matchMedia;

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  vi.restoreAllMocks();
});

describe('useMediaQuery', () => {
  it('reflects the initial match state after the effect runs', () => {
    installMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(result.current).toBe(true);
  });

  it('updates when the media query result changes', () => {
    const mm = installMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(result.current).toBe(false);

    act(() => mm.emit(true));
    expect(result.current).toBe(true);

    act(() => mm.emit(false));
    expect(result.current).toBe(false);
  });

  it('removes its listener on unmount', () => {
    const mm = installMatchMedia(true);
    const { unmount } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(mm.listenerCount()).toBe(1);
    unmount();
    expect(mm.listenerCount()).toBe(0);
  });
});

describe('useIsDesktop', () => {
  it('queries the 768px breakpoint', () => {
    const mm = installMatchMedia(true);
    const { result } = renderHook(() => useIsDesktop());
    expect(mm.matchMedia).toHaveBeenCalledWith('(min-width: 768px)');
    expect(result.current).toBe(true);
  });
});
