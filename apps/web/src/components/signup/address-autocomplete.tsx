'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, Loader2, MapPin } from 'lucide-react';
import {
  loadAddressAutocompleteSuggestions,
  parseAddressAutocompleteQuery,
  type AddressAutocompleteSuggestion,
} from '@/lib/address-autocomplete';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

const SEARCH_DEBOUNCE_MS = 250;

interface SignupAddressAutocompleteProps {
  inputId: string;
  value: string;
  selectedSuggestionKey: string | null;
  onValueChange: (value: string) => void;
  onSuggestionSelect: (suggestion: AddressAutocompleteSuggestion) => void;
  onSelectedSuggestionChange: (key: string | null) => void;
  disabled?: boolean;
  invalid?: boolean;
  /** Merged with default input styles (e.g. clean wizard). */
  inputClassName?: string;
}

export function SignupAddressAutocomplete({
  inputId,
  value,
  selectedSuggestionKey,
  onValueChange,
  onSuggestionSelect,
  onSelectedSuggestionChange,
  disabled = false,
  invalid = false,
  inputClassName,
}: SignupAddressAutocompleteProps) {
  const listboxId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [suggestions, setSuggestions] = useState<AddressAutocompleteSuggestion[]>([]);
  const [hasFetchError, setHasFetchError] = useState(false);

  const parsedQuery = useMemo(
    () => parseAddressAutocompleteQuery(value),
    [value],
  );

  useEffect(() => {
    if (disabled) {
      setOpen(false);
      setSuggestions([]);
      setIsLoading(false);
      return;
    }

    if (!value.trim() || !parsedQuery) {
      setSuggestions([]);
      setIsLoading(false);
      return;
    }

    let active = true;
    setIsLoading(true);
    setHasFetchError(false);

    const timeoutId = window.setTimeout(() => {
      void loadAddressAutocompleteSuggestions(value)
        .then((nextSuggestions) => {
          if (!active) {
            return;
          }

          setSuggestions(nextSuggestions);
          setActiveIndex(nextSuggestions.length > 0 ? 0 : -1);
          if (document.activeElement === inputRef.current) {
            setOpen(true);
          }
        })
        .catch(() => {
          if (!active) {
            return;
          }

          setSuggestions([]);
          setActiveIndex(-1);
          setHasFetchError(true);
        })
        .finally(() => {
          if (active) {
            setIsLoading(false);
          }
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [disabled, parsedQuery, value]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, []);

  function handleSelectSuggestion(suggestion: AddressAutocompleteSuggestion) {
    onSuggestionSelect(suggestion);
    onSelectedSuggestionChange(suggestion.key);
    setOpen(false);
    setActiveIndex(-1);
  }

  const activeSuggestion = activeIndex >= 0 ? suggestions[activeIndex] : null;

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        ref={inputRef}
        id={inputId}
        type="text"
        value={value}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={activeSuggestion ? `${listboxId}-${activeIndex}` : undefined}
        aria-invalid={invalid}
        disabled={disabled}
        placeholder="123 Main St"
        className={cn(
          invalid ? 'border-status-danger' : 'border-edge-strong',
          inputClassName,
        )}
        onFocus={() => {
          if (suggestions.length > 0 || isLoading || hasFetchError || value.trim()) {
            setOpen(true);
          }
        }}
        onChange={(event) => {
          if (selectedSuggestionKey) {
            onSelectedSuggestionChange(null);
          }
          onValueChange(event.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onKeyDown={(event) => {
          if (!open && event.key === 'ArrowDown' && suggestions.length > 0) {
            event.preventDefault();
            setOpen(true);
            setActiveIndex(0);
            return;
          }

          if (!open) {
            return;
          }

          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveIndex((current) => {
              if (suggestions.length === 0) {
                return -1;
              }
              return current < suggestions.length - 1 ? current + 1 : 0;
            });
            return;
          }

          if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex((current) => {
              if (suggestions.length === 0) {
                return -1;
              }
              return current > 0 ? current - 1 : suggestions.length - 1;
            });
            return;
          }

          if (event.key === 'Enter' && activeSuggestion) {
            event.preventDefault();
            handleSelectSuggestion(activeSuggestion);
            return;
          }

          if (event.key === 'Escape') {
            event.preventDefault();
            setOpen(false);
            setActiveIndex(-1);
          }
        }}
      />

      {open ? (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-30 mt-2 max-h-72 w-full overflow-y-auto rounded-md border border-edge bg-surface-card shadow-e2"
        >
          {isLoading ? (
            <div className="flex items-center gap-2 px-3 py-3 text-sm text-content-secondary" aria-live="polite">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Searching address index...
            </div>
          ) : null}

          {!isLoading && hasFetchError ? (
            <div className="px-3 py-3 text-sm text-content-secondary">
              Address suggestions are unavailable right now. You can keep typing manually.
            </div>
          ) : null}

          {!isLoading && !hasFetchError && !parsedQuery && value.trim() ? (
            <div className="px-3 py-3 text-sm text-content-secondary">
              Type at least 3 letters of the street name to search the offline address index.
            </div>
          ) : null}

          {!isLoading && !hasFetchError && parsedQuery && suggestions.length === 0 ? (
            <div className="px-3 py-3 text-sm text-content-secondary">
              No address suggestions found. You can keep typing manually.
            </div>
          ) : null}

          {!isLoading && suggestions.length > 0 ? (
            <ul className="py-1">
              {suggestions.map((suggestion, index) => {
                const selected = suggestion.key === selectedSuggestionKey;
                const active = index === activeIndex;

                return (
                  <li key={suggestion.key}>
                    <button
                      id={`${listboxId}-${index}`}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={cn(
                        'flex w-full items-start gap-3 px-3 py-2 text-left transition-colors',
                        active ? 'bg-surface-hover' : 'bg-surface-card',
                      )}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => handleSelectSuggestion(suggestion)}
                    >
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-content-tertiary" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-content">
                          {suggestion.addressLine1}, {suggestion.city}, {suggestion.state} {suggestion.zipCode}
                        </p>
                        <p className="truncate text-xs text-content-secondary">
                          {suggestion.county} County
                        </p>
                      </div>
                      <Check
                        className={cn(
                          'mt-0.5 h-4 w-4 shrink-0 text-content-link',
                          selected ? 'opacity-100' : 'opacity-0',
                        )}
                        aria-hidden="true"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
