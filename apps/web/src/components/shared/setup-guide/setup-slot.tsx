'use client';

/**
 * Blueprint slots: one per record the open step needs (spec §4.1, §6.2, §6.3).
 *
 * A slot is a real button named "Add file: <record>" (the dashed border is
 * decoration; the visible "Add file" text identifies the control). A
 * conditional record gets a second button, "Doesn't apply to us". The next
 * slot to fill carries the accent (theme primary), never the others.
 */

import * as React from 'react';
import { Check, FileText, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SetupSlotProps {
  title: string;
  /** "Required" or "If it applies" (never a bare statute reference). */
  tag?: string;
  description?: string;
  /** The suggested next slot. At most one per list. */
  next?: boolean;
  /** Filled: shows the file it holds and no add button. */
  filledWith?: string;
  /** Verb in the name and visible text: "Add file" (default), "Add unit"… */
  addLabel?: string;
  onAdd?: () => void;
  /** Conditional records only. */
  onNotApplicable?: () => void;
  icon?: React.ReactNode;
}

export function SetupSlotList({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <ul aria-label={label} className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">
      {children}
    </ul>
  );
}

export function SetupSlot({
  title,
  tag,
  description,
  next = false,
  filledWith,
  addLabel = 'Add file',
  onAdd,
  onNotApplicable,
  icon,
}: SetupSlotProps) {
  const describedById = React.useId();
  const meta = [tag, description, next ? 'next up' : undefined].filter(Boolean).join(' · ');

  const tile = (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-sm',
        filledWith
          ? 'bg-status-success text-content-inverse'
          : next
            ? 'bg-interactive text-content-inverse'
            : 'bg-surface-muted text-content-secondary',
      )}
    >
      {filledWith ? (
        <Check className="size-5" strokeWidth={3} />
      ) : next ? (
        <Plus className="size-5" strokeWidth={3} />
      ) : (
        (icon ?? <FileText className="size-5" />)
      )}
    </span>
  );

  const text = (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="text-sm font-medium text-content">{title}</span>
      {meta && (
        <span id={describedById} className="text-xs text-content-secondary">
          {meta}
        </span>
      )}
      {filledWith ? (
        <span className="truncate text-xs text-content-secondary">{filledWith}</span>
      ) : (
        <span aria-hidden="true" className="text-xs font-medium text-interactive">
          {addLabel}
        </span>
      )}
    </span>
  );

  const box = cn(
    'flex w-full items-start gap-3 rounded-md border bg-surface-card p-4 text-left',
    filledWith
      ? 'border-edge'
      : next
        ? 'border-interactive'
        : 'border-dashed border-edge-strong hover:bg-surface-hover',
  );

  return (
    <li className="flex flex-col gap-2">
      {filledWith || !onAdd ? (
        <div className={box}>
          {tile}
          {text}
        </div>
      ) : (
        <button
          type="button"
          onClick={onAdd}
          aria-label={`${addLabel}: ${title}`}
          aria-describedby={meta ? describedById : undefined}
          className={box}
        >
          {tile}
          {text}
        </button>
      )}
      {onNotApplicable && !filledWith && (
        <button
          type="button"
          onClick={onNotApplicable}
          aria-label={`Doesn't apply to us: ${title}`}
          className="min-h-11 self-start text-xs font-medium text-content-secondary underline underline-offset-2 md:min-h-8"
        >
          Doesn&apos;t apply to us
        </button>
      )}
    </li>
  );
}
