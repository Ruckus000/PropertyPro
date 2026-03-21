'use client';

import { cn } from '@/lib/utils';

export interface CommandGroupProps {
  label: string;
  children: React.ReactNode;
}

export function CommandGroup({ label, children }: CommandGroupProps) {
  return (
    <div role="group" aria-label={label}>
      <div
        className={cn(
          'px-2 py-1.5 text-xs font-medium text-content-tertiary',
          'select-none',
        )}
      >
        {label}
      </div>
      {children}
    </div>
  );
}
