'use client';

import { Maximize2 } from 'lucide-react';

interface PreviewPanelProps {
  publicHtml: string | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onExpand: () => void;
  /** When true, show placeholder instead of compiled preview */
  empty?: boolean;
  emptyMessage?: string;
}

export function PreviewPanel({
  publicHtml,
  loading,
  error,
  onRetry,
  onExpand,
  empty = false,
  emptyMessage = 'Enter a community name to see a preview',
}: PreviewPanelProps) {
  return (
    <div className="flex h-full flex-col">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] font-semibold uppercase text-[var(--text-secondary)]"
            style={{ letterSpacing: '0.5px' }}
          >
            Live Preview
          </span>
          {!loading && !error && !empty && publicHtml && (
            <span
              className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--status-success)]"
              aria-hidden="true"
            />
          )}
        </div>
        <button
          type="button"
          onClick={onExpand}
          className="flex h-6 w-6 items-center justify-center rounded-[6px] border border-[var(--border-default)] bg-[var(--surface-card)] transition-colors hover:bg-[var(--surface-muted)]"
          aria-label="Expand preview"
        >
          <Maximize2 className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
        </button>
      </div>

      {/* Content area */}
      <div className="relative flex-1 overflow-auto px-4 pb-4 flex flex-col">
        {/* Empty state */}
        {empty && (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100/50 px-8 py-10">
              <p className="text-center text-sm text-[var(--text-muted)]">
                {emptyMessage}
              </p>
            </div>
          </div>
        )}

        {/* Error state */}
        {!empty && error && (
          <div className="rounded-lg border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] p-4">
            <p className="text-sm text-[var(--text-primary)]">{error}</p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 text-sm text-[var(--interactive-primary)] underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading skeleton */}
        {!empty && !error && loading && !publicHtml && (
          <div className="space-y-4">
            <div className="h-[300px] animate-pulse rounded-lg bg-[var(--surface-muted)]" />
          </div>
        )}

        {/* Public website preview */}
        {!empty && !error && publicHtml && (
          <div className="relative flex flex-col h-full">
            {/* Loading shimmer overlay */}
            {loading && (
              <div className="pointer-events-none absolute inset-0 z-10 animate-pulse rounded-lg bg-[var(--surface-muted)] opacity-40" />
            )}

            {/* Label */}
            <div className="mb-1.5 flex items-center gap-1.5">
              <span
                className="text-[10px] font-medium uppercase text-[var(--text-secondary)]"
                style={{ letterSpacing: '0.5px' }}
              >
                Public Website
              </span>
              <span
                className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--status-success)]"
                aria-hidden="true"
              />
            </div>

            {/* Browser chrome */}
            <div className="flex flex-col flex-1 overflow-hidden rounded-lg border border-[var(--border-default)]">
              {/* macOS title bar */}
              <div className="flex items-center gap-1.5 bg-[var(--surface-muted)] px-3 py-2">
                {/* Decorative macOS dots */}
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: '#ff5f57' }}
                  aria-hidden="true"
                />
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: '#febc2e' }}
                  aria-hidden="true"
                />
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: '#28c840' }}
                  aria-hidden="true"
                />
              </div>

              {/* iframe — fills remaining height */}
              <iframe
                srcDoc={publicHtml}
                sandbox="allow-scripts allow-same-origin"
                title="Public website preview"
                className="flex-1"
                style={{
                  width: '100%',
                  border: 'none',
                  display: 'block',
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
