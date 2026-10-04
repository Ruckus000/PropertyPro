'use client';

/**
 * The editor's four-step tour (website builder v4, Phase 3).
 *
 * Each step points at a real element, found by its `data-tour` attribute and
 * measured on screen — never at hard-coded coordinates, which the design's
 * mock-up could use and a resizable editor cannot. A step whose element is
 * not on screen is skipped rather than shown pointing at nothing.
 *
 * A non-modal dialog: the editor stays usable around it. Focus moves to the
 * card on each step and returns to where it was when the tour ends. Escape,
 * "Skip tour" and the last step's "Start editing" all end it; `EditorRoot`
 * records that, so the tour never starts by itself again.
 *
 * Code-split: it runs once per manager, if at all.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { EditorMode } from '../tools';
import { useRequiredSections } from '../required-sections-context';
import { placeCard, tourSteps, TOUR_CARD_WIDTH, type Box } from './tour-steps';

export interface EditorTourProps {
  mode: EditorMode;
  onEnd: () => void;
}

const TITLE_ID = 'site-editor-tour-title';

function measure(el: Element): Box {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export function EditorTour({ mode, onEnd }: EditorTourProps) {
  const { level } = useRequiredSections();
  const floridaRules = level !== 'none';
  // Memoised: the effects below key on the step object, and a fresh array each
  // render would re-run them — and re-measure — forever.
  const steps = useMemo(() => tourSteps(mode, floridaRules), [mode, floridaRules]);
  const [index, setIndex] = useState(0);
  const [anchor, setAnchor] = useState<Box | null>(null);
  const [cardHeight, setCardHeight] = useState(200);
  const cardRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<Element | null>(null);
  const step = steps[index];
  const isLast = index === steps.length - 1;

  useEffect(() => {
    openerRef.current = document.activeElement;
    return () => {
      const opener = openerRef.current;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  // Find this step's element, or move past a step whose element is missing.
  useLayoutEffect(() => {
    if (!step) return;
    const el = document.querySelector(`[data-tour="${step.anchor}"]`);
    if (!el) {
      if (isLast) onEnd();
      // From THIS step only: StrictMode runs the effect twice, and a bare
      // `i + 1` then skipped the next step too, though its element was there.
      else setIndex((i) => (i === index ? i + 1 : i));
      return;
    }
    const update = () => setAnchor(measure(el));
    update();
    window.addEventListener('resize', update);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(el);
    return () => {
      window.removeEventListener('resize', update);
      observer?.disconnect();
    };
  }, [step, index, isLast, onEnd]);

  // The card's real height, for keeping it on screen.
  useLayoutEffect(() => {
    if (cardRef.current) setCardHeight(cardRef.current.offsetHeight || 200);
  }, [anchor, index]);

  // Focus follows the step, not the anchor's size: a resize must not pull
  // focus back to the card.
  const shown = anchor !== null;
  useEffect(() => {
    if (shown) cardRef.current?.focus();
  }, [shown, index]);

  const next = useCallback(() => {
    if (isLast) onEnd();
    else setIndex((i) => i + 1);
  }, [isLast, onEnd]);

  if (!step || !anchor) return null;
  const position = placeCard(
    anchor,
    { width: window.innerWidth, height: window.innerHeight },
    cardHeight,
  );

  return (
    <>
      <div
        aria-hidden="true"
        data-testid="tour-ring"
        className="pointer-events-none fixed z-40 rounded-[var(--radius-md)] ring-2 ring-interactive ring-offset-2"
        style={{ top: anchor.top, left: anchor.left, width: anchor.width, height: anchor.height }}
      />
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby={TITLE_ID}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          onEnd();
        }}
        className="fixed z-40 space-y-3 rounded-[var(--radius-lg)] bg-surface-inverse p-4 text-content-inverse shadow-lg focus-visible:outline-none motion-safe:transition-[top,left] motion-safe:duration-quick"
        style={{ top: position.top, left: position.left, width: TOUR_CARD_WIDTH }}
      >
        <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
          Quick tour · {index + 1} of {steps.length}
        </p>
        <h2 id={TITLE_ID} className="text-base font-semibold">
          {step.title}
        </h2>
        <p className="text-sm opacity-90">{step.body}</p>
        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={onEnd}
            className="rounded-[var(--radius-sm)] px-1 text-sm underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Skip tour
          </button>
          <Button size="sm" variant="secondary" onClick={next}>
            {isLast ? 'Start editing' : 'Next'}
          </Button>
        </div>
      </div>
    </>
  );
}
