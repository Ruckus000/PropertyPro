'use client';

import { useState, useEffect, useRef } from 'react';
import { Maximize2 } from 'lucide-react';
import { PhoneFrame } from '@propertypro/ui';
import { cn } from '@/lib/utils';

interface PreviewPanelProps {
  publicHtml: string | null;
  mobileHtml: string | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onExpand: () => void;
  /** Which preview to visually emphasize: 'public' | 'mobile' | 'both' */
  emphasis?: 'public' | 'mobile' | 'both';
  /** When true, show placeholder instead of compiled preview */
  empty?: boolean;
  emptyMessage?: string;
}

export function PreviewPanel({
  publicHtml,
  mobileHtml,
  loading,
  error,
  onRetry,
  onExpand,
  emphasis = 'both',
  empty = false,
  emptyMessage = 'Enter a community name to see a preview',
}: PreviewPanelProps) {
  const [mobileBlobUrl, setMobileBlobUrl] = useState<string | null>(null);
  const prevBlobRef = useRef<string | null>(null);

  // Manage blob URL for mobile preview
  useEffect(() => {
    if (!mobileHtml) {
      if (prevBlobRef.current) {
        URL.revokeObjectURL(prevBlobRef.current);
        prevBlobRef.current = null;
      }
      setMobileBlobUrl(null);
      return;
    }

    const blob = new Blob([mobileHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    setMobileBlobUrl(url);

    // Revoke previous blob URL
    if (prevBlobRef.current) {
      URL.revokeObjectURL(prevBlobRef.current);
    }
    prevBlobRef.current = url;

    return () => {
      URL.revokeObjectURL(url);
      prevBlobRef.current = null;
    };
  }, [mobileHtml]);

  const hasContent = publicHtml || mobileHtml;
  const showPublicLiveDot = emphasis === 'public' || emphasis === 'both';

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
          {!loading && !error && !empty && (
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
      <div className="relative flex-1 overflow-auto px-4 pb-4">
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

        {/* Loading overlay */}
        {!empty && !error && loading && !hasContent && (
          <div className="space-y-4">
            <div className="h-[300px] animate-pulse rounded-lg bg-[var(--surface-muted)]" />
            <div className="mx-auto h-[200px] w-[110px] animate-pulse rounded-[18px] bg-[var(--surface-muted)]" />
          </div>
        )}

        {/* Preview content */}
        {!empty && !error && hasContent && (
          <div className="relative space-y-4">
            {/* Loading shimmer overlay */}
            {loading && (
              <div className="pointer-events-none absolute inset-0 z-10 animate-pulse rounded-lg bg-[var(--surface-muted)] opacity-40" />
            )}

            {/* Public website preview */}
            {publicHtml && (
              <div
                className={cn(
                  'transition-opacity',
                  emphasis === 'mobile' && 'opacity-50',
                )}
              >
                {/* Label */}
                <div className="mb-1.5 flex items-center gap-1.5">
                  <span
                    className="text-[10px] font-medium uppercase text-[var(--text-secondary)]"
                    style={{ letterSpacing: '0.5px' }}
                  >
                    Public Website
                  </span>
                  {showPublicLiveDot && (
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--status-success)]"
                      aria-hidden="true"
                    />
                  )}
                </div>

                {/* Browser chrome */}
                <div className="overflow-hidden rounded-lg border border-[var(--border-default)]">
                  {/* macOS title bar */}
                  <div className="flex items-center gap-1.5 bg-[var(--surface-muted)] px-3 py-2">
                    {/* Decorative macOS dots — exempt from token requirement */}
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

                  {/* iframe */}
                  <iframe
                    srcDoc={publicHtml}
                    sandbox="allow-scripts allow-same-origin"
                    title="Public website preview"
                    style={{
                      height: 300,
                      width: '100%',
                      border: 'none',
                      display: 'block',
                    }}
                  />
                </div>
              </div>
            )}

            {/* Mobile preview */}
            {mobileBlobUrl && (
              <div>
                {/* Label */}
                <div className="mb-1.5 flex items-center gap-1.5">
                  <span
                    className="text-[10px] font-medium uppercase text-[var(--text-secondary)]"
                    style={{ letterSpacing: '0.5px' }}
                  >
                    Mobile App
                  </span>
                  {emphasis === 'mobile' && (
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--status-success)]"
                      aria-hidden="true"
                    />
                  )}
                </div>

                {/* Phone frame wrapper */}
                <div
                  className={cn(
                    'mx-auto w-[110px]',
                    emphasis === 'mobile' &&
                      'rounded-[18px] p-1 ring-2 ring-[var(--interactive-primary)]',
                  )}
                >
                  <div
                    style={{
                      transform: `scale(${110 / 430})`,
                      transformOrigin: 'top left',
                      width: 430,
                      height: 932,
                    }}
                  >
                    <PhoneFrame src={mobileBlobUrl} loading="eager" />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
