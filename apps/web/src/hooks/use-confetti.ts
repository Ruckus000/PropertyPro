'use client';

import { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';

interface UseConfettiOptions {
  /** Fire on mount (default: true) */
  enabled?: boolean;
  /** Duration in ms (default: 3000) */
  duration?: number;
}

export function useConfetti({ enabled = true, duration = 3000 }: UseConfettiOptions = {}) {
  const hasFired = useRef(false);

  useEffect(() => {
    if (!enabled || hasFired.current) return;
    hasFired.current = true;

    // Respect prefers-reduced-motion
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.7 },
        disableForReducedMotion: true,
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.7 },
        disableForReducedMotion: true,
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };

    frame();

    const timeout = setTimeout(() => {
      confetti.reset();
    }, duration + 2000);

    return () => {
      clearTimeout(timeout);
      confetti.reset();
    };
  }, [enabled, duration]);
}
