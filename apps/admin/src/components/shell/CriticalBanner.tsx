'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, X } from 'lucide-react';
import type { ShellCritical } from '@/lib/server/signals/types';

const DISMISSED_KEY = 'ppro-admin-critical-dismissed';

function readDismissed(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(DISMISSED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    // Corrupt JSON or sessionStorage unavailable — treat as nothing dismissed.
    return [];
  }
}

function writeDismissed(fingerprints: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(DISMISSED_KEY, JSON.stringify(fingerprints));
  } catch {
    // Private-mode quota or storage disabled — the dismissal just won't survive a reload.
  }
}

export interface CriticalBannerProps {
  critical: ShellCritical | null;
  mobile: boolean;
}

/**
 * The single most urgent cross-console alert, dismissed PER FINGERPRINT
 * (not globally) so resolving one incident never hides an unrelated one
 * that fires later in the same session. Dismissals are persisted to
 * `sessionStorage` on dismiss — session-scoped by design: a fresh operator
 * session (or tab) starts clean.
 *
 * `dismissed` is seeded with `[]` — the value the server necessarily
 * produces, since `sessionStorage` doesn't exist there — and corrected in an
 * effect after mount, the same pattern `AdminShell`/`AdminRail` use for every
 * other browser-only fact. Reading `sessionStorage` in the `useState`
 * initializer instead (as this used to) is safe on the server (the
 * `typeof window === 'undefined'` guard in `readDismissed` covers that pass)
 * but NOT on the client's hydration render, where `window` already exists:
 * a previously-dismissed fingerprint would make that first render return
 * `null` while the server-rendered HTML still has the banner in it — a
 * hydration mismatch on a component `(console)/layout.tsx` renders as part
 * of the server-rendered `AdminShell` tree.
 */
export function CriticalBanner({ critical, mobile }: CriticalBannerProps) {
  const [dismissed, setDismissed] = useState<string[]>([]);

  useEffect(() => {
    setDismissed(readDismissed());
  }, []);

  if (!critical || dismissed.includes(critical.fingerprint)) return null;

  function handleDismiss() {
    if (!critical) return;
    const next = [...dismissed, critical.fingerprint];
    setDismissed(next);
    writeDismissed(next);
  }

  return (
    <div
      role="alert"
      className="flex items-center gap-3 bg-status-danger px-4 py-2 text-sm text-content-inverse md:px-8"
    >
      <AlertTriangle size={16} aria-hidden="true" className="shrink-0" />
      <p className="min-w-0 flex-1 truncate">{mobile ? critical.shortText : critical.text}</p>
      {/*
       * `relative` + `before:` below give both controls a touch target that
       * clears design.md's 44px (<768px) / 36px (>=768px) floor WITHOUT
       * growing the banner's own height. This is a "slim alert bar" living
       * outside any fixed-height chrome, so — unlike AdminTopBar's identical
       * `size-11 md:size-9` buttons, which sit inside an already-60px header
       * built to fit them — inflating the visible box here would inflate the
       * banner itself (Dismiss alone would take it from ~48px to ~60px tall,
       * as tall as the whole top bar). The invisible `::before` pseudo-element
       * extends the CLICKABLE/TAPPABLE area beyond the rendered box via
       * negative `inset`, leaving the visual chip exactly as designed; the
       * hover highlight still paints only the small visible box, matching the
       * brief's own hover treatment.
       */}
      <Link
        href={critical.href}
        className="relative shrink-0 rounded-sm border border-white/50 bg-white/20 px-2 py-1 text-xs font-semibold before:absolute before:inset-x-0 before:-inset-y-3 before:content-[''] md:before:-inset-y-2"
      >
        View
      </Link>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss"
        className="relative flex size-8 shrink-0 items-center justify-center rounded-sm hover:bg-white/20 before:absolute before:-inset-2 before:content-[''] md:before:-inset-1"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
