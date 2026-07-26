'use client';

import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AutosaveStatus } from './useAutosave';

export interface StatusLineProps {
  status: AutosaveStatus;
  /** Epoch ms of the last successful save. Injected — never read from a clock here. */
  lastSavedAt?: number | null;
  error?: Error | null;
  onRetry?: () => void;
  /**
   * IANA zone for the timestamp. Defaults to the viewer's zone; tests pass
   * 'UTC' so the rendered time does not depend on the machine's TZ.
   */
  timeZone?: string;
  className?: string;
}

function formatSavedAt(timestamp: number, timeZone?: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(timestamp));
}

/**
 * The editor's save-status line, passed to `EditorTopBar`'s `status` prop.
 *
 * Two live regions, deliberately:
 *  - progress and success use `role="status"` (polite) — it should never
 *    interrupt someone mid-sentence in an inspector field;
 *  - failure uses `role="alert"` (assertive), because unsaved work is exactly
 *    the case where waiting for a pause in typing is the wrong trade.
 *
 * Idle with no prior save renders nothing. A "Saved" with nothing behind it is
 * worse than silence — it claims a write that never happened.
 */
export function StatusLine({
  status,
  lastSavedAt = null,
  error = null,
  onRetry,
  timeZone,
  className,
}: StatusLineProps) {
  const base = cn('flex min-w-0 items-center gap-1.5 text-xs', className);

  if (status === 'error') {
    return (
      <p role="alert" className={cn(base, 'text-status-danger')}>
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {/* `||`, not `??` — an Error with an empty message is as useless as none. */}
        <span className="truncate">{error?.message || "We couldn't save your changes."}</span>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 rounded-sm underline underline-offset-2 hover:no-underline"
          >
            Try again
          </button>
        ) : null}
      </p>
    );
  }

  if (status === 'saving') {
    return (
      <p role="status" aria-live="polite" className={cn(base, 'text-content-secondary')}>
        <Loader2
          className="h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
        Saving…
      </p>
    );
  }

  if (lastSavedAt === null) {
    // Idle, nothing written yet — stay quiet rather than assert a save.
    return null;
  }

  return (
    <p role="status" aria-live="polite" className={cn(base, 'text-content-secondary')}>
      <Check className="h-3.5 w-3.5 shrink-0 text-status-success" aria-hidden="true" />
      Draft saved · {formatSavedAt(lastSavedAt, timeZone)}
    </p>
  );
}
