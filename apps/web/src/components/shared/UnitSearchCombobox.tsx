'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
  meetsUnitSearchMinLength,
  useUnitSearch,
  type UnitSearchResult,
} from '@/hooks/use-unit-search';

export interface UnitSearchComboboxProps {
  communityId: number;
  value: string | null;
  onChange: (label: string) => void;
  placeholder?: string;
  inputId?: string;
}

const DEBOUNCE_MS = 300;

export function UnitSearchCombobox({
  communityId,
  value,
  onChange,
  placeholder = 'Search units (e.g. 101A)...',
  inputId,
}: UnitSearchComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UnitSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const searchUnits = useUnitSearch(communityId);

  const search = useCallback(
    async (q: string, signal: AbortSignal) => {
      if (!meetsUnitSearchMinLength(q)) {
        setResults([]);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const nextResults = await searchUnits(q, signal);
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
    [searchUnits],
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

  function handleSelect(result: UnitSearchResult) {
    onChange(result.label);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={inputId}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {value || placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Type unit label..."
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
                <span className="sr-only">Loading units...</span>
              </div>
            )}
            {!isLoading && meetsUnitSearchMinLength(query) && results.length === 0 && (
              <CommandEmpty>No units found</CommandEmpty>
            )}
            {!isLoading && results.length > 0 && (
              <CommandGroup>
                {results.map((r) => (
                  <CommandItem
                    key={r.id}
                    value={r.label}
                    onSelect={() => handleSelect(r)}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        value === r.label ? 'opacity-100' : 'opacity-0',
                      )}
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-sm font-medium">{r.label}</p>
                      {(r.building || r.floor != null) ? (
                        <p className="text-xs text-content-secondary">
                          {[r.building, r.floor != null ? `Floor ${r.floor}` : null]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
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
  );
}
