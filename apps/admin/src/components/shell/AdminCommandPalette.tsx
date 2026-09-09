'use client';

/**
 * The console-wide ⌘K command palette. Static pages (`NAV_PAGES`) filter
 * instantly on the client; everything else (clients, threads, people — Wave 3
 * adds tickets) comes from `GET /api/admin/search`, debounced and merged in
 * once the query is at least two characters.
 *
 * Wiring the global ⌘K shortcut and rendering this component happens in
 * Task 11 — this file only owns the dialog and its own fetch lifecycle.
 */
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  DialogDescription,
  DialogTitle,
} from '@propertypro/ui';
import type { SearchGroup } from '@/lib/server/search';
import { NAV_PAGES } from './nav-config';
import { SIGNAL_ICONS } from './signal-icons';

export interface AdminCommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DEBOUNCE_MS = 150;
const MIN_QUERY_LENGTH = 2;

const PagesIcon = SIGNAL_ICONS.activity;

export function AdminCommandPalette({ open, onOpenChange }: AdminCommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [groups, setGroups] = useState<SearchGroup[]>([]);

  // Reset on close so the next open starts from a blank slate.
  useEffect(() => {
    if (!open) {
      setQuery('');
      setGroups([]);
    }
  }, [open]);

  // Debounced server search. The cleanup below cancels the in-flight request
  // both when `query` changes again before it resolves and when the
  // component unmounts (React runs it in both cases) — so a slower earlier
  // response can never overwrite a faster later one.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setGroups([]);
      return;
    }

    const controller = new AbortController();

    const timer = setTimeout(() => {
      fetch(`/api/admin/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : { data: [] }))
        .then((body: { data?: SearchGroup[] }) => {
          if (controller.signal.aborted) return;
          setGroups(body.data ?? []);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          if (error instanceof DOMException && error.name === 'AbortError') return;
          setGroups([]);
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const pageHits = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return NAV_PAGES.filter((page) => page.label.toLowerCase().includes(needle));
  }, [query]);

  function handleSelect(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <DialogTitle className="sr-only">Search the admin console</DialogTitle>
      <DialogDescription className="sr-only">
        Search pages, clients, threads and people, then select a result to navigate to it.
      </DialogDescription>
      <Command shouldFilter={false}>
        <CommandInput
          aria-label="Search"
          placeholder="Search clients, threads, tickets, users…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>No results for &ldquo;{query}&rdquo;.</CommandEmpty>
          {pageHits.length > 0 && (
            <CommandGroup heading="Pages">
              {pageHits.map((page) => (
                <CommandItem key={page.id} value={`page-${page.id}`} onSelect={() => handleSelect(page.href)}>
                  <PagesIcon aria-hidden="true" />
                  <span>{page.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {groups.map((group) => (
            <CommandGroup key={group.key} heading={group.label}>
              {group.hits.map((hit) => {
                const HitIcon = SIGNAL_ICONS[hit.icon];
                return (
                  <CommandItem key={hit.id} value={hit.id} onSelect={() => handleSelect(hit.href)}>
                    <HitIcon aria-hidden="true" />
                    <span>{hit.label}</span>
                    {hit.meta && <span className="ml-auto text-xs text-content-secondary">{hit.meta}</span>}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ))}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
