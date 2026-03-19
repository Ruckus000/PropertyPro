'use client';

import type { Column } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DataTableColumnHeaderProps<TData, TValue> {
  column: Column<TData, TValue>;
  title: string;
  className?: string;
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return <span className={className}>{title}</span>;
  }

  const sorted = column.getIsSorted();

  return (
    <button
      type="button"
      className={cn(
        '-ml-3 flex h-8 items-center gap-1 rounded-md px-3 text-xs font-medium hover:bg-accent hover:text-accent-foreground',
        className
      )}
      onClick={() => column.toggleSorting(sorted === 'asc')}
    >
      {title}
      {sorted === 'asc' ? (
        <ArrowUp className="h-4 w-4" />
      ) : sorted === 'desc' ? (
        <ArrowDown className="h-4 w-4" />
      ) : (
        <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
      )}
    </button>
  );
}
