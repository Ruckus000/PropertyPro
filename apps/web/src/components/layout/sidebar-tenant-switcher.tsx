'use client';

/**
 * SidebarTenantSwitcher — community switcher that lives at the top of the
 * sidebar (Cloudflare account-switcher placement).
 *
 * - Users with 2+ communities get a popover with a flat list of their
 *   communities (+ an "all communities overview" link). A search box appears
 *   only when the list grows past SEARCH_THRESHOLD, so the common case (1–3
 *   communities) stays a plain list with no command-palette overhead.
 * - Users with a single community — and the PM portal (`staticOnly`) — get a
 *   static brand header instead of a switcher.
 *
 * Reuses `useUserCommunities` + `buildCommunityDashboardUrl` (no duplicated
 * fetch logic). The popover is portaled, so it styles with GLOBAL semantic
 * tokens (`--surface-card`, `--text-*`, `--border-*`), never `--nav-*`.
 */

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Building, ChevronsUpDown } from 'lucide-react';
import { useUserCommunities } from '@/hooks/use-user-communities';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

// The list (search, rows, avatars) loads when the popover first opens. The
// switcher ships with every authenticated page and the web app's total-JS
// ceiling (scripts/perf-check.ts) had under 1 KiB of headroom when community
// avatars were added, so only the trigger is first-load.
const SwitcherList = dynamic(
  () => import('./sidebar-tenant-switcher-list').then((m) => m.SwitcherList),
  { loading: () => null },
);

/**
 * Show the search box only once the list is long enough to warrant it.
 * Shared with CommunityPickerDialog so both community lists behave the same.
 */
export const SEARCH_THRESHOLD = 7;

interface SidebarTenantSwitcherProps {
  communityId: number | null;
  communityName: string | null;
  /** Sidebar expanded (label visible) vs collapsed (icon-only) rail state. */
  expanded: boolean;
  /** PM portal: always render the static brand header, never the switcher. */
  staticOnly?: boolean;
}

export function SidebarTenantSwitcher({
  communityId,
  communityName,
  expanded,
  staticOnly = false,
}: SidebarTenantSwitcherProps) {
  const [open, setOpen] = useState(false);
  const { data } = useUserCommunities();
  const communities = data ?? [];
  const canSwitch = !staticOnly && communities.length >= 2;
  const showSearch = communities.length > SEARCH_THRESHOLD;

  const brandMark = (
    <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[var(--interactive-primary)]">
      <Building size={20} color="white" aria-hidden="true" />
    </div>
  );

  const labelBlock = (
    <div
      className={cn(
        'flex min-w-0 flex-col overflow-hidden whitespace-nowrap text-left transition-opacity duration-quick',
        expanded ? 'opacity-100' : 'opacity-0',
      )}
    >
      <span className="text-base font-semibold text-[var(--text-primary)]">PropertyPro</span>
      {communityName && (
        <span className="truncate text-sm text-[var(--text-secondary)]">{communityName}</span>
      )}
    </div>
  );

  // Single-community users and the PM portal get a non-interactive brand header.
  // Reserving the same h-16 height in both branches prevents a layout shift when
  // the (client-fetched) community count resolves.
  if (!canSwitch) {
    return (
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-[var(--border-default)] px-3">
        {brandMark}
        {labelBlock}
      </div>
    );
  }

  return (
    <div className="h-16 shrink-0 border-b border-[var(--border-default)] px-2 py-2">
      <Popover
        open={open}
        onOpenChange={setOpen}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Switch community"
            className="flex h-12 w-full items-center gap-3 rounded-[10px] px-1.5 text-left transition-colors duration-150 hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--nav-surface)]"
          >
            {brandMark}
            {labelBlock}
            {expanded && (
              <ChevronsUpDown
                size={16}
                className="ml-auto shrink-0 text-[var(--text-tertiary)]"
                aria-hidden="true"
              />
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-0">
          <SwitcherList communities={communities} communityId={communityId} showSearch={showSearch} />
        </PopoverContent>
      </Popover>
    </div>
  );
}
