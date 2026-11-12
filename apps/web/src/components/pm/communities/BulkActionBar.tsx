'use client';

/**
 * The bar that appears while communities are selected in list view: how many,
 * the two bulk sends, and a way out. It floats over the page bottom so it
 * stays in reach while the list scrolls.
 */
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BulkActionBarProps {
  count: number;
  onAnnouncement: () => void;
  onDocuments: () => void;
  onClear: () => void;
}

const ACTION =
  'inline-flex min-h-11 items-center rounded-md border border-white/20 px-3 text-sm font-medium transition-colors duration-quick hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus md:min-h-8';

export function BulkActionBar({ count, onAnnouncement, onDocuments, onClear }: BulkActionBarProps) {
  if (count === 0) return null;
  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className={cn(
        'fixed inset-x-4 bottom-4 z-40 flex flex-wrap items-center gap-2 rounded-lg bg-surface-inverse p-2 pl-4 text-content-inverse shadow-lg',
        'md:inset-x-auto md:left-1/2 md:-translate-x-1/2',
      )}
    >
      <p className="mr-auto text-sm font-semibold md:mr-2">{count} selected</p>
      <button type="button" onClick={onAnnouncement} className={ACTION}>
        Send announcement
      </button>
      <button type="button" onClick={onDocuments} className={ACTION}>
        Upload documents
      </button>
      <button
        type="button"
        onClick={onClear}
        aria-label="Clear selection"
        className="inline-flex size-11 items-center justify-center rounded-md transition-colors duration-quick hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus md:size-8"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
