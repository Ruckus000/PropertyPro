'use client';

import { useState, useCallback } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReportFilterValues {
  communityIds: number[];
  datePreset: string;
  dateFrom: string;
  dateTo: string;
}

interface Community {
  communityId: number;
  communityName: string;
}

interface ReportFiltersProps {
  communities: Community[];
}

// ---------------------------------------------------------------------------
// Date presets
// ---------------------------------------------------------------------------

const DATE_PRESETS = [
  { label: 'Last 30 days', value: '30d' },
  { label: 'Last 90 days', value: '90d' },
  { label: 'Last 6 months', value: '6m' },
  { label: 'Last 12 months', value: '12m' },
] as const;

function getDateRange(preset: string): { from: string; to: string } {
  const to = new Date();
  const from = new Date();

  switch (preset) {
    case '30d':
      from.setDate(from.getDate() - 30);
      break;
    case '90d':
      from.setDate(from.getDate() - 90);
      break;
    case '6m':
      from.setMonth(from.getMonth() - 6);
      break;
    case '12m':
      from.setFullYear(from.getFullYear() - 1);
      break;
    default:
      from.setDate(from.getDate() - 30);
  }

  return {
    from: from.toISOString().split('T')[0]!,
    to: to.toISOString().split('T')[0]!,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReportFilters({ communities }: ReportFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Local state (not applied until "Apply" is clicked)
  const [selectedCommunities, setSelectedCommunities] = useState<Set<number>>(() => {
    const raw = searchParams.get('communityIds');
    if (!raw) return new Set<number>();
    return new Set(
      raw
        .split(',')
        .map(Number)
        .filter((n) => !isNaN(n) && n > 0),
    );
  });

  const [datePreset, setDatePreset] = useState<string>(
    searchParams.get('datePreset') ?? '30d',
  );

  const handleToggleCommunity = useCallback((id: number) => {
    setSelectedCommunities((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleApply = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());

    // Community IDs
    if (selectedCommunities.size > 0) {
      params.set('communityIds', Array.from(selectedCommunities).join(','));
    } else {
      params.delete('communityIds');
    }

    // Date range
    const { from, to } = getDateRange(datePreset);
    params.set('datePreset', datePreset);
    params.set('dateFrom', from);
    params.set('dateTo', to);

    router.push(`${pathname}?${params.toString()}`);
  }, [router, pathname, searchParams, selectedCommunities, datePreset]);

  const selectedLabel =
    selectedCommunities.size === 0
      ? 'All Communities'
      : `${selectedCommunities.size} selected`;

  const presetLabel =
    DATE_PRESETS.find((p) => p.value === datePreset)?.label ?? 'Last 30 days';

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Community multi-select */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1">
            {selectedLabel}
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
          {communities.map((c) => (
            <DropdownMenuCheckboxItem
              key={c.communityId}
              checked={selectedCommunities.has(c.communityId)}
              onCheckedChange={() => handleToggleCommunity(c.communityId)}
            >
              {c.communityName}
            </DropdownMenuCheckboxItem>
          ))}
          {communities.length === 0 && (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">
              No communities available
            </p>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Date range preset */}
      <select
        value={datePreset}
        onChange={(e) => setDatePreset(e.target.value)}
        className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
        aria-label="Date range"
      >
        {DATE_PRESETS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>

      {/* Apply button */}
      <Button size="sm" onClick={handleApply}>
        Apply
      </Button>
    </div>
  );
}

/**
 * Parse current URL search params into report filter values.
 */
export function parseReportFilters(
  searchParams: URLSearchParams,
): { communityIds?: number[]; dateFrom?: string; dateTo?: string } {
  const rawIds = searchParams.get('communityIds');
  const communityIds = rawIds
    ? rawIds
        .split(',')
        .map(Number)
        .filter((n) => !isNaN(n) && n > 0)
    : undefined;

  const datePreset = searchParams.get('datePreset') ?? '30d';
  const { from, to } = getDateRange(datePreset);

  return {
    communityIds: communityIds?.length ? communityIds : undefined,
    dateFrom: searchParams.get('dateFrom') ?? from,
    dateTo: searchParams.get('dateTo') ?? to,
  };
}
