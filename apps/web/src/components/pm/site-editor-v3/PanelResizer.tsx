'use client';

import { useCallback, type KeyboardEvent, type PointerEvent } from 'react';
import { PANEL_MIN_WIDTH, PANEL_MAX_WIDTH, PANEL_DEFAULT_WIDTH } from './use-panel-width';

const STEP = 16;
const COARSE_STEP = 48;

export interface PanelResizerProps {
  width: number;
  onWidthChange: (next: number) => void;
}

/**
 * Drag handle between the tool panel and the canvas.
 *
 * Keyboard operation is not a fallback here, it is the primary contract: this
 * is a `role="separator"` with `aria-valuenow`, arrow keys move it, and
 * Home/End jump to the bounds. A pointer-only resizer is unusable for anyone
 * who cannot drag, and a 4px hit target is unusable for a lot of people who
 * can — hence the 12px hit area over a 1px visual line.
 */
export function PanelResizer({ width, onWidthChange }: PanelResizerProps) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const step = event.shiftKey ? COARSE_STEP : STEP;
      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          onWidthChange(width - step);
          break;
        case 'ArrowRight':
          event.preventDefault();
          onWidthChange(width + step);
          break;
        case 'Home':
          event.preventDefault();
          onWidthChange(PANEL_MIN_WIDTH);
          break;
        case 'End':
          event.preventDefault();
          onWidthChange(PANEL_MAX_WIDTH);
          break;
        default:
          break;
      }
    },
    [width, onWidthChange],
  );

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = width;

      const onMove = (moveEvent: globalThis.PointerEvent) => {
        onWidthChange(startWidth + (moveEvent.clientX - startX));
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [width, onWidthChange],
  );

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the tools panel"
      aria-valuenow={width}
      aria-valuemin={PANEL_MIN_WIDTH}
      aria-valuemax={PANEL_MAX_WIDTH}
      tabIndex={0}
      title="Drag, or use the arrow keys"
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onDoubleClick={() => onWidthChange(PANEL_DEFAULT_WIDTH)}
      className="relative z-10 -ml-1.5 w-3 shrink-0 cursor-col-resize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      {/* The visible line sits inside a wider hit area. */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-1.5 w-px bg-edge" />
    </div>
  );
}
