'use client';

import { cn } from '@/lib/utils';

export interface CommandLoadingProps {
  groupLabel: string;
}

export function CommandLoading({ groupLabel }: CommandLoadingProps) {
  return (
    <div role="group" aria-label={groupLabel} aria-busy="true">
      <div className="px-2 py-1.5 text-xs font-medium text-content-tertiary">
        {groupLabel}
      </div>
      <div className="space-y-1 px-1">
        {Array.from({ length: 3 }, (_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5"
          >
            <div
              className={cn(
                'h-4 w-4 shrink-0 rounded bg-surface-muted animate-pulse',
              )}
            />
            <div className="flex flex-1 flex-col gap-1">
              <div
                className={cn(
                  'h-3.5 rounded bg-surface-muted animate-pulse',
                  i === 0 ? 'w-32' : i === 1 ? 'w-44' : 'w-28',
                )}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
