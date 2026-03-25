'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface ResizableSplitProps {
  left: React.ReactNode;
  right: React.ReactNode;
  defaultRatio?: number;
  minLeft?: number;
  maxLeft?: number;
  storageKey?: string;
  className?: string;
}

export function ResizableSplit({
  left,
  right,
  defaultRatio = 55,
  minLeft = 40,
  maxLeft = 75,
  storageKey,
  className,
}: ResizableSplitProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const [ratio, setRatio] = useState<number>(() => {
    if (storageKey && typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored !== null) {
          const parsed = parseFloat(stored);
          if (!Number.isNaN(parsed) && parsed >= minLeft && parsed <= maxLeft) {
            return parsed;
          }
        }
      } catch {
        // localStorage unavailable
      }
    }
    return defaultRatio;
  });

  const clampRatio = useCallback(
    (value: number) => Math.min(maxLeft, Math.max(minLeft, value)),
    [minLeft, maxLeft],
  );

  const persistRatio = useCallback(
    (value: number) => {
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, String(value));
        } catch {
          // localStorage unavailable
        }
      }
    },
    [storageKey],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMouseMove = (moveEvent: MouseEvent) => {
        if (!isDragging.current || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = moveEvent.clientX - rect.left;
        const pct = (x / rect.width) * 100;
        setRatio(clampRatio(pct));
      };

      const onMouseUp = () => {
        isDragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        // Persist on drag end
        setRatio((current) => {
          persistRatio(current);
          return current;
        });
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [clampRatio, persistRatio],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      let newRatio: number | null = null;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        newRatio = clampRatio(ratio - 2);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        newRatio = clampRatio(ratio + 2);
      }
      if (newRatio !== null) {
        setRatio(newRatio);
        persistRatio(newRatio);
      }
    },
    [ratio, clampRatio, persistRatio],
  );

  // Cleanup dragging state on unmount
  useEffect(() => {
    return () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, []);

  return (
    <div ref={containerRef} className={cn('flex h-full', className)}>
      {/* Left panel */}
      <div
        className="h-full overflow-auto"
        style={{ flex: `0 0 ${ratio}%` }}
      >
        {left}
      </div>

      {/* Drag handle */}
      <div
        role="separator"
        aria-label="Resize panels"
        aria-valuenow={Math.round(ratio)}
        aria-valuemin={minLeft}
        aria-valuemax={maxLeft}
        tabIndex={0}
        className={cn(
          'flex h-full w-1.5 flex-shrink-0 cursor-col-resize flex-col items-center justify-center gap-1',
          'hover:bg-[var(--interactive-primary)]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-primary)]',
          'transition-colors',
        )}
        style={{ borderLeft: '1px solid var(--border-default)', borderRight: '1px solid var(--border-default)' }}
        onMouseDown={handleMouseDown}
        onKeyDown={handleKeyDown}
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-1 w-1 rounded-full"
            style={{ backgroundColor: 'var(--text-secondary)' }}
          />
        ))}
      </div>

      {/* Right panel */}
      <div className="h-full flex-1 overflow-auto">
        {right}
      </div>
    </div>
  );
}
