'use client';

import { useState } from 'react';
import { Building2, Columns2, LayoutGrid, Search, SlidersHorizontal, X } from 'lucide-react';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { BuildingOption } from './directory-model';

export type UnitsView = 'cards' | 'building' | 'split';

export interface StatusOption<T extends string> {
  value: T;
  label: string;
  count: number;
}

export interface FilterToken {
  key: string;
  label: string;
  onRemove: () => void;
}

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus';

const VIEWS: { value: UnitsView; label: string; icon: typeof LayoutGrid; className?: string }[] = [
  { value: 'cards', label: 'Cards', icon: LayoutGrid },
  { value: 'building', label: 'By building', icon: Building2 },
  // Split needs width; phones fall back to cards.
  { value: 'split', label: 'Split', icon: Columns2, className: 'hidden md:inline-flex' },
];

export function DirectoryToolbar<T extends string>({
  query,
  onQueryChange,
  placeholder,
  tokens,
  statusOptions,
  status,
  onStatusChange,
  buildings,
  building,
  onBuildingChange,
  onClearAll,
  resultsLabel,
  view,
  onViewChange,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  placeholder: string;
  tokens: FilterToken[];
  statusOptions: StatusOption<T>[];
  status: T;
  onStatusChange: (s: T) => void;
  buildings: BuildingOption[];
  building: string | null;
  onBuildingChange: (key: string | null) => void;
  onClearAll: () => void;
  resultsLabel: string;
  /** Units tab only. */
  view?: UnitsView;
  onViewChange?: (v: UnitsView) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div className="flex min-h-12 min-w-0 flex-1 flex-wrap md:min-w-72 items-center gap-1.5 rounded-sm border border-edge bg-surface-card py-1 pl-3 pr-1 text-content-tertiary focus-within:border-edge-focus md:min-h-10">
            <Search size={16} className="shrink-0" aria-hidden="true" />
            {tokens.map((t) => (
              <span
                key={t.key}
                className="inline-flex h-7 min-w-0 max-w-44 shrink items-center gap-1 rounded-full bg-interactive-subtle pl-2.5 pr-1 text-xs font-medium text-content-brand"
              >
                <span className="truncate" title={t.label}>
                  {t.label}
                </span>
                <button
                  type="button"
                  onClick={t.onRemove}
                  aria-label={`Remove filter ${t.label}`}
                  className={cn('flex h-6 w-6 items-center justify-center rounded-full hover:bg-surface-card', FOCUS)}
                >
                  <X size={12} strokeWidth={2.5} aria-hidden="true" />
                </button>
              </span>
            ))}
            <input
              type="search"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder={placeholder}
              aria-label={placeholder}
              // text-base (18px) avoids iOS zoom-on-focus.
              className="h-9 min-w-32 flex-1 border-0 bg-transparent text-base text-content outline-none placeholder:text-content-placeholder"
            />
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={tokens.length ? `Filters, ${tokens.length} active` : 'Filters'}
                className={cn(
                  'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium text-content hover:bg-surface-hover',
                  open && 'bg-surface-hover',
                  FOCUS,
                )}
              >
                <SlidersHorizontal size={15} aria-hidden="true" />
                <span className="hidden sm:inline">Filters</span>
                {tokens.length ? (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-interactive px-1.5 text-xs font-semibold text-content-inverse">
                    {tokens.length}
                  </span>
                ) : null}
              </button>
            </PopoverTrigger>
          </div>
        </PopoverAnchor>

        <PopoverContent
          align="start"
          sideOffset={6}
          aria-label="Filters"
          className="flex max-h-[60vh] w-[min(420px,calc(100vw-32px))] flex-col gap-4 overflow-y-auto md:max-h-[520px]"
        >
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-content-tertiary">Status</span>
            <div className="flex flex-wrap gap-1.5">
              {statusOptions.map((opt) => {
                const selected = status === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onStatusChange(opt.value)}
                    className={cn(
                      'inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-full border px-3 text-xs font-medium md:h-9',
                      selected
                        ? 'border-interactive bg-interactive-subtle text-content-brand'
                        : 'border-edge bg-surface-card text-content hover:bg-surface-hover',
                      FOCUS,
                    )}
                  >
                    {opt.label}
                    <span className="font-semibold tabular-nums">{opt.count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-1" role="radiogroup" aria-label="Building">
            <span className="pb-1 text-xs font-semibold uppercase tracking-wider text-content-tertiary">Building</span>
            {[{ key: null as string | null, label: 'All buildings', unitCount: buildings.reduce((n, b) => n + b.unitCount, 0) }, ...buildings].map(
              (b) => {
                const selected = building === b.key;
                return (
                  <button
                    key={b.key ?? 'all'}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => onBuildingChange(b.key)}
                    className={cn(
                      'flex min-h-10 items-center gap-2.5 rounded-sm px-2.5 text-left text-sm text-content hover:bg-surface-hover',
                      selected && 'bg-surface-hover',
                      FOCUS,
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
                        selected ? 'border-interactive' : 'border-edge-strong',
                      )}
                    >
                      {selected ? <span className="h-2 w-2 rounded-full bg-interactive" /> : null}
                    </span>
                    <span className="flex-1 font-medium">{b.label}</span>
                    <span className="text-xs text-content-tertiary">{b.unitCount}</span>
                  </button>
                );
              },
            )}
          </div>

          <div className="flex justify-between gap-2 border-t border-edge-subtle pt-3">
            <button
              type="button"
              onClick={onClearAll}
              className={cn('h-9 rounded-md px-2.5 text-xs font-medium text-content-secondary hover:bg-surface-hover', FOCUS)}
            >
              Clear all
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className={cn('h-9 rounded-md bg-interactive px-3.5 text-xs font-medium text-content-inverse hover:bg-interactive-hover', FOCUS)}
            >
              {resultsLabel}
            </button>
          </div>
        </PopoverContent>
      </Popover>

      {view && onViewChange ? (
        <div role="group" aria-label="Units view" className="flex h-12 shrink-0 items-center gap-0.5 rounded-md bg-surface-muted p-1 md:h-10">
          {VIEWS.map((v) => {
            const pressed = view === v.value;
            return (
              <button
                key={v.value}
                type="button"
                aria-pressed={pressed}
                aria-label={v.label}
                title={v.label}
                onClick={() => onViewChange(v.value)}
                className={cn(
                  'inline-flex h-full w-10 items-center justify-center rounded-sm',
                  pressed ? 'bg-surface-card text-content shadow-e1' : 'text-content-secondary hover:text-content',
                  v.className,
                  FOCUS,
                )}
              >
                <v.icon size={16} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
