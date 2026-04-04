'use client';

import { LayoutGrid, List } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ViewMode = 'cards' | 'list';

const STORAGE_KEY = 'propertypro.pm.viewMode';

export function getStoredViewMode(): ViewMode {
  if (typeof window === 'undefined') return 'cards';
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'list' ? 'list' : 'cards';
}

export function storeViewMode(mode: ViewMode): void {
  localStorage.setItem(STORAGE_KEY, mode);
}

interface ViewToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export function ViewToggle({ value, onChange }: ViewToggleProps) {
  return (
    <div className="flex rounded-md border border-edge bg-surface-muted" role="radiogroup" aria-label="View mode">
      <button
        type="button"
        role="radio"
        aria-checked={value === 'cards'}
        aria-label="Card view"
        onClick={() => onChange('cards')}
        className={cn(
          'inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors',
          value === 'cards'
            ? 'bg-surface-card text-content shadow-e0'
            : 'text-content-tertiary hover:text-content-secondary',
        )}
      >
        <LayoutGrid className="h-4 w-4" />
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={value === 'list'}
        aria-label="List view"
        onClick={() => onChange('list')}
        className={cn(
          'inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors',
          value === 'list'
            ? 'bg-surface-card text-content shadow-e0'
            : 'text-content-tertiary hover:text-content-secondary',
        )}
      >
        <List className="h-4 w-4" />
      </button>
    </div>
  );
}
