'use client';

/**
 * StaleDemosBanner — the "aging demo, offer to delete it" card + confirm flow.
 *
 * Moved verbatim out of `ClientPortfolio` (Task 15 / spec D9's clients-grid
 * slice deleted this surface from that component; it belongs on the Demos
 * page instead — task-18-dispatch-notes.md correction #5). Diffed against the
 * pre-image at `26f54d68^:apps/admin/src/components/clients/ClientPortfolio.tsx`
 * (the four regions: the `StaleDemo` interface, the four `useState` hooks, the
 * resync effect + `executeDeleteDemo`, and the card + confirm-dialog JSX).
 *
 * The confirm dialog here is still the pre-image's bare, role-less `<div>` —
 * dialog semantics (role, aria-modal, focus handling, Escape) land in a
 * separate follow-up commit so the move above stays diffable against its
 * source (correction #4).
 */
import { useState, useCallback, useEffect } from 'react';
import { Trash2, X } from 'lucide-react';
import { COMMUNITY_TYPE_LABELS } from '@/lib/constants/community-labels';
import { staleBadge } from '@/lib/utils/stale-badge';

export interface StaleDemo {
  id: number;
  prospect_name: string;
  template_type: string;
  created_at: string;
}

interface StaleDemosBannerProps {
  staleDemos: StaleDemo[];
}

export function StaleDemosBanner({ staleDemos }: StaleDemosBannerProps) {
  const [currentStaleDemos, setCurrentStaleDemos] = useState(staleDemos);
  const [deletingDemoIds, setDeletingDemoIds] = useState<number[]>([]);
  const [staleDemoDeleteError, setStaleDemoDeleteError] = useState<string | null>(null);
  const [confirmDeleteDemo, setConfirmDeleteDemo] = useState<StaleDemo | null>(null);

  useEffect(() => {
    setCurrentStaleDemos(staleDemos);
  }, [staleDemos]);

  const executeDeleteDemo = useCallback(async (demo: StaleDemo) => {
    setStaleDemoDeleteError(null);
    setDeletingDemoIds((previousIds) =>
      previousIds.includes(demo.id)
        ? previousIds
        : [...previousIds, demo.id],
    );

    try {
      const response = await fetch(`/api/admin/demos/${demo.id}`, { method: 'DELETE' });
      if (response.ok) {
        setCurrentStaleDemos((previousDemos) =>
          previousDemos.filter((existingDemo) => existingDemo.id !== demo.id),
        );
      } else {
        const errorData = await response.json().catch(() => null);
        const message = errorData?.error?.message || 'Failed to delete demo. Please try again.';
        setStaleDemoDeleteError(message);
      }
    } catch (error) {
      console.error('Failed to delete demo:', error);
      setStaleDemoDeleteError('A network error occurred. Please check your connection and try again.');
    } finally {
      setDeletingDemoIds((previousIds) =>
        previousIds.filter((existingId) => existingId !== demo.id),
      );
    }
  }, []);

  return (
    <>
      {currentStaleDemos.length > 0 && (
        <div className="rounded-lg border border-status-warning-border bg-surface-card p-5 shadow-e1">
          <h2 className="mb-3 text-sm font-semibold text-content">
            Stale Demos
            <span className="ml-2 rounded-full bg-status-warning-subtle px-2 py-0.5 text-xs font-medium text-status-warning">
              {currentStaleDemos.length}
            </span>
          </h2>
          {staleDemoDeleteError && (
            <p className="mb-3 text-xs font-medium text-status-danger">{staleDemoDeleteError}</p>
          )}
          <div className="space-y-2">
            {currentStaleDemos.map((demo) => {
              const badge = staleBadge(demo.created_at);
              const typeLabel = COMMUNITY_TYPE_LABELS[demo.template_type]?.label ?? demo.template_type;
              const isDeleting = deletingDemoIds.includes(demo.id);
              return (
                <div
                  key={demo.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-edge-subtle bg-surface-page px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <span className="truncate text-sm font-medium text-content">{demo.prospect_name}</span>
                    <span className="ml-2 text-xs text-content-tertiary">{typeLabel}</span>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
                    {badge.label}
                  </span>
                  <button
                    type="button"
                    aria-label={`Delete demo for ${demo.prospect_name}`}
                    className="shrink-0 rounded p-1 text-content-disabled transition-colors hover:bg-status-danger-bg hover:text-status-danger disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isDeleting}
                    onClick={() => setConfirmDeleteDemo(demo)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {confirmDeleteDemo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-md rounded-lg bg-surface-card p-6 shadow-e3">
            <div className="flex items-start justify-between mb-3">
              <h3 className="text-base font-semibold text-content">Delete Demo</h3>
              <button
                type="button"
                onClick={() => setConfirmDeleteDemo(null)}
                className="rounded p-1 text-content-disabled hover:text-content-secondary"
              >
                <X size={16} />
              </button>
            </div>
            <p className="text-sm text-content-secondary mb-5">
              Delete the demo for <strong>{confirmDeleteDemo.prospect_name}</strong>? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteDemo(null)}
                className="rounded-md border border-edge-strong px-4 py-2 text-sm font-medium text-content-secondary hover:bg-surface-page transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void executeDeleteDemo(confirmDeleteDemo);
                  setConfirmDeleteDemo(null);
                }}
                className="rounded-md bg-status-danger px-4 py-2 text-sm font-medium text-content-inverse hover:opacity-90 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
