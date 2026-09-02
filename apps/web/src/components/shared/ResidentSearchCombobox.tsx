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
  meetsResidentSearchMinLength,
  useResidentSearch,
  type ResidentSearchResult,
} from '@/hooks/use-resident-search';

export interface ResidentSearchComboboxProps {
  communityId: number;
  value: string | null;       // selected resident userId
  onChange: (id: string, title: string) => void;
  placeholder?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 300;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ResidentSearchCombobox({
  communityId,
  value,
  onChange,
  placeholder = 'Search residents...',
}: ResidentSearchComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ResidentSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTitle, setSelectedTitle] = useState<string>('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const searchResidents = useResidentSearch(communityId);

  const search = useCallback(
    async (q: string, signal: AbortSignal) => {
      if (!meetsResidentSearchMinLength(q)) {
        setResults([]);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const nextResults = await searchResidents(q, signal);
        if (signal.aborted) return;
        setResults(nextResults);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (err instanceof Error && err.name === 'AbortError') return;
        setResults([]);
      } finally {
        if (!signal.aborted) setIsLoading(false);
      }
    },
    [searchResidents],
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

  function handleSelect(result: ResidentSearchResult) {
    setSelectedTitle(result.title);
    onChange(result.id, result.title);
    setOpen(false);
  }

  const displayValue = value ? (selectedTitle || value) : '';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {displayValue || placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Type name or unit number..."
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
                <Loader2 className="h-4 w-4 animate-spin text-content-secondary" aria-hidden="true" />
                <span className="sr-only">Loading residents...</span>
              </div>
            )}
            {!isLoading && meetsResidentSearchMinLength(query) && results.length === 0 && (
              <CommandEmpty>No residents found</CommandEmpty>
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
                      <p className="text-xs text-content-secondary">{r.subtitle}</p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
