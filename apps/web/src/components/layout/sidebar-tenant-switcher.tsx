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

import { useMemo, useState } from 'react';
import { Building, ChevronsUpDown, Check } from 'lucide-react';
import { useUserCommunities } from '@/hooks/use-user-communities';
import { buildCommunityDashboardUrl } from '@/lib/utils/community-url';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/** Show the search box only once the list is long enough to warrant it. */
const SEARCH_THRESHOLD = 7;

interface SidebarTenantSwitcherProps {
  communityId: number | null;
  communityName: string | null;
  /** Sidebar expanded (label visible) vs collapsed (icon-only) rail state. */
  expanded: boolean;
  /** PM portal: always render the static brand header, never the switcher. */
  staticOnly?: boolean;
}

const itemClass =
  'flex items-center gap-2 rounded-[10px] px-2 py-2 text-sm text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)]';

export function SidebarTenantSwitcher({
  communityId,
  communityName,
  expanded,
  staticOnly = false,
}: SidebarTenantSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { data } = useUserCommunities();
  const communities = data ?? [];
  const canSwitch = !staticOnly && communities.length >= 2;
  const showSearch = communities.length > SEARCH_THRESHOLD;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return communities;
    return communities.filter((c) => c.name.toLowerCase().includes(q));
  }, [communities, query]);

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
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery('');
        }}
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
          {showSearch && (
            <div className="border-b border-[var(--border-default)] p-2">
              {/* eslint-disable-next-line jsx-a11y/no-autofocus -- focusing search on open is expected popover behavior */}
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search communities…"
                aria-label="Search communities"
                autoFocus
                className="h-9 w-full rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--surface-card)] px-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)]"
              />
            </div>
          )}
          <ul className="max-h-72 overflow-y-auto p-1.5">
            <li>
              <a href="/dashboard/overview" className={itemClass}>
                All communities overview
              </a>
            </li>
            {filtered.length > 0 && (
              <li className="my-1 border-t border-[var(--border-subtle)]" aria-hidden="true" />
            )}
            {filtered.length === 0 ? (
              <li>
                <p className="px-2 py-3 text-sm text-[var(--text-tertiary)]">
                  No communities found.
                </p>
              </li>
            ) : (
              filtered.map((c) => (
                <li key={c.id}>
                  <a href={buildCommunityDashboardUrl(c.slug)} className={itemClass}>
                    <span className="flex-1 truncate">{c.name}</span>
                    {c.id === communityId && (
                      <Check
                        size={16}
                        className="ml-2 shrink-0 text-[var(--interactive-primary)]"
                        aria-hidden="true"
                      />
                    )}
                  </a>
                </li>
              ))
            )}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
}
