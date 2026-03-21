'use client';

/**
 * Mobile Search — full-screen search page for the mobile app.
 *
 * Uses the same feature registry and filtering logic as the desktop
 * command palette. Single-column layout with input at top and
 * results below.
 */
import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Clock, Search } from 'lucide-react';
import type { AnyCommunityRole, CommunityFeatures } from '@propertypro/shared';
import { ADMIN_ROLES } from '@propertypro/shared';
import { cn } from '@/lib/utils';
import { useRecentPages } from '@/hooks/useRecentPages';
import { useFilteredRegistry, type ResolvedRegistryItem } from '@/lib/constants/feature-registry';

// ---------------------------------------------------------------------------
// Suggested / Getting Started item IDs (mirrored from desktop palette)
// ---------------------------------------------------------------------------
const RESIDENT_SUGGESTIONS = ['page-documents', 'action-submit-maintenance', 'setting-notifications'] as const;
const ADMIN_SUGGESTIONS = ['action-upload-document', 'action-post-announcement', 'page-compliance'] as const;
const GETTING_STARTED_RESIDENT = ['page-documents', 'action-submit-maintenance', 'setting-notifications'] as const;
const GETTING_STARTED_ADMIN = ['action-upload-document', 'page-residents', 'action-schedule-meeting'] as const;
const RECENT_THRESHOLD = 3;

function isAdmin(role: AnyCommunityRole | null): boolean {
  if (!role) return false;
  return (ADMIN_ROLES as readonly string[]).includes(role);
}

function matchesQuery(item: ResolvedRegistryItem, query: string): boolean {
  const q = query.toLowerCase();
  if (item.label.toLowerCase().includes(q)) return true;
  return item.keywords.some((kw) => kw.toLowerCase().includes(q));
}

function pickItems(registry: ResolvedRegistryItem[], ids: readonly string[]): ResolvedRegistryItem[] {
  return ids
    .map((id) => registry.find((item) => item.id === id))
    .filter((item): item is ResolvedRegistryItem => item != null);
}

