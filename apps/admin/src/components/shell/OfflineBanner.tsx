'use client';

import { useSyncExternalStore } from 'react';
import { CloudOff } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export interface OfflineBannerProps {
  /** ISO timestamp of the last successful signal fetch. Wave 4 supplies this. */
  cachedAt?: string | null;
}

function subscribe(callback: () => void): () => void {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function getSnapshot(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

// SSR has no network state to report — assume online so the banner never
// flashes on the server-rendered pass.
function getServerSnapshot(): boolean {
  return true;
}

/**
 * Renders only while the browser reports itself offline (`navigator.onLine`
 * plus `online`/`offline` events via `useSyncExternalStore`, so it stays in
 * sync with tab-visibility and network changes without polling).
 */
export function OfflineBanner({ cachedAt }: OfflineBannerProps) {
  const online = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (online) return null;

  // Built as one string (not split across JSX text nodes) so JSX's
  // newline-collapsing rules can't introduce or drop a space around the
  // interpolated clause.
  const message = `You’re offline${
    cachedAt ? ` — showing data cached ${formatDistanceToNow(new Date(cachedAt))} ago` : ''
  }. Actions are unavailable until you reconnect.`;

  return (
    <div
      role="status"
      className="flex items-center gap-2 bg-surface-inverse-subtle px-4 py-2 text-sm text-content-inverse md:px-8"
    >
      <CloudOff size={16} aria-hidden="true" />
      {message}
    </div>
  );
}
