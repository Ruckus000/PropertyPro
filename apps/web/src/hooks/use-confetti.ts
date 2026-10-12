'use client';

import { useEffect } from 'react';
import confetti from 'canvas-confetti';

interface UseConfettiOptions {
  /** Fire on mount (default: true) */
  enabled?: boolean;
  /** Duration in ms (default: 3000) */
  duration?: number;
}

/**
 * Fire a two-sided confetti burst on mount.
 *
 * Draws on the MAIN thread, into a canvas this hook owns. canvas-confetti's
 * default export renders in a Web Worker built from a `blob:` URL, which our
 * CSP (`worker-src 'self'`, `buildCspHeader` in packages/shared) blocks. The
 * Worker constructor does not throw on that block — the worker just never
 * runs — so the library had already transferred its canvas to the dead worker
 * and nothing was ever drawn. `useWorker: false` keeps the CSP as it is.
 *
 * Does nothing under `prefers-reduced-motion: reduce`.
 */
export function useConfetti({ enabled = true, duration = 3000 }: UseConfettiOptions = {}) {
  useEffect(() => {
    if (!enabled) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.dataset.confetti = '';
    // Full-viewport overlay that never intercepts input. z-index matches the
    // library's own canvas default.
    Object.assign(canvas.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: '100',
    });
    document.body.appendChild(canvas);

    const fire = confetti.create(canvas, {
      resize: true,
      useWorker: false,
      disableForReducedMotion: true,
    });

    const end = Date.now() + duration;
    let rafId = 0;

    const frame = () => {
      fire({ particleCount: 3, angle: 60, spread: 55, origin: { x: 0, y: 0.7 } });
      fire({ particleCount: 3, angle: 120, spread: 55, origin: { x: 1, y: 0.7 } });

      if (Date.now() < end) {
        rafId = requestAnimationFrame(frame);
      }
    };

    frame();

    const teardown = () => {
      cancelAnimationFrame(rafId);
      fire.reset();
      canvas.remove();
    };

    const timeout = setTimeout(teardown, duration + 2000);

    // No fire-once ref: under React Strict Mode the effect runs, cleans up and
    // runs again, and a ref that survived the cleanup suppressed the second
    // run after the first had already been torn down.
    return () => {
      clearTimeout(timeout);
      teardown();
    };
  }, [enabled, duration]);
}