function categoryToBadge(category: 'page' | 'action' | 'setting'): string {
  const map = { page: 'Page', action: 'Action', setting: 'Setting' } as const;
  return map[category];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
interface MobileSearchContentProps {
  communityId: number;
  role: AnyCommunityRole;
  features: CommunityFeatures;
}

export function MobileSearchContent({ communityId, role, features }: MobileSearchContentProps) {
  const router = useRouter();
  const { recentPages, addPage } = useRecentPages();
  const registryItems = useFilteredRegistry(role, features, communityId);
  const [query, setQuery] = useState('');

  // Filtered results
  const filtered = useMemo(() => {
    if (!query.trim()) return [];
    return registryItems.filter((item) => matchesQuery(item, query.trim()));
  }, [registryItems, query]);

  // Group results
  const grouped = useMemo(() => {
    const groups = new Map<string, ResolvedRegistryItem[]>();
    for (const item of filtered) {
      const existing = groups.get(item.group);
      if (existing) {
        existing.push(item);
      } else {
        groups.set(item.group, [item]);
      }
    }
    return groups;
  }, [filtered]);

  // Empty-query state
  const admin = isAdmin(role);
  const hasEnoughRecent = recentPages.length >= RECENT_THRESHOLD;
  const suggestedItems = useMemo(
    () => pickItems(registryItems, admin ? ADMIN_SUGGESTIONS : RESIDENT_SUGGESTIONS),
    [registryItems, admin],
  );
  const gettingStartedItems = useMemo(
    () => pickItems(registryItems, admin ? GETTING_STARTED_ADMIN : GETTING_STARTED_RESIDENT),
    [registryItems, admin],
  );

  const handleSelect = useCallback(
    (href: string, label: string) => {
      addPage(href, label);
      router.push(href);
    },
    [router, addPage],
  );

  const hasQuery = query.trim().length > 0;
  const noResults = hasQuery && filtered.length === 0;
  const showRecent = !hasQuery && hasEnoughRecent;
  const showSuggested = !hasQuery && hasEnoughRecent && suggestedItems.length > 0;
  const showGettingStarted = !hasQuery && !hasEnoughRecent && gettingStartedItems.length > 0;

  return (
    <div className="flex min-h-screen flex-col bg-surface-page">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-edge-subtle bg-surface-card">
        <div className="flex items-center gap-2 px-4 py-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex size-10 items-center justify-center rounded-lg text-content-secondary transition-colors hover:bg-surface-muted"
            aria-label="Go back"
          >
            <ArrowLeft size={20} />
          </button>

          <div className="flex flex-1 items-center gap-2 rounded-xl bg-surface-muted px-3 py-2.5">
            <Search size={18} className="shrink-0 text-content-disabled" aria-hidden="true" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search pages, actions..."
              autoFocus
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-content-disabled"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="text-xs font-medium text-content-tertiary"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 px-4 py-3">
        {/* Search results */}
        {hasQuery && !noResults &&
          Array.from(grouped.entries()).map(([groupLabel, items]) => (
            <div key={groupLabel} className="mb-4">
              <h3 className="mb-1 px-1 text-xs font-medium text-content-tertiary">
                {groupLabel}
              </h3>
              {items.map((item) => (
                <MobileResultItem
                  key={item.id}
                  item={item}
                  onSelect={() => handleSelect(item.resolvedHref, item.label)}
                />
              ))}
            </div>
          ))}

        {/* No results */}
        {noResults && (
          <div className="px-4 py-12 text-center text-sm text-content-tertiary">
            No results found. Try different keywords.
          </div>
        )}

        {/* Recent pages */}
        {showRecent && (
          <div className="mb-4">
            <h3 className="mb-1 px-1 text-xs font-medium text-content-tertiary">Recent</h3>
            {recentPages.map((page) => (
              <button
                key={`recent-${page.path}`}
                type="button"
                onClick={() => handleSelect(page.path, page.label)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm text-content-secondary transition-colors active:bg-surface-muted"
              >
                <Clock size={16} className="shrink-0 text-content-disabled" aria-hidden="true" />
                <span className="truncate">{page.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Suggested */}
        {showSuggested && (
          <div className="mb-4">
            <h3 className="mb-1 px-1 text-xs font-medium text-content-tertiary">Suggested</h3>
            {suggestedItems.map((item) => (
              <MobileResultItem
                key={item.id}
                item={item}
                onSelect={() => handleSelect(item.resolvedHref, item.label)}
              />
            ))}
          </div>
        )}

        {/* Getting Started */}
        {showGettingStarted && (
          <div className="mb-4">
            <h3 className="mb-1 px-1 text-xs font-medium text-content-tertiary">
              Getting Started
            </h3>
            {gettingStartedItems.map((item) => (
              <MobileResultItem
                key={item.id}
                item={item}
                onSelect={() => handleSelect(item.resolvedHref, item.label)}
              />
            ))}
          </div>
        )}

        {/* Completely empty */}
        {!hasQuery && !showRecent && !showSuggested && !showGettingStarted && (
          <div className="px-4 py-12 text-center text-sm text-content-tertiary">
            Start typing to search pages, actions, and settings.
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile result item
// ---------------------------------------------------------------------------
interface MobileResultItemProps {
  item: ResolvedRegistryItem;
  onSelect: () => void;
}

function MobileResultItem({ item, onSelect }: MobileResultItemProps) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors active:bg-surface-muted"
    >
      <Icon size={18} className="shrink-0 text-content-disabled" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <span className="block text-sm text-content-secondary">{item.label}</span>
        <span className="block truncate text-xs text-content-tertiary">{item.description}</span>
      </div>
      <span className={cn(
        'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
        item.category === 'action' ? 'bg-interactive-primary/10 text-interactive-primary' :
        item.category === 'setting' ? 'bg-surface-muted text-content-tertiary' :
        'bg-surface-muted text-content-tertiary',
      )}>
        {categoryToBadge(item.category)}
      </span>
    </button>
  );
}
