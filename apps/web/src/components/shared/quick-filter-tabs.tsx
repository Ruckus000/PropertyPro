'use client';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface QuickFilterTab {
  label: string;
  value: string;
  count?: number;
}

interface QuickFilterTabsProps {
  tabs: QuickFilterTab[];
  active: string;
  onChange: (value: string) => void;
  className?: string;
}

export function QuickFilterTabs({
  tabs,
  active,
  onChange,
  className,
}: QuickFilterTabsProps) {
  return (
    <div className={cn('flex items-center gap-1', className)}>
      {tabs.map((tab) => {
        const isActive = tab.value === active;
        return (
          <button
            key={tab.value}
            type="button"
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors duration-quick',
              isActive
                ? 'bg-interactive text-content-inverse shadow-sm'
                : 'text-content-tertiary hover:bg-surface-hover hover:text-content'
            )}
            onClick={() => onChange(tab.value)}
          >
            {tab.label}
            {tab.count !== undefined && (
              <Badge
                variant={isActive ? 'secondary' : 'outline'}
                className="ml-0.5 h-5 min-w-[20px] justify-center px-1.5 text-[10px]"
              >
                {tab.count}
              </Badge>
            )}
          </button>
        );
      })}
    </div>
  );
}
