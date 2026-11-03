'use client';

/**
 * The audit trail's three controls, all visible at once:
 *
 * - One search box that finds people and things and narrows the page to one.
 * - A "When" menu beside it.
 * - Plain-word "Show" choices (Important, Everything, Deleted, …) below.
 *
 * Every control has a visible resting state (fill, border, dark label). An
 * earlier mockup's pills only appeared on hover; don't reintroduce that.
 */
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { CalendarDays, FileText, Loader2, Search, User, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AUDIT_PERIODS,
  AUDIT_VIEW_LABELS,
  AUDIT_VIEWS,
  periodLabel,
  type AuditPeriod,
  type AuditView,
} from '@/lib/audit/audit-catalog';
import type { AuditScope } from '@/lib/audit/types';
import { useAuditSearchSuggestions, type AuditSuggestion } from '@/hooks/use-audit-search-suggestions';

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

interface AuditSearchProps {
  communityId: number;
  scope: AuditScope | null;
  scopeLabel: string | null;
  onScope: (scope: AuditScope | null, label: string | null) => void;
}

export function AuditSearch({ communityId, scope, scopeLabel, onScope }: AuditSearchProps) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const { suggestions, isSearching, searchedFor } = useAuditSearchSuggestions(communityId, text);
  const showList = open && text.trim().length >= 2;

  function choose(s: AuditSuggestion) {
    onScope(s.scope, s.label);
    setText('');
    setOpen(false);
    inputRef.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, Math.max(suggestions.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && showList && suggestions[active]) {
      e.preventDefault();
      choose(suggestions[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'Backspace' && text === '' && scope) {
      onScope(null, null);
    }
  }

  const scopeTypeLabel = scope?.kind === 'person' ? 'Person' : scope ? itemTypeLabel(scope.entityType) : null;

  return (
    <div className="relative">
      <div
        className={cn(
          'flex min-h-11 items-center gap-2 rounded-md border border-edge-strong bg-surface-card px-3',
          'focus-within:border-edge-focus focus-within:ring-2 focus-within:ring-focus',
        )}
      >
        <Search className="size-4 shrink-0 text-content-tertiary" aria-hidden="true" />
        {scope && (
          <span className="inline-flex max-w-[60%] shrink-0 items-center gap-1 rounded-sm bg-interactive-subtle py-0.5 pl-2 pr-0.5 text-sm text-content-brand">
            <span className="text-content-secondary">{scopeTypeLabel}:</span>
            <span className="truncate font-medium">{scopeLabel ?? 'Selected'}</span>
            <button
              type="button"
              onClick={() => onScope(null, null)}
              className="inline-flex size-6 items-center justify-center rounded-sm text-content-brand hover:bg-interactive-subtle-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              aria-label={`Stop showing only ${scopeLabel ?? 'this selection'}`}
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </span>
        )}
        <input
          ref={inputRef}
          type="text"
          enterKeyHint="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && suggestions[active] ? `${listId}-${active}` : undefined}
          aria-label="Search for a person, document, or unit"
          placeholder={scope ? 'Search for someone else' : 'Search people or documents'}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          className="h-10 min-w-0 flex-1 bg-transparent text-base text-content placeholder:text-content-placeholder focus:outline-none"
        />
        {isSearching && <Loader2 className="size-4 shrink-0 animate-spin text-content-tertiary" aria-hidden="true" />}
      </div>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Matching people and things"
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-md border border-edge bg-surface-card p-1 shadow-md"
        >
          {suggestions.length === 0 && !isSearching && searchedFor.length >= 2 && (
            <li className="px-3 py-2 text-sm text-content-secondary">
              No people or documents match “{searchedFor}”
            </li>
          )}
          {suggestions.map((s, i) => (
            <li
              key={s.key}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(s);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-sm px-3 py-2 text-sm',
                i === active ? 'bg-surface-muted' : 'bg-transparent',
              )}
            >
              {s.scope.kind === 'person' ? (
                <User className="size-4 shrink-0 text-content-tertiary" aria-hidden="true" />
              ) : (
                <FileText className="size-4 shrink-0 text-content-tertiary" aria-hidden="true" />
              )}
              <span className="min-w-0 flex-1 truncate text-content">{s.label}</span>
              <span className="shrink-0 text-xs text-content-tertiary">{s.typeLabel}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function itemTypeLabel(entityType: string): string {
  switch (entityType) {
    case 'document':
      return 'Document';
    case 'meeting':
      return 'Meeting';
    case 'announcement':
      return 'Announcement';
    case 'maintenance':
      return 'Maintenance request';
    case 'violation':
      return 'Violation';
    default:
      return 'Item';
  }
}

// ---------------------------------------------------------------------------
// Show choices
// ---------------------------------------------------------------------------

interface AuditViewPickerProps {
  view: AuditView;
  onView: (view: AuditView) => void;
}

export function AuditViewPicker({ view, onView }: AuditViewPickerProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Show"
      className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0"
    >
      {AUDIT_VIEWS.map((v) => {
        const selected = v === view;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onView(v)}
            className={cn(
              'inline-flex h-9 shrink-0 items-center rounded-full border px-4 text-sm transition-colors duration-quick',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
              selected
                ? 'border-interactive bg-interactive-subtle font-medium text-content-brand'
                : 'border-edge-strong bg-surface-card text-content hover:bg-surface-hover',
            )}
          >
            {AUDIT_VIEW_LABELS[v]}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// When
// ---------------------------------------------------------------------------

interface AuditPeriodPickerProps {
  period: AuditPeriod;
  onPeriod: (period: AuditPeriod) => void;
}

export function AuditPeriodPicker({ period, onPeriod }: AuditPeriodPickerProps) {
  return (
    <Select value={period} onValueChange={(v) => onPeriod(v as AuditPeriod)}>
      <SelectTrigger
        aria-label="When"
        className="w-full shrink-0 justify-start gap-2 sm:w-44 [&>svg:last-child]:ml-auto"
      >
        <CalendarDays className="size-4 text-content-tertiary" aria-hidden="true" />
        {/* Children, so the label is in the server HTML instead of blank until hydration. */}
        <SelectValue>{periodLabel(period)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {AUDIT_PERIODS.map((p) => (
          <SelectItem key={p.value} value={p.value}>
            {p.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
