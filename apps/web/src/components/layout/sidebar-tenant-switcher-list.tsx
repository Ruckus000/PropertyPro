'use client';

/**
 * The sidebar switcher's popover body: search (past SEARCH_THRESHOLD), the
 * overview link and one row per community with its avatar. Split out of
 * `sidebar-tenant-switcher.tsx` so it loads only when the popover opens. It
 * unmounts on close, which is also what clears the search box.
 */

import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import type { UserCommunityItem } from '@/app/api/v1/me/communities/contract';
import { buildCommunityDashboardUrl } from '@/lib/utils/community-url';
import { CommunityAvatar } from './community-avatar';

const itemClass =
  'flex items-center gap-2 rounded-[10px] px-2 py-2 text-sm text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)]';

export function SwitcherList({
  communities,
  communityId,
  showSearch,
}: {
  communities: UserCommunityItem[];
  communityId: number | null;
  showSearch: boolean;
}) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return communities;
    return communities.filter((c) => c.name.toLowerCase().includes(q));
  }, [communities, query]);

  return (
    <>
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
                    <CommunityAvatar name={c.name} logoUrl={c.logoUrl} />
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
    </>
  );
}
