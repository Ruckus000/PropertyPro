'use client';

/**
 * Cards or list on the Communities page. The size of the portfolio picks the
 * default (cards up to 8 communities, a list from 9); once someone picks one
 * here, that choice is remembered on this device and wins.
 */
import { LayoutGrid, List } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ViewMode = 'cards' | 'list';

const STORAGE_KEY = 'propertypro.pm.viewMode';

/** The remembered choice, or null when there is none (or storage is blocked). */
export function getStoredViewMode(): ViewMode | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'list' || stored === 'cards' ? stored : null;
  } catch {
    return null;
  }
}

export function storeViewMode(mode: ViewMode): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // A private window can refuse storage; the choice then lasts this visit.
  }
}

interface ViewToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

const OPTION =
  'inline-flex size-11 items-center justify-center rounded-md transition-colors duration-quick focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus md:size-8';

export function ViewToggle({ value, onChange }: ViewToggleProps) {
  return (
    <div className="flex rounded-md border border-edge bg-surface-muted" role="radiogroup" aria-label="View">
      {(
        [
          { mode: 'cards', label: 'Card view', Icon: LayoutGrid },
          { mode: 'list', label: 'List view', Icon: List },
        ] as const
      ).map(({ mode, label, Icon }) => (
        <button
          key={mode}
          type="button"
          role="radio"
          aria-checked={value === mode}
          aria-label={label}
          onClick={() => onChange(mode)}
          className={cn(
            OPTION,
            value === mode ? 'bg-surface-card text-content' : 'text-content-tertiary hover:text-content',
          )}
        >
          <Icon aria-hidden="true" className="size-4" />
        </button>
      ))}
    </div>
  );
}
