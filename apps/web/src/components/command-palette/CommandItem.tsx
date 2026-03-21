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
  Page: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  Action: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  Setting: 'bg-gray-50 text-gray-600 dark:bg-gray-900 dark:text-gray-400',
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
            'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium leading-tight',
            BADGE_STYLES[badge] ?? 'bg-gray-50 text-gray-600',
          )}
        >
          {badge}
        </span>
      )}
    </div>
  );
}
