/**
 * PM Community Switcher — P3-46
 *
 * Searchable dropdown that lists all managed communities ordered by:
 * 1. Recent communities first (from localStorage via useSelectedCommunity)
 * 2. Remaining communities alphabetically
 *
 * Selecting a community navigates to /pm/dashboard/[community_id] and
 * updates recency storage.
 */
'use client';

import { useRouter } from 'next/navigation';
import { useId, useMemo, useRef, useState } from 'react';
import { useSelectedCommunity } from '@/hooks/useSelectedCommunity';
import type { PmCommunityPortfolioCard } from '@/lib/api/pm-communities';

interface CommunitySwitcherProps {
  communities: PmCommunityPortfolioCard[];
  currentCommunityId?: number;
}

export function CommunitySwitcher({ communities, currentCommunityId }: CommunitySwitcherProps) {
  const router = useRouter();
  const { recentCommunityIds, selectCommunity } = useSelectedCommunity();
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const sorted = useMemo(() => {
    const recentSet = new Set(recentCommunityIds);
    const recent = recentCommunityIds
      .map((id) => communities.find((c) => c.communityId === id))
      .filter((c): c is PmCommunityPortfolioCard => c !== undefined);
    const rest = communities
      .filter((c) => !recentSet.has(c.communityId))
      .sort((a, b) => a.communityName.localeCompare(b.communityName));
    return [...recent, ...rest];
  }, [communities, recentCommunityIds]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(
      (c) =>
        c.communityName.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q),
    );
  }, [sorted, search]);

  const currentCommunity = communities.find((c) => c.communityId === currentCommunityId);

  function handleSelect(community: PmCommunityPortfolioCard) {
    selectCommunity(community.communityId);
    setIsOpen(false);
    setSearch('');
    router.push(`/pm/dashboard/${community.communityId}`);
  }

  function handleButtonClick() {
    setIsOpen((prev) => !prev);
    if (!isOpen) {
      // Focus search input when opening
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        onClick={handleButtonClick}
        className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <span className="truncate max-w-[200px]">
          {currentCommunity ? currentCommunity.communityName : 'Switch Community'}
        </span>
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute left-0 z-50 mt-1 w-72 rounded-md border border-gray-200 bg-white shadow-lg">
          <div className="p-2 border-b border-gray-100">
            <input
              ref={inputRef}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search communities..."
              aria-label="Search communities"
              className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>

          <ul
            id={listboxId}
            role="listbox"
            aria-label="Managed communities"
            className="max-h-64 overflow-y-auto py-1"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-400">No communities found</li>
            ) : (
              filtered.map((community, index) => {
                const isRecent = recentCommunityIds.includes(community.communityId);
                const showRecentDivider = index === 0 && isRecent;
                const showRestDivider =
                  index > 0 &&
                  !isRecent &&
                  recentCommunityIds.includes(filtered[index - 1]?.communityId ?? -1);

                return (
                  <li key={community.communityId}>
                    {showRecentDivider && (
                      <p className="px-3 pt-1 pb-0.5 text-xs font-medium uppercase tracking-wide text-gray-400">
                        Recent
                      </p>
                    )}
                    {showRestDivider && recentCommunityIds.length > 0 && (
                      <div className="my-1 border-t border-gray-100" />
                    )}
                    <button
                      type="button"
                      role="option"
                      aria-selected={community.communityId === currentCommunityId}
                      onClick={() => handleSelect(community)}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-blue-50 focus:bg-blue-50 focus:outline-none ${
                        community.communityId === currentCommunityId
                          ? 'bg-blue-50 font-medium text-blue-700'
                          : 'text-gray-700'
                      }`}
                    >
                      {community.communityName}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
