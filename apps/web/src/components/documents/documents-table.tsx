'use client';

/**
 * The library as one table: the files, and the statutory records that have no
 * file yet.
 *
 * Replaces `document-list.tsx`, which could only show files. A row here is a
 * `LibraryRow` — either a document or a gap — and every claim it makes comes
 * from `lib/documents/document-state.ts` rather than being computed in a cell.
 *
 * The title is a real `<button>`, not a clickable `<tr>`. The list this
 * replaces put an `onClick` on a bare row with no role, no `tabIndex` and no key
 * handler, so no keyboard user could open a document at all.
 *
 * **No pagination, deliberately.** `DataTable` renders `DataTablePagination`
 * only when BOTH `pagination` and `onPaginationChange` are supplied, and it sets
 * `manualPagination` with no `getPaginationRowModel` — so its pagination is
 * server-driven and there is no client-side slicing to opt into. The list this
 * replaces rendered every row too, so this is unchanged behaviour; the real
 * ceiling is `walkPaginated`'s 2000-row cap in `useDocuments`.
 */

import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, FileText } from 'lucide-react';
import { useMemo } from 'react';
import { DataTable } from '@/components/shared/data-table';
import { formatBytes } from '@/lib/utils/format-bytes';
import type { DocumentRow, DocumentState, LibraryRow } from '@/lib/documents/document-state';
import { ExtractionStatusBadge } from './extraction-status-badge';

/**
 * Fully spelled, never assembled. Tailwind's scanner cannot see a class built
 * at runtime (`bg-status-${tone}`), and `guard:class-resolution` fails on it.
 */
const STATE_DISPLAY: Record<DocumentState, { label: string; className: string }> = {
  public: { label: 'On the public site', className: 'bg-status-success-bg text-status-success' },
  owed: { label: 'Owed to public site', className: 'bg-status-warning-bg text-status-warning' },
  private: { label: 'Owners only', className: 'bg-surface-muted text-content-secondary' },
  unlinked: { label: 'Not linked', className: 'bg-surface-muted text-content-secondary' },
};

function StateBadge({ state }: { state: DocumentState }) {
  const display = STATE_DISPLAY[state];
  return (
    <span
      data-testid="document-state"
      data-state={state}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${display.className}`}
    >
      {display.label}
    </span>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export interface DocumentsTableProps {
  rows: LibraryRow[];
  isLoading: boolean;
  selectedId: number | null;
  /**
   * Whether to paint the two statutory columns. False for a tenant (no
   * `compliance:read`) and for an apartment community (no `hasCompliance`) —
   * in both cases the checklist was never fetched, so every row would read
   * "Not linked" and invent a coverage story that does not exist.
   */
  showStatutoryColumns: boolean;
  categoryNameById: Map<number, string>;
  onSelectDocument: (document: DocumentRow) => void;
  emptyAction?: React.ReactNode;
}

export function DocumentsTable({
  rows,
  isLoading,
  selectedId,
  showStatutoryColumns,
  categoryNameById,
  onSelectDocument,
  emptyAction,
}: DocumentsTableProps) {
  const columns = useMemo<ColumnDef<LibraryRow, unknown>[]>(() => {
    const base: ColumnDef<LibraryRow, unknown>[] = [
      {
        id: 'record',
        header: 'Record',
        cell: ({ row }) => {
          const item = row.original;

          if (item.kind === 'gap') {
            return (
              <div className="flex items-start gap-2">
                <AlertTriangle
                  className="mt-0.5 size-4 shrink-0 text-status-warning"
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="font-medium text-content">No file on record</p>
                  <p className="truncate text-xs text-content-secondary">
                    {item.requirement.title}
                  </p>
                </div>
              </div>
            );
          }

          const { document } = item;
          return (
            <div className="flex items-start gap-2">
              <FileText
                className="mt-0.5 size-4 shrink-0 text-content-tertiary"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={() => onSelectDocument(document)}
                  aria-pressed={selectedId === document.id}
                  className="truncate text-left font-medium text-content hover:text-interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
                >
                  {document.title}
                </button>
                <p className="flex items-center gap-2 text-xs text-content-secondary">
                  <span className="truncate">
                    {document.fileName} · {formatBytes(document.fileSize)}
                  </span>
                  <ExtractionStatusBadge status={document.extractionStatus} />
                </p>
              </div>
            </div>
          );
        },
      },
      {
        id: 'category',
        header: 'Category',
        cell: ({ row }) => {
          const item = row.original;
          const name =
            item.kind === 'gap'
              ? item.requirement.category.replace(/_/g, ' ')
              : item.document.categoryId != null
                ? categoryNameById.get(item.document.categoryId)
                : null;
          return <span className="capitalize text-content-secondary">{name ?? '—'}</span>;
        },
      },
    ];

    const statutory: ColumnDef<LibraryRow, unknown>[] = [
      {
        id: 'requirement',
        header: 'Statutory record',
        cell: ({ row }) => {
          // Both row kinds carry `requirement`; only a document's can be null.
          const { requirement } = row.original;
          if (!requirement) {
            return <span className="text-content-tertiary">—</span>;
          }
          return (
            <div className="min-w-0">
              <p className="truncate text-content">{requirement.title}</p>
              {requirement.statuteReference && (
                <p className="truncate text-xs tabular-nums text-content-tertiary">
                  {requirement.statuteReference}
                </p>
              )}
            </div>
          );
        },
      },
      {
        id: 'state',
        header: 'State',
        cell: ({ row }) => {
          const item = row.original;
          if (item.kind === 'gap') {
            return (
              <span
                data-testid="document-state"
                data-state="gap"
                className="inline-flex items-center rounded-full bg-status-danger-bg px-2 py-0.5 text-xs font-medium text-status-danger"
              >
                Missing
              </span>
            );
          }
          return <StateBadge state={item.state} />;
        },
      },
    ];

    const updated: ColumnDef<LibraryRow, unknown> = {
      id: 'updated',
      header: 'Added',
      cell: ({ row }) => {
        const item = row.original;
        return (
          <span className="whitespace-nowrap tabular-nums text-content-secondary">
            {item.kind === 'gap' ? '—' : formatDate(item.document.createdAt)}
          </span>
        );
      },
    };

    return showStatutoryColumns ? [...base, ...statutory, updated] : [...base, updated];
  }, [categoryNameById, onSelectDocument, selectedId, showStatutoryColumns]);

  return (
    <DataTable
      columns={columns}
      data={rows}
      isLoading={isLoading}
      emptyMessage="Nothing matches those filters."
      {...(emptyAction ? { emptyAction } : {})}
      getRowId={(row) => `${row.kind}-${row.id}`}
    />
  );
}
