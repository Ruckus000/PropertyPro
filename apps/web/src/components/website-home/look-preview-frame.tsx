'use client';

/**
 * A look preview: the real site, with the association's own content, as it
 * would be after choosing a look (D8). It is an iframe of the signed-in
 * `/pm/site-preview` route with `look=<id>`, which plans the switch without
 * writing anything. `preview=true` is what lets middleware relax the frame
 * headers for same-origin framing.
 *
 * The frame is a picture, not a page to use: it is `inert`, hidden from
 * assistive tech and out of the tab order, so a keyboard or screen-reader user
 * meets each look once, as the card's button, and never the links inside the
 * preview. It loads lazily, so cards below the fold cost nothing until seen.
 *
 * `fit` shrinks the full-size page into a thumbnail: the iframe keeps its real
 * width (so the layout lays out as it would on that screen) and is scaled down
 * from its top-left corner to the width of its box, which is fluid.
 */
import { useLayoutEffect, useRef, useState } from 'react';
import type { LookId } from '@/lib/site-looks/looks';
import { cn } from '@/lib/utils';

/** The preview of choosing `lookId`; null previews the site as it is (draft over live). */
export function lookPreviewUrl(communityId: number, lookId: LookId | null): string {
  const qs = new URLSearchParams({ communityId: String(communityId) });
  if (lookId) qs.set('look', lookId);
  qs.set('preview', 'true');
  return `/pm/site-preview?${qs.toString()}`;
}

interface LookPreviewFrameProps {
  communityId: number;
  lookId: LookId | null;
  /** Names the frame for anyone who inspects it; it is hidden from assistive tech. */
  title: string;
  /** The page's own width and height, in CSS pixels, before any scaling. */
  width: number;
  height: number;
  /**
   * A thumbnail: the frame fills its container's width, keeps the page's
   * proportions, and the page is scaled to fit. Without it the frame is the
   * page's own size (the large preview, whose box scrolls).
   */
  fit?: boolean;
  className?: string;
}

/** Before the first measurement, the scale a thumbnail in a 280 px card has. */
const FIRST_GUESS_SCALE = 0.25;

/**
 * The scale that fits a `width`-wide page into the element's own width, kept up
 * to date as the element resizes. Stays at the first guess where there is no
 * ResizeObserver (a test DOM).
 */
function useFitScale(width: number, enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(FIRST_GUESS_SCALE);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!enabled || !el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      if (el.clientWidth > 0) setScale(el.clientWidth / width);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [width, enabled]);
  return { ref, scale };
}

export function LookPreviewFrame({
  communityId,
  lookId,
  title,
  width,
  height,
  fit = false,
  className,
}: LookPreviewFrameProps) {
  const src = lookPreviewUrl(communityId, lookId);
  const { ref, scale } = useFitScale(width, fit);
  return (
    <div
      ref={ref}
      className={cn('overflow-hidden bg-surface-card', fit && 'relative w-full max-w-full', className)}
      // A thumbnail takes its width from the card (so it reflows at 320 px) and
      // its height from the page's proportions; the large preview is page-sized.
      style={fit ? { aspectRatio: `${width} / ${height}` } : { width, height }}
    >
      <iframe
        // A new look is a new page: remount rather than navigate the frame.
        key={src}
        src={src}
        title={title}
        inert
        aria-hidden="true"
        tabIndex={-1}
        loading="lazy"
        data-testid="look-preview-frame"
        className={cn('origin-top-left border-0 bg-surface-card', fit && 'absolute left-0 top-0')}
        style={{ width, height, transform: fit ? `scale(${scale})` : undefined }}
      />
    </div>
  );
}
