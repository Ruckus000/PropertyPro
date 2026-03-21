'use client';

/**
 * Command Palette V2 — Custom implementation using Radix Dialog + custom listbox.
 *
 * Replaces the cmdk-based palette with full keyboard navigation,
 * ARIA combobox pattern, and role-aware empty/suggested states.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import { Clock } from 'lucide-react';
import type { AnyCommunityRole, CommunityFeatures } from '@propertypro/shared';
import { ADMIN_ROLES } from '@propertypro/shared';
import { cn } from '@/lib/utils';
import { useRecentPages } from '@/hooks/useRecentPages';
import { useFilteredRegistry, type ResolvedRegistryItem } from '@/lib/constants/feature-registry';
import { CommandInput } from './CommandInput';
import { CommandGroup } from './CommandGroup';
import { CommandItem } from './CommandItem';
import { CommandEmpty } from './CommandEmpty';

// ---------------------------------------------------------------------------
// Suggested / Getting Started item IDs
// ---------------------------------------------------------------------------
const RESIDENT_SUGGESTIONS = [
  'page-documents',
  'action-submit-maintenance',
  'setting-notifications',
] as const;

const ADMIN_SUGGESTIONS = [
  'action-upload-document',
  'action-post-announcement',
  'page-compliance',
] as const;

const GETTING_STARTED_RESIDENT = [
  'page-documents',
  'action-submit-maintenance',
  'setting-notifications',
] as const;

const GETTING_STARTED_ADMIN = [
  'action-upload-document',
  'page-residents',
  'action-schedule-meeting',
] as const;

// Minimum recent pages before showing "Recent + Suggested" vs "Getting Started"
const RECENT_THRESHOLD = 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const RESULTS_ID = 'command-palette-results';

function isAdmin(role: AnyCommunityRole | null): boolean {
  if (!role) return false;
  return (ADMIN_ROLES as readonly string[]).includes(role);
}

function matchesQuery(item: ResolvedRegistryItem, query: string): boolean {
  const q = query.toLowerCase();
  if (item.label.toLowerCase().includes(q)) return true;
  return item.keywords.some((kw) => kw.toLowerCase().includes(q));
}

function categoryToBadge(category: 'page' | 'action' | 'setting'): 'Page' | 'Action' | 'Setting' {
  const map = { page: 'Page', action: 'Action', setting: 'Setting' } as const;
  return map[category];
}

function pickItems(
  registry: ResolvedRegistryItem[],
  ids: readonly string[],
): ResolvedRegistryItem[] {
  return ids
    .map((id) => registry.find((item) => item.id === id))
    .filter((item): item is ResolvedRegistryItem => item != null);
}

// ---------------------------------------------------------------------------
// Flattened item for keyboard navigation
// ---------------------------------------------------------------------------
interface FlatItem {
  registryItem: ResolvedRegistryItem;
  domId: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  communityId: number | null;
  role: AnyCommunityRole | null;
  features: CommunityFeatures | null;
}

export function CommandPalette({
  open,
  onOpenChange,
  communityId,
  role,
  features,
}: CommandPaletteProps) {
  const registryItems = useFilteredRegistry(role, features, communityId);
  const router = useRouter();
  const { recentPages, addPage } = useRecentPages();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // -----------------------------------------------------------------------
  // Filtered + grouped items
  // -----------------------------------------------------------------------
  const filtered = useMemo(() => {
    if (!query.trim()) return [];
    return registryItems.filter((item) => matchesQuery(item, query.trim()));
  }, [registryItems, query]);

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

  // -----------------------------------------------------------------------
  // Empty-query state sections
  // -----------------------------------------------------------------------
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

  // -----------------------------------------------------------------------
  // Flat list for keyboard navigation
  // -----------------------------------------------------------------------
  const flatItems = useMemo<FlatItem[]>(() => {
    if (query.trim()) {
      // Active search results
      const items: FlatItem[] = [];
      for (const [, groupItems] of grouped) {
        for (const item of groupItems) {
          items.push({
            registryItem: item,
            domId: `cmd-item-${item.id}`,
          });
        }
      }
      return items;
    }

    // Empty-query state
    const items: FlatItem[] = [];

    // Recent pages are not registry items, so they're handled separately
    // in the rendering, but we skip them for flatItems because they use
    // a different data shape. We'll prepend placeholders for them.

    if (hasEnoughRecent) {
      // Suggested items
      for (const item of suggestedItems) {
        items.push({
          registryItem: item,
          domId: `cmd-item-${item.id}`,
        });
      }
    } else {
      // Getting started items
      for (const item of gettingStartedItems) {
        items.push({
          registryItem: item,
          domId: `cmd-item-${item.id}`,
        });
      }
    }

    return items;
  }, [query, grouped, hasEnoughRecent, suggestedItems, gettingStartedItems]);

  // Total navigable items = recent pages (when no query) + flatItems
  const recentCount = !query.trim() && hasEnoughRecent ? recentPages.length : 0;
  const totalItems = recentCount + flatItems.length;

  // -----------------------------------------------------------------------
  // Reset state on open/close and query changes
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!open) {
      setQuery('');
      setActiveIndex(-1);
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(-1);
  }, [query]);

  // -----------------------------------------------------------------------
  // Global Cmd+K / Ctrl+K
  // -----------------------------------------------------------------------
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange]);

  // -----------------------------------------------------------------------
  // Scroll active item into view
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (activeIndex < 0) return;
    const activeId = getActiveDomId(activeIndex);
    if (!activeId) return;
    const el = document.getElementById(activeId);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // -----------------------------------------------------------------------
  // Navigation helpers
  // -----------------------------------------------------------------------
  function getActiveDomId(index: number): string | undefined {
    if (index < 0 || totalItems === 0) return undefined;
    if (index < recentCount) {
      return `cmd-recent-${index}`;
    }
    const flatIdx = index - recentCount;
    return flatItems[flatIdx]?.domId;
  }

  const handleSelect = useCallback(
    (href: string, label: string) => {
      addPage(href, label);
      onOpenChange(false);
      setQuery('');
      setActiveIndex(-1);
      router.push(href);
    },
    [router, onOpenChange, addPage],
  );

  function selectAtIndex(index: number) {
    if (index < 0 || index >= totalItems) return;
    if (index < recentCount) {
      const page = recentPages[index];
      if (page) handleSelect(page.path, page.label);
    } else {
      const flatIdx = index - recentCount;
      const item = flatItems[flatIdx];
      if (item) handleSelect(item.registryItem.resolvedHref, item.registryItem.label);
    }
  }

  // -----------------------------------------------------------------------
  // Keyboard handler
  // -----------------------------------------------------------------------
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (totalItems === 0) return;

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          setActiveIndex((prev) => {
            if (prev < totalItems - 1) return prev + 1;
            return 0; // wrap
          });
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          setActiveIndex((prev) => {
            if (prev > 0) return prev - 1;
            return totalItems - 1; // wrap
          });
          break;
        }
        case 'Enter': {
          e.preventDefault();
          if (activeIndex >= 0) {
            selectAtIndex(activeIndex);
          }
          break;
        }
        case 'Home': {
          e.preventDefault();
          setActiveIndex(0);
          break;
        }
        case 'End': {
          e.preventDefault();
          setActiveIndex(totalItems - 1);
          break;
        }
        default:
          break;
      }
    },
    [totalItems, activeIndex], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // -----------------------------------------------------------------------
  // Rendering
  // -----------------------------------------------------------------------
  const activeDescendant = getActiveDomId(activeIndex);
  const hasQuery = query.trim().length > 0;
  const noResults = hasQuery && filtered.length === 0;
  const showRecent = !hasQuery && hasEnoughRecent;
  const showSuggested = !hasQuery && hasEnoughRecent && suggestedItems.length > 0;
  const showGettingStarted = !hasQuery && !hasEnoughRecent && gettingStartedItems.length > 0;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm" />
        <Dialog.Content
          aria-label="Command palette"
          className={cn(
            'fixed inset-x-0 top-0 z-[101] mx-auto mt-[15vh] w-full max-w-[560px] px-4',
            'outline-none',
          )}
          onOpenAutoFocus={(e) => {
            // Let our input handle focus
            e.preventDefault();
            inputRef.current?.focus();
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
          }}
        >
          <div className="overflow-hidden rounded-2xl border border-edge bg-surface-card shadow-2xl">
            <CommandInput
              ref={inputRef}
              value={query}
              onChange={setQuery}
              onKeyDown={handleKeyDown}
              activeDescendant={activeDescendant}
              resultsId={RESULTS_ID}
              expanded={open && totalItems > 0}
            />

            <div
              ref={listRef}
              id={RESULTS_ID}
              role="listbox"
              aria-label="Search results"
              className="max-h-[360px] overflow-y-auto p-2"
            >
              {/* Search results */}
              {hasQuery && !noResults && (
                <>
                  {Array.from(grouped.entries()).map(([groupLabel, items]) => (
                    <CommandGroup key={groupLabel} label={groupLabel}>
                      {items.map((item) => {
                        const idx = recentCount + flatItems.findIndex((f) => f.registryItem.id === item.id);
                        return (
                          <CommandItem
                            key={item.id}
                            id={`cmd-item-${item.id}`}
                            icon={item.icon}
                            label={item.label}
                            description={item.description}
                            badge={categoryToBadge(item.category)}
                            isActive={activeIndex === idx}
                            onSelect={() => handleSelect(item.resolvedHref, item.label)}
                            onMouseEnter={() => setActiveIndex(idx)}
                          />
                        );
                      })}
                    </CommandGroup>
                  ))}
                </>
              )}

              {/* No results */}
              {noResults && <CommandEmpty />}

              {/* Recent pages */}
              {showRecent && (
                <CommandGroup label="Recent">
                  {recentPages.map((page, i) => (
                    <div
                      key={`recent-${page.path}`}
                      id={`cmd-recent-${i}`}
                      role="option"
                      aria-selected={activeIndex === i}
                      onClick={() => handleSelect(page.path, page.label)}
                      onMouseEnter={() => setActiveIndex(i)}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm',
                        'text-content-secondary transition-colors',
                        activeIndex === i && 'bg-surface-muted',
                      )}
                    >
                      <Clock size={16} className="shrink-0 text-content-disabled" aria-hidden="true" />
                      <span className="truncate">{page.label}</span>
                    </div>
                  ))}
                </CommandGroup>
              )}

              {/* Suggested items */}
              {showSuggested && (
                <CommandGroup label="Suggested">
                  {suggestedItems.map((item) => {
                    const idx = recentCount + flatItems.findIndex((f) => f.registryItem.id === item.id);
                    return (
                      <CommandItem
                        key={item.id}
                        id={`cmd-item-${item.id}`}
                        icon={item.icon}
                        label={item.label}
                        description={item.description}
                        badge={categoryToBadge(item.category)}
                        isActive={activeIndex === idx}
                        onSelect={() => handleSelect(item.resolvedHref, item.label)}
                        onMouseEnter={() => setActiveIndex(idx)}
                      />
                    );
                  })}
                </CommandGroup>
              )}

              {/* Getting Started */}
              {showGettingStarted && (
                <CommandGroup label="Getting Started">
                  {gettingStartedItems.map((item) => {
                    const idx = flatItems.findIndex((f) => f.registryItem.id === item.id);
                    return (
                      <CommandItem
                        key={item.id}
                        id={`cmd-item-${item.id}`}
                        icon={item.icon}
                        label={item.label}
                        description={item.description}
                        badge={categoryToBadge(item.category)}
                        isActive={activeIndex === idx}
                        onSelect={() => handleSelect(item.resolvedHref, item.label)}
                        onMouseEnter={() => setActiveIndex(idx)}
                      />
                    );
                  })}
                </CommandGroup>
              )}

              {/* Completely empty — no items at all */}
              {!hasQuery && !showRecent && !showSuggested && !showGettingStarted && (
                <div className="px-4 py-8 text-center text-sm text-content-tertiary">
                  Start typing to search pages, actions, and settings.
                </div>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
