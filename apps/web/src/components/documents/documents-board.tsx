'use client';

/**
 * The library as a lifecycle board.
 *
 * Columns are the statutory states a record can be in — no file, uploaded but
 * not public, on the public site, deleted — so the whole compliance posture
 * reads in one glance and acting on a record means moving it.
 *
 * ## Nothing commits on a drop
 *
 * A drop opens the SAME review dialog the inspector's buttons do. Putting a
 * document on the public site is the §718.111(12)(g) act and carries a
 * §718.111(12)(c) redaction gate; a gesture that published on release would be
 * the one interaction in this app where an accident is publication.
 *
 * ## Drag is an accelerator, never the only path
 *
 * Every card is a real `<button>` that selects the record, and every transition
 * the drag offers is also a verb in the inspector. That is the keyboard route —
 * `field-overlay.tsx` set the precedent that a drag in this codebase must have a
 * non-drag equivalent, and here the equivalent is the panel that was already
 * carrying those verbs.
 */

import { useState } from 'react';
import type {
  BoardColumn,
  BoardColumnId,
  DocumentRow,
  LibraryRow,
} from '@/lib/documents/document-state';

/** Fully spelled — `guard:class-resolution` fails on a runtime-built class. */
const COLUMN_TONE: Record<BoardColumnId, string> = {
  gap: 'border-status-danger-border',
  private: 'border-edge',
  public: 'border-status-success-border',
  deleted: 'border-edge-subtle',
};

const STATE_TONE: Record<string, string> = {
  public: 'bg-status-success-bg text-status-success',
  owed: 'bg-status-warning-bg text-status-warning',
  private: 'bg-surface-muted text-content-secondary',
  unlinked: 'bg-surface-muted text-content-secondary',
};

const STATE_LABEL: Record<string, string> = {
  public: 'public',
  owed: 'owed',
  private: 'owners only',
  unlinked: 'not linked',
};

export interface DocumentsBoardProps {
  columns: BoardColumn[];
  selectedId: number | null;
  canManage: boolean;
  onSelectDocument: (document: DocumentRow) => void;
  /**
   * A card was dropped on a column. The caller opens the matching review — this
   * component never mutates.
   */
  onMove: (document: DocumentRow, from: BoardColumnId, to: BoardColumnId) => void;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function DocumentsBoard({
  columns,
  selectedId,
  canManage,
  onSelectDocument,
  onMove,
}: DocumentsBoardProps) {
  const [dragging, setDragging] = useState<{ id: number; from: BoardColumnId } | null>(null);
  const [over, setOver] = useState<BoardColumnId | null>(null);

  const findDocument = (id: number): { document: DocumentRow; from: BoardColumnId } | null => {
    for (const column of columns) {
      const row = column.rows.find((r) => r.kind === 'document' && r.id === id);
      if (row && row.kind === 'document') return { document: row.document, from: column.id };
    }
    return null;
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {columns.map((column) => {
          const isTarget = canManage && over === column.id && dragging?.from !== column.id;
          return (
            <section
              key={column.id}
              aria-label={column.label}
              onDragOver={(event) => {
                if (!canManage || !dragging || column.id === 'gap') return;
                event.preventDefault();
                setOver(column.id);
              }}
              onDragLeave={() => setOver((current) => (current === column.id ? null : current))}
              onDrop={(event) => {
                event.preventDefault();
                setOver(null);
                if (!canManage || !dragging || column.id === 'gap') return;
                const found = findDocument(dragging.id);
                setDragging(null);
                if (!found || found.from === column.id) return;
                onMove(found.document, found.from, column.id);
              }}
              className={`rounded-md border bg-surface-card ${COLUMN_TONE[column.id]} ${
                isTarget ? 'ring-2 ring-interactive' : ''
              }`}
            >
              <header className="flex items-center justify-between border-b border-edge px-3 py-2">
                <h3 className="text-xs font-medium uppercase tracking-wide text-content-secondary">
                  {column.label}
                </h3>
                <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs tabular-nums text-content-secondary">
                  {column.rows.length}
                </span>
              </header>

              <div className="space-y-2 p-3">
                {column.rows.length === 0 && (
                  <p className="text-xs text-content-tertiary">{column.emptyText}</p>
                )}

                {column.rows.map((row) => (
                  <BoardCard
                    key={`${row.kind}-${row.id}`}
                    row={row}
                    selected={row.kind === 'document' && selectedId === row.id}
                    draggable={canManage && row.kind === 'document'}
                    onSelect={() => {
                      if (row.kind === 'document') onSelectDocument(row.document);
                    }}
                    onDragStart={() => setDragging({ id: row.id, from: column.id })}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-edge bg-surface-subtle px-3 py-2 text-xs text-content-secondary">
        <span>
          {canManage
            ? 'Drag a card between columns to change what the public can read.'
            : 'Select a record to see what state it is in.'}
        </span>
        <span className="tabular-nums">Every move is reviewed before it commits</span>
      </div>
    </div>
  );
}

function BoardCard({
  row,
  selected,
  draggable,
  onSelect,
  onDragStart,
  onDragEnd,
}: {
  row: LibraryRow;
  selected: boolean;
  draggable: boolean;
  onSelect: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  if (row.kind === 'gap') {
    return (
      <div className="rounded-md border border-dashed border-status-danger-border bg-status-danger-bg p-2">
        <p className="text-sm font-medium text-content">{row.requirement.title}</p>
        <p className="text-xs tabular-nums text-content-secondary">
          {row.requirement.statuteReference ?? 'No file on record'}
        </p>
      </div>
    );
  }

  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      aria-pressed={selected}
      className={`w-full rounded-md border p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive ${
        selected
          ? 'border-interactive bg-interactive-subtle'
          : 'border-edge bg-surface-card hover:bg-surface-hover'
      }`}
    >
      <span className="block truncate text-sm font-medium text-content">{row.document.title}</span>
      <span className="mt-1 flex items-center gap-2">
        <span
          data-testid="board-state"
          data-state={row.state}
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATE_TONE[row.state]}`}
        >
          {STATE_LABEL[row.state]}
        </span>
        <span className="truncate text-xs tabular-nums text-content-tertiary">
          {formatDate(row.document.createdAt)}
        </span>
      </span>
    </button>
  );
}
