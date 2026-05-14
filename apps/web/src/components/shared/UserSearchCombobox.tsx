'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  meetsUserSearchMinLength,
  useUserSearch,
  type UserSearchResult,
} from '@/hooks/use-user-search';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserSearchComboboxProps {
  communityId: number;
  /** Selected user id, or null when cleared */
  value: string | null;
  onChange: (userId: string | null, displayLabel?: string) => void;
  placeholder?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 300;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function UserSearchCombobox({
  communityId,
  value,
  onChange,
  placeholder = 'Search users...',
}: UserSearchComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTitle, setSelectedTitle] = useState<string>('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const searchUsers = useUserSearch(communityId);

  const search = useCallback(
    async (q: string, signal: AbortSignal) => {
      if (!meetsUserSearchMinLength(q)) {
        setResults([]);
        setError(null);
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const nextResults = await searchUsers(q, signal);
        if (signal.aborted) return;
        setResults(nextResults);
      } catch (err) {
        if ((err as { name?: string } | undefined)?.name === 'AbortError') return;
        setResults([]);
        setError('We could not load users. Please try again.');
      } finally {
        if (!signal.aborted) setIsLoading(false);
      }
    },
    [searchUsers],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      void search(query, controller.signal);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, [query, search]);

  function handleSelect(result: UserSearchResult) {
    setSelectedTitle(result.title);
    onChange(result.id, result.title);
    setOpen(false);
  }

  function handleClear(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setSelectedTitle('');
    onChange(null);
    setQuery('');
    setResults([]);
    setError(null);
  }

  const displayValue = value ? selectedTitle || value : '';

  return (
    <div className="flex w-full flex-col gap-1">
      <div className="flex w-full min-w-0 items-start gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="min-w-0 flex-1 justify-between font-normal"
            >
              <span className="truncate">{displayValue || placeholder}</span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[min(100vw-2rem,24rem)] p-0 sm:w-[24rem]" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Type name, email, or unit..."
                value={query}
                onValueChange={setQuery}
              />
              <CommandList>
                {isLoading && (
                  <div
                    className="flex items-center justify-center py-4"
                    aria-live="polite"
                    aria-busy="true"
                  >
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
                    <span className="sr-only">Loading users&hellip;</span>
                  </div>
                )}
                {!isLoading && error && (
                  <div role="alert" className="px-3 py-4 text-sm text-status-danger">
                    {error}
                  </div>
                )}
                {!isLoading && !error && meetsUserSearchMinLength(query) && results.length === 0 && (
                  <CommandEmpty>No users found</CommandEmpty>
                )}
                {!isLoading && results.length > 0 && (
                  <CommandGroup>
                    {results.map((r) => (
                      <CommandItem
                        key={r.id}
                        value={r.id}
                        onSelect={() => handleSelect(r)}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            value === r.id ? 'opacity-100' : 'opacity-0',
                          )}
                          aria-hidden="true"
                        />
                        <div>
                          <p className="text-sm font-medium">{r.title}</p>
                          {r.subtitle ? (
                            <p className="text-xs text-muted-foreground">{r.subtitle}</p>
                          ) : null}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {value ? (
          <button
            type="button"
            onClick={handleClear}
            className="shrink-0 pt-1 text-xs font-medium text-content-link hover:underline"
          >
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}
