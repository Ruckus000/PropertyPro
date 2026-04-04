'use client';

/**
 * Command Palette V2 — Custom implementation using Radix Dialog + custom listbox.
 *
 * Phase 1: Feature registry search + keyboard navigation + role-aware empty states
 * Phase 2: Aggregated server search across authorized entity groups + "View all" links
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import {
  ArrowRight,
  Clock,
  FileText,
  Megaphone,
  Calendar,
  Wrench,
  AlertTriangle,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AnyCommunityRole, CommunityFeatures } from '@propertypro/shared';
import { ADMIN_ROLES } from '@propertypro/shared';
import type { ResourceAccessMap } from '@/lib/db/access-control';
import { cn } from '@/lib/utils';
import { useRecentPages } from '@/hooks/useRecentPages';
import { useFilteredRegistry, type ResolvedRegistryItem } from '@/lib/constants/feature-registry';
import { getEnabledSearchGroups } from '@/lib/search/group-config';
import { isSearchShortcut } from '@/lib/utils/search-shortcut';
import { CommandInput } from './CommandInput';
import { CommandGroup } from './CommandGroup';
import { CommandItem } from './CommandItem';
import { CommandEmpty } from './CommandEmpty';
import { CommandLoading } from './CommandLoading';
import { useDataSearch, type DataSearchResult } from './useDataSearch';
import { getEntityListPath } from './command-palette-paths';

// ---------------------------------------------------------------------------
// Constants
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

const RECENT_THRESHOLD = 3;
const DEBOUNCE_MS = 300;
const RESULTS_ID = 'command-palette-results';

/** Entity type → icon mapping for data search results */
const ENTITY_ICONS: Record<string, LucideIcon> = {
  document: FileText,
  announcement: Megaphone,
  meeting: Calendar,
  maintenance: Wrench,
  violation: AlertTriangle,
  resident: Users,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isAdminRole(role: AnyCommunityRole | null): boolean {
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
// Navigable item union for keyboard nav
// ---------------------------------------------------------------------------
type NavItem =
  | { type: 'registry'; item: ResolvedRegistryItem; domId: string }
  | { type: 'data'; result: DataSearchResult; domId: string }
  | { type: 'viewAll'; groupKey: string; href: string; domId: string }
  | { type: 'recent'; path: string; label: string; domId: string };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  communityId: number | null;
  role: AnyCommunityRole | null;
  features: CommunityFeatures | null;
  resourceAccess: ResourceAccessMap | null;
  enableGlobalShortcut?: boolean;
}

export function CommandPalette({
  open,
  onOpenChange,
  communityId,
  role,
  features,
  resourceAccess,
  enableGlobalShortcut = true,
}: CommandPaletteProps) {
  const registryItems = useFilteredRegistry(role, features, communityId, resourceAccess);
  const router = useRouter();
  const { recentPages, addPage } = useRecentPages();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const admin = isAdminRole(role);
  const searchGroups = useMemo(
    () => getEnabledSearchGroups(admin, features, resourceAccess),
    [admin, features, resourceAccess],
  );
  const { groups: dataGroups, search: fireDataSearch, reset: resetDataSearch, isSearching } = useDataSearch(
    communityId,
    searchGroups,
  );

  // -----------------------------------------------------------------------
  // Debounced data search trigger
  // -----------------------------------------------------------------------
  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value);
      clearTimeout(debounceRef.current);

      const trimmed = value.trim();
      if (!trimmed) {
        resetDataSearch();
        return;
      }

      // Check minimum query length for API calls
      const isNumeric = /^\d+$/.test(trimmed);
      const minLen = isNumeric ? 1 : 2;
      if (trimmed.length < minLen) {
        resetDataSearch();
        return;
      }

      debounceRef.current = setTimeout(() => {
        fireDataSearch(trimmed);
      }, DEBOUNCE_MS);
    },
    [fireDataSearch, resetDataSearch],
  );

  // -----------------------------------------------------------------------
  // Filtered registry items (instant, client-side)
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
  // Flat nav list (registry + data results + "View all" links)
  // -----------------------------------------------------------------------
  const navItems = useMemo<NavItem[]>(() => {
    const hasQuery_ = query.trim().length > 0;

    if (hasQuery_) {
      const items: NavItem[] = [];

      // 1. Registry results first (instant)
      for (const [, groupItems] of grouped) {
        for (const item of groupItems) {
          items.push({
            type: 'registry',
            item,
            domId: `cmd-item-${item.id}`,
          });
        }
      }

      // 2. Data results (progressive)
      for (const group of dataGroups) {
        if (group.status !== 'ok' || group.results.length === 0) continue;
        for (const result of group.results) {
          items.push({
            type: 'data',
            result,
            domId: `cmd-data-${group.key}-${result.id}`,
          });
        }
        // "View all" link for each data group with results
        const listPath = getEntityListPath(group.key, {
          communityId,
          isAdmin: admin,
          query: query.trim(),
        });
        if (listPath) {
          items.push({
            type: 'viewAll',
            groupKey: group.key,
            href: listPath,
            domId: `cmd-viewall-${group.key}`,
          });
        }
      }

      return items;
    }

    // Empty-query: recent pages + suggested/getting started
    const items: NavItem[] = [];

    if (hasEnoughRecent) {
      for (let i = 0; i < recentPages.length; i++) {
        const page = recentPages[i];
        if (!page) continue;
        items.push({
          type: 'recent',
          path: page.path,
          label: page.label,
          domId: `cmd-recent-${i}`,
        });
      }
      for (const item of suggestedItems) {
        items.push({ type: 'registry', item, domId: `cmd-item-${item.id}` });
      }
    } else {
      for (const item of gettingStartedItems) {
        items.push({ type: 'registry', item, domId: `cmd-item-${item.id}` });
      }
    }

    return items;
  }, [query, grouped, dataGroups, hasEnoughRecent, recentPages, suggestedItems, gettingStartedItems]);

  const totalItems = navItems.length;

  // -----------------------------------------------------------------------
  // Reset state on open/close and query changes
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!open) {
      setQuery('');
      setActiveIndex(-1);
      resetDataSearch();
      clearTimeout(debounceRef.current);
    }
  }, [open, resetDataSearch]);

  useEffect(() => {
    setActiveIndex(-1);
  }, [query]);

  // -----------------------------------------------------------------------
  // Global Cmd+K / Ctrl+K
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!enableGlobalShortcut) {
      return;
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (isSearchShortcut(e)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [enableGlobalShortcut, open, onOpenChange]);

  // -----------------------------------------------------------------------
  // Scroll active item into view
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (activeIndex < 0) return;
    const navItem = navItems[activeIndex];
    if (!navItem) return;
    const el = document.getElementById(navItem.domId);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, navItems]);

  // -----------------------------------------------------------------------
  // Navigation
  // -----------------------------------------------------------------------
  const handleSelect = useCallback(
    (href: string, label: string) => {
      addPage(href, label);
      onOpenChange(false);
      setQuery('');
      setActiveIndex(-1);
      resetDataSearch();
      router.push(href);
    },
    [router, onOpenChange, addPage, resetDataSearch],
  );

  function selectNavItem(item: NavItem) {
    switch (item.type) {
      case 'registry':
        handleSelect(item.item.resolvedHref, item.item.label);
        break;
      case 'data':
        handleSelect(item.result.href, item.result.title);
        break;
      case 'viewAll':
        handleSelect(item.href, `View all ${item.groupKey}`);
        break;
      case 'recent':
        handleSelect(item.path, item.label);
        break;
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
          setActiveIndex((prev) => (prev < totalItems - 1 ? prev + 1 : 0));
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          setActiveIndex((prev) => (prev > 0 ? prev - 1 : totalItems - 1));
          break;
        }
        case 'Enter': {
          e.preventDefault();
          const target = activeIndex >= 0 ? navItems[activeIndex] : undefined;
          if (target) {
            selectNavItem(target);
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
    [totalItems, activeIndex, navItems], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // -----------------------------------------------------------------------
  // Rendering helpers
  // -----------------------------------------------------------------------
  const activeDescendant = activeIndex >= 0 ? navItems[activeIndex]?.domId : undefined;
  const hasQuery_ = query.trim().length > 0;
  const noRegistryResults = hasQuery_ && filtered.length === 0;
  const hasDataResults = dataGroups.some((g) => g.status === 'ok' && g.results.length > 0);
  const hasDataErrors = dataGroups.some((g) => g.status === 'error');
  const allDoneNoResults =
    hasQuery_ && noRegistryResults && !isSearching && !hasDataResults && !hasDataErrors;

  const showRecent = !hasQuery_ && hasEnoughRecent;
  const showSuggested = !hasQuery_ && hasEnoughRecent && suggestedItems.length > 0;
  const showGettingStarted = !hasQuery_ && !hasEnoughRecent && gettingStartedItems.length > 0;

  // Helper to get the navItem index for a given domId
  function navIndexOf(domId: string): number {
    return navItems.findIndex((n) => n.domId === domId);
  }

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
            e.preventDefault();
            inputRef.current?.focus();
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
          }}
        >
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <Dialog.Description className="sr-only">
            Search pages, actions, and settings, then use the arrow keys to choose a result.
          </Dialog.Description>
          <div className="overflow-hidden rounded-2xl border border-edge bg-surface-card shadow-2xl">
            <CommandInput
              ref={inputRef}
              value={query}
              onChange={handleQueryChange}
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
              {/* ============ Active search mode ============ */}
              {hasQuery_ && (
                <>
                  {/* Registry results (instant) */}
                  {filtered.length > 0 && (
                    <>
                      {Array.from(grouped.entries()).map(([groupLabel, items]) => (
                        <CommandGroup key={groupLabel} label={groupLabel}>
                          {items.map((item) => {
                            const idx = navIndexOf(`cmd-item-${item.id}`);
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

                  {/* Data search groups (progressive) */}
                  {dataGroups.map((group) => {
                    // Loading skeleton
                    if (group.status === 'loading') {
                      return <CommandLoading key={group.key} groupLabel={group.label} />;
                    }

                    // Loaded with results
                    if (group.status === 'ok' && group.results.length > 0) {
                      const entityType = group.results[0]?.entityType ?? 'document';
                      const Icon = ENTITY_ICONS[entityType] ?? FileText;
                      const listPath = getEntityListPath(group.key, {
                        communityId,
                        isAdmin: admin,
                        query: query.trim(),
                      });
                      const viewAllDomId = `cmd-viewall-${group.key}`;
                      const viewAllIdx = navIndexOf(viewAllDomId);

                      return (
                        <CommandGroup key={group.key} label={group.label}>
                          {group.results.map((result) => {
                            const domId = `cmd-data-${group.key}-${result.id}`;
                            const idx = navIndexOf(domId);
                            return (
                              <CommandItem
                                key={domId}
                                id={domId}
                                icon={Icon}
                                label={result.title}
                                description={result.subtitle}
                                isActive={activeIndex === idx}
                                onSelect={() => handleSelect(result.href, result.title)}
                                onMouseEnter={() => setActiveIndex(idx)}
                              />
                            );
                          })}

                          {/* "View all →" link */}
                          {listPath && (
                            <div
                              id={viewAllDomId}
                              role="option"
                              aria-selected={activeIndex === viewAllIdx}
                              onClick={() => handleSelect(listPath, `View all ${group.label}`)}
                              onMouseEnter={() => setActiveIndex(viewAllIdx)}
                              className={cn(
                                'flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs',
                                'font-medium text-interactive-primary transition-colors',
                                activeIndex === viewAllIdx && 'bg-surface-muted',
                              )}
                            >
                              <span>View all</span>
                              <ArrowRight size={12} aria-hidden="true" />
                            </div>
                          )}
                        </CommandGroup>
                      );
                    }

                    if (group.status === 'error') {
                      return (
                        <CommandGroup key={group.key} label={group.label}>
                          <div className="rounded-lg border border-edge-subtle bg-surface-muted px-3 py-2 text-sm text-content-secondary">
                            {group.error ?? 'Search is temporarily unavailable for this section.'}
                          </div>
                        </CommandGroup>
                      );
                    }

                    return null;
                  })}

                  {/* No results anywhere */}
                  {allDoneNoResults && <CommandEmpty />}
                </>
              )}

              {/* ============ Empty query mode ============ */}

              {/* Recent pages */}
              {showRecent && (
                <CommandGroup label="Recent">
                  {recentPages.map((page, i) => {
                    const domId = `cmd-recent-${i}`;
                    const idx = navIndexOf(domId);
                    return (
                      <div
                        key={`recent-${page.path}`}
                        id={domId}
                        role="option"
                        aria-selected={activeIndex === idx}
                        onClick={() => handleSelect(page.path, page.label)}
                        onMouseEnter={() => setActiveIndex(idx)}
                        className={cn(
                          'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm',
                          'text-content-secondary transition-colors',
                          activeIndex === idx && 'bg-surface-muted',
                        )}
                      >
                        <Clock size={16} className="shrink-0 text-content-disabled" aria-hidden="true" />
                        <span className="truncate">{page.label}</span>
                      </div>
                    );
                  })}
                </CommandGroup>
              )}

              {/* Suggested items */}
              {showSuggested && (
                <CommandGroup label="Suggested">
                  {suggestedItems.map((item) => {
                    const idx = navIndexOf(`cmd-item-${item.id}`);
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
                    const idx = navIndexOf(`cmd-item-${item.id}`);
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
              {!hasQuery_ && !showRecent && !showSuggested && !showGettingStarted && (
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
