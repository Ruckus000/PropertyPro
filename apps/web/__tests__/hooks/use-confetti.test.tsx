import { StrictMode } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const { defaultConfettiMock, createMock, fireMock, resetMock } = vi.hoisted(() => {
  const resetMock = vi.fn();
  const fireMock = Object.assign(vi.fn(), { reset: resetMock });
  return {
    defaultConfettiMock: Object.assign(vi.fn(), { reset: vi.fn() }),
    createMock: vi.fn(() => fireMock),
    fireMock,
    resetMock,
  };
});

vi.mock('canvas-confetti', () => ({
  default: Object.assign(defaultConfettiMock, { create: createMock }),
}));

import { useConfetti } from '@/hooks/use-confetti';

function setReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn((query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion: reduce'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

const confettiCanvases = () =>
  Array.from(document.body.querySelectorAll<HTMLCanvasElement>('canvas[data-confetti]'));

const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  vi.useFakeTimers();
  setReducedMotion(false);
});

afterEach(() => {
  vi.useRealTimers();
  window.matchMedia = originalMatchMedia;
  vi.clearAllMocks();
  document.body.innerHTML = '';
});

describe('useConfetti', () => {
  it('draws on the main thread into a canvas the hook owns, never the worker-backed global', () => {
    renderHook(() => useConfetti());

    const canvases = confettiCanvases();
    expect(canvases).toHaveLength(1);
    const canvas = canvases[0]!;
    expect(canvas.getAttribute('aria-hidden')).toBe('true');
    expect(canvas.style.position).toBe('fixed');
    expect(canvas.style.pointerEvents).toBe('none');

    // The CSP (`worker-src 'self'`) blocks canvas-confetti's blob: worker.
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledWith(
      canvas,
      expect.objectContaining({ useWorker: false, resize: true }),
    );
    expect(defaultConfettiMock).not.toHaveBeenCalled();

    // First frame fires both sides.
    expect(fireMock).toHaveBeenCalledTimes(2);
  });

  it('still fires under React Strict Mode, which runs the effect twice', () => {
    renderHook(() => useConfetti(), { wrapper: StrictMode });

    expect(confettiCanvases()).toHaveLength(1);
    fireMock.mockClear();
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(fireMock).toHaveBeenCalled();
  });

  it('does nothing when the user prefers reduced motion', () => {
    setReducedMotion(true);
    renderHook(() => useConfetti());

    expect(createMock).not.toHaveBeenCalled();
    expect(defaultConfettiMock).not.toHaveBeenCalled();
    expect(confettiCanvases()).toHaveLength(0);
  });

  it('does nothing when disabled', () => {
    renderHook(() => useConfetti({ enabled: false }));

    expect(createMock).not.toHaveBeenCalled();
    expect(confettiCanvases()).toHaveLength(0);
  });

  it('stops firing and removes its canvas on unmount', () => {
    const { unmount } = renderHook(() => useConfetti({ duration: 3000 }));
    expect(confettiCanvases()).toHaveLength(1);

    unmount();
    expect(resetMock).toHaveBeenCalled();
    expect(confettiCanvases()).toHaveLength(0);

    fireMock.mockClear();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(fireMock).not.toHaveBeenCalled();
  });

  it('stops firing after the duration and removes its canvas once the burst settles', () => {
    renderHook(() => useConfetti({ duration: 1000 }));

    act(() => {
      vi.advanceTimersByTime(1100);
    });
    fireMock.mockClear();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(fireMock).not.toHaveBeenCalled();
    expect(confettiCanvases()).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(resetMock).toHaveBeenCalled();
    expect(confettiCanvases()).toHaveLength(0);
  });
});
