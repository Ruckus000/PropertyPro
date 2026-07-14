'use client';

import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CommandItemProps {
  id: string;
  icon: LucideIcon;
  label: string;
  description?: string;
  badge?: 'Page' | 'Action' | 'Setting';
  isActive: boolean;
  onSelect: () => void;
  onMouseEnter: () => void;
}

const BADGE_STYLES: Record<string, string> = {
  Page: 'bg-status-info-subtle text-status-info dark:bg-blue-950 dark:text-blue-300',
  Action: 'bg-status-warning-subtle text-status-warning dark:bg-amber-950 dark:text-amber-300',
  Setting: 'bg-surface-muted text-content-secondary dark:bg-gray-900 dark:text-gray-400',
};

export function CommandItem({
  id,
  icon: Icon,
  label,
  description,
  badge,
  isActive,
  onSelect,
  onMouseEnter,
}: CommandItemProps) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={isActive}
      onClick={onSelect}
      onMouseEnter={onMouseEnter}
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm',
        'text-content-secondary transition-colors',
        isActive && 'bg-surface-muted',
      )}
    >
      <Icon size={16} className="shrink-0 text-content-disabled" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{label}</span>
        {description && (
          <span className="truncate text-xs text-content-tertiary">{description}</span>
        )}
      </div>
      {badge && (
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium leading-tight',
            BADGE_STYLES[badge] ?? 'bg-surface-muted text-content-secondary',
          )}
        >
          {badge}
        </span>
      )}
    </div>
  );
}
