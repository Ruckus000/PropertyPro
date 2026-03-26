'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface PreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  publicHtml: string | null;
}

export function PreviewModal({
  isOpen,
  onClose,
  publicHtml,
}: PreviewModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Body scroll lock
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal container */}
      <div className="fixed inset-4 z-50 flex items-center justify-center">
        <div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-label="Public site preview"
          className="max-w-[960px] w-full max-h-[90vh] rounded-[16px] bg-[var(--surface-card)] shadow-[var(--elevation-e3,0_25px_50px_-12px_rgb(0_0_0/0.25))] overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-default)]">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Public Site Preview
            </h2>

            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              aria-label="Close preview"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-4">
            {/* Browser chrome */}
            <div className="rounded-lg border border-[var(--border-default)] overflow-hidden">
              {/* Title bar with macOS dots */}
              <div className="flex items-center gap-2 px-4 py-3 bg-[var(--surface-muted)] border-b border-[var(--border-default)]">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ background: '#ff5f57' }}
                  aria-hidden="true"
                />
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ background: '#febc2e' }}
                  aria-hidden="true"
                />
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ background: '#28c840' }}
                  aria-hidden="true"
                />
              </div>
              {publicHtml ? (
                <iframe
                  srcDoc={publicHtml}
                  title="Public site preview"
                  style={{
                    height: '70vh',
                    width: '100%',
                    border: 'none',
                  }}
                  sandbox="allow-same-origin allow-scripts"
                />
              ) : (
                <div
                  className="flex items-center justify-center text-[var(--text-secondary)] text-sm"
                  style={{ height: '70vh' }}
                >
                  No public site preview available
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
