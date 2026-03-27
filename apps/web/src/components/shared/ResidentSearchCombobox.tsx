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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ResidentResult {
  id: string;
  title: string;
  subtitle: string;
  unitNumber: string | null;
}

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
const FETCH_LIMIT = 10;

// Minimum query length: 2 chars for alpha input, 1 char for numeric input
function meetsMinLength(q: string): boolean {
  const trimmed = q.trim();
  if (!trimmed) return false;
  if (/^\d/.test(trimmed)) return trimmed.length >= 1;
  return trimmed.length >= 2;
}

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
  const [results, setResults] = useState<ResidentResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTitle, setSelectedTitle] = useState<string>('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    if (!meetsMinLength(q)) {
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
      const res = await fetch(`/api/v1/search/residents?${params.toString()}`);
      if (!res.ok) throw new Error('Search failed');
      const json = (await res.json()) as { results: ResidentResult[] };
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

  function handleSelect(result: ResidentResult) {
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
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
                <span className="sr-only">Loading residents&hellip;</span>
              </div>
            )}
            {!isLoading && meetsMinLength(query) && results.length === 0 && (
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
                      <p className="text-xs text-muted-foreground">{r.subtitle}</p>
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
