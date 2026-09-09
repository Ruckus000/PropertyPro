'use client';

import { useState } from 'react';
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
 * that fires later in the same session. Dismissals are read once on mount
 * and persisted to `sessionStorage` on dismiss — session-scoped by design:
 * a fresh operator session (or tab) starts clean.
 */
export function CriticalBanner({ critical, mobile }: CriticalBannerProps) {
  const [dismissed, setDismissed] = useState<string[]>(() => readDismissed());

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
      <Link
        href={critical.href}
        className="shrink-0 rounded-sm border border-white/50 bg-white/20 px-2 py-1 text-xs font-semibold"
      >
        View
      </Link>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss"
        className="flex size-8 shrink-0 items-center justify-center rounded-sm hover:bg-white/20"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
