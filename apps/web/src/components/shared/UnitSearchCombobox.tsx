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

interface UnitResult {
  id: number;
  label: string;
  building: string | null;
  floor: number | null;
}

export interface UnitSearchComboboxProps {
  communityId: number;
  value: string | null;
  onChange: (label: string) => void;
  placeholder?: string;
  inputId?: string;
}

const DEBOUNCE_MS = 300;
const FETCH_LIMIT = 10;

export function UnitSearchCombobox({
  communityId,
  value,
  onChange,
  placeholder = 'Search units (e.g. 101A)...',
  inputId,
}: UnitSearchComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UnitResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 1) {
      setResults([]);
      return;
    }
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        communityId: String(communityId),
        q: q.trim(),
        limit: String(FETCH_LIMIT),
      });
      const res = await fetch(`/api/v1/search/units?${params.toString()}`);
      if (!res.ok) throw new Error('search failed');
      const json = (await res.json()) as { results: UnitResult[] };
      setResults(json.results ?? []);
    } catch {
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, [communityId]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void search(query);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  function handleSelect(result: UnitResult) {
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
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
                <span className="sr-only">Loading units...</span>
              </div>
            )}
            {!isLoading && query.trim().length >= 1 && results.length === 0 && (
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
                        <p className="text-xs text-muted-foreground">
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
