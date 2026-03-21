'use client';

import { forwardRef } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CommandInputProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  activeDescendant: string | undefined;
  resultsId: string;
  expanded: boolean;
}

export const CommandInput = forwardRef<HTMLInputElement, CommandInputProps>(
  function CommandInput({ value, onChange, onKeyDown, activeDescendant, resultsId, expanded }, ref) {
    return (
      <div className="flex items-center border-b border-edge-subtle px-4">
        <Search size={18} className="shrink-0 text-content-disabled" aria-hidden="true" />
        <input
          ref={ref}
          role="combobox"
          aria-expanded={expanded}
          aria-controls={resultsId}
          aria-activedescendant={activeDescendant}
          aria-autocomplete="list"
          aria-label="Search pages, actions, and settings"
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search pages, actions..."
          className={cn(
            'flex-1 border-0 bg-transparent px-3 py-4 text-sm outline-none',
            'placeholder:text-content-disabled text-content-primary',
          )}
        />
        <kbd
          className={cn(
            'hidden shrink-0 rounded-md border border-edge bg-surface-page',
            'px-2 py-0.5 text-[11px] font-medium text-content-disabled sm:inline-block',
          )}
        >
          ESC
        </kbd>
      </div>
    );
  },
);
