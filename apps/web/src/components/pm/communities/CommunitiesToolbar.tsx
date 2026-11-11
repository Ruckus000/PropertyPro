'use client';

/**
 * The Communities toolbar. The page paints no title (PageHeader's h1 is
 * sr-only), so this leads with the count.
 *
 * What it carries grows with the portfolio:
 *   chooser (1–2)  count, Reports/Templates, view switch, Add Community
 *   gallery (3–8)  + saved views (their own row), Type, Sort (cards view)
 *   grouped/dense  + search
 *
 * On a phone the count and the buttons share the first row and everything
 * else stacks below (`order-last`), full width.
 */
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QuickFilterTabs } from '@/components/shared/quick-filter-tabs';
import { cn } from '@/lib/utils';
import type { CommunityType } from '@propertypro/shared';
import type { PortfolioView } from '@/lib/pm/portfolio-summary-keys';
import { communityCountLabel, type CommunitiesTier } from '@/lib/pm/communities-page';
import { PortfolioTools } from '../PortfolioTools';
import { ViewToggle, type ViewMode } from '../ViewToggle';
import type { CommunitySort } from './CommunityTable';

const TYPE_OPTIONS: { value: '' | CommunityType; label: string }[] = [
  { value: '', label: 'Type: All' },
  { value: 'condo_718', label: 'Type: Condo' },
  { value: 'hoa_720', label: 'Type: HOA' },
  { value: 'apartment', label: 'Type: Apartment' },
];

/** The gallery's sort menu; the dense table sorts from its headers. */
export const SORT_OPTIONS: { id: string; label: string; sort: CommunitySort }[] = [
  { id: 'attention', label: 'Sort: Attention', sort: { key: 'status', dir: 'asc' } },
  { id: 'name', label: 'Sort: Name', sort: { key: 'communityName', dir: 'asc' } },
  { id: 'units', label: 'Sort: Most units', sort: { key: 'totalUnits', dir: 'desc' } },
  { id: 'requests', label: 'Sort: Most requests', sort: { key: 'openMaintenanceRequests', dir: 'desc' } },
];

const SELECT =
  'h-11 w-full appearance-none rounded-md border border-edge-strong bg-surface-card pl-3 pr-8 text-sm font-medium text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus md:h-8 md:w-auto';

function SelectBox({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={SELECT}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-content-tertiary"
      />
    </div>
  );
}

/**
 * Search that waits for a pause in typing before it changes the URL, and that
 * a change from outside (Clear search) can reset without eating keystrokes
 * typed while a request was in flight. "/" focuses it.
 */
function SearchBox({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  const [text, setText] = useState(value);
  const sent = useRef(value);
  const input = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (value !== sent.current) {
      sent.current = value;
      setText(value);
    }
  }, [value]);

  useEffect(() => {
    const next = text.trim();
    if (next === sent.current) return;
    const timer = window.setTimeout(() => {
      sent.current = next;
      onChangeRef.current(next);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [text]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      input.current?.focus();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={cn('relative', className)}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-content-tertiary"
      />
      <input
        ref={input}
        type="search"
        aria-label="Search communities"
        placeholder="Search communities"
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="h-11 w-full rounded-md border border-edge-strong bg-surface-card pl-9 pr-9 text-sm text-content placeholder:text-content-placeholder focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus md:h-8"
      />
      <kbd
        aria-hidden="true"
        className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-xs border border-edge px-1.5 font-mono text-xs text-content-tertiary md:block"
      >
        /
      </kbd>
    </div>
  );
}

interface CommunitiesToolbarProps {
  tier: CommunitiesTier;
  portfolioCount: number;
  /** Units across the portfolio, shown beside the count in the gallery. */
  totalUnits: number | null;
  viewCounts: { all: number; needsAttention: number; overdueDues: number };
  view: PortfolioView | null;
  onViewChange: (view: PortfolioView | null) => void;
  search: string;
  onSearchChange: (search: string) => void;
  communityType: CommunityType | null;
  onTypeChange: (type: CommunityType | null) => void;
  sortId: string | null;
  onSortChange: (sort: CommunitySort) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  showTemplates: boolean;
  onSelectCommunities: () => void;
  onAdd: () => void;
  addDisabled: boolean;
}

export function CommunitiesToolbar({
  tier,
  portfolioCount,
  totalUnits,
  viewCounts,
  view,
  onViewChange,
  search,
  onSearchChange,
  communityType,
  onTypeChange,
  sortId,
  onSortChange,
  viewMode,
  onViewModeChange,
  showTemplates,
  onSelectCommunities,
  onAdd,
  addDisabled,
}: CommunitiesToolbarProps) {
  const chooser = tier === 'chooser';
  const wide = tier === 'grouped' || tier === 'dense';
  const showSort = !chooser && viewMode === 'cards';

  const tabs = [
    { value: 'all', label: 'All', count: viewCounts.all },
    { value: 'needs_attention', label: 'Needs attention', count: viewCounts.needsAttention },
    ...(viewCounts.overdueDues > 0 || view === 'overdue_dues'
      ? [{ value: 'overdue_dues', label: 'Has overdue dues', count: viewCounts.overdueDues }]
      : []),
  ];

  const [count, noun] = (() => {
    const label = communityCountLabel(portfolioCount);
    const i = label.indexOf(' ');
    return [label.slice(0, i), label.slice(i + 1)];
  })();

  const viewTabs = (
    <QuickFilterTabs
      tabs={tabs}
      active={view ?? 'all'}
      onChange={(v) => onViewChange(v === 'all' ? null : (v as PortfolioView))}
      className="w-full rounded-md bg-surface-muted p-1 md:w-fit"
    />
  );

  return (
    <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-3">
      <p className="flex-1 text-sm text-content-secondary md:flex-none md:text-base">
        <span className="font-semibold text-content">{count}</span> {noun}
        {tier === 'gallery' && totalUnits !== null && (
          <span className="hidden md:inline"> · {totalUnits.toLocaleString('en-US')} units</span>
        )}
      </p>

      {wide && <SearchBox value={search} onChange={onSearchChange} className="order-last w-full md:order-none md:w-72" />}

      <div className="hidden md:block md:flex-1" />

      {!chooser && (
        <div className={cn('order-last grid w-full gap-2 md:order-none md:flex md:w-auto', showSort ? 'grid-cols-2' : 'grid-cols-1')}>
          <SelectBox
            label="Community type"
            value={communityType ?? ''}
            onChange={(v) => onTypeChange(v ? (v as CommunityType) : null)}
            options={TYPE_OPTIONS}
          />
          {showSort && (
            <SelectBox
              label="Sort communities"
              value={sortId ?? 'attention'}
              onChange={(id) => {
                const option = SORT_OPTIONS.find((o) => o.id === id);
                if (option) onSortChange(option.sort);
              }}
              options={SORT_OPTIONS.map((o) => ({ value: o.id, label: o.label }))}
            />
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <PortfolioTools showTemplates={showTemplates} onSelectCommunities={onSelectCommunities} />
        <span aria-hidden="true" className="mx-1 hidden h-5 w-px bg-edge md:block" />
        <ViewToggle value={viewMode} onChange={onViewModeChange} />
        <Button
          variant={chooser ? 'outline' : 'default'}
          onClick={onAdd}
          disabled={addDisabled}
          aria-label="Add Community"
          className="w-11 px-0 md:w-auto md:px-3"
        >
          <Plus aria-hidden="true" />
          <span className="hidden md:inline">Add Community</span>
        </Button>
      </div>
    </div>
    {!chooser && viewTabs}
    </div>
  );
}
