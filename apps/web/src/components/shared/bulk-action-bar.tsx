'use client';

import { type LucideIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BulkAction {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'default' | 'destructive';
}

interface BulkActionBarProps {
  selectedCount: number;
  actions: BulkAction[];
  onClear: () => void;
}

function BulkActionBar({ selectedCount, actions, onClear }: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div
      className={cn(
        'fixed inset-x-0 bottom-0 z-50 border-t border-edge bg-surface-card shadow-lg',
        'animate-in slide-in-from-bottom-full duration-quick',
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <p className="text-sm font-medium">
          <span className="font-bold">{selectedCount}</span> selected
        </p>

        <div className="flex items-center gap-2">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                type="button"
                onClick={action.onClick}
                disabled={action.disabled}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-quick',
                  'disabled:pointer-events-none disabled:opacity-50',
                  action.variant === 'destructive'
                    ? 'bg-status-danger text-content-inverse hover:bg-status-danger/90'
                    : 'bg-interactive text-content-inverse hover:bg-interactive-hover',
                )}
              >
                {Icon && <Icon className="h-4 w-4" />}
                {action.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium text-content-tertiary transition-colors duration-quick hover:bg-surface-muted"
        >
          <X className="h-4 w-4" />
          Clear
        </button>
      </div>
    </div>
  );
}

export { BulkActionBar, type BulkActionBarProps, type BulkAction };
