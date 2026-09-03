'use client';

/**
 * Step 3 of the builder — place fields on the document.
 *
 * It owns only editor-local state (which page is showing, what is armed, what
 * is selected). The fields themselves belong to the caller, because the caller
 * is what knows how to persist them, and the caller also owns the header, the
 * navigation and the save — this is a step inside a flow, not a screen.
 *
 * `signerRoles` carries RECIPIENT ids rather than role strings. Two recipients
 * may share a role and a role may be renamed, so a field keyed on a role would
 * follow the wrong person; `roleLabels` is what the author actually reads.
 *
 * The source is whichever the caller has: bytes for a file still on disk, a
 * presigned URL for one already in storage. `PdfViewer` takes either.
 */

import { useCallback, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import type { EsignFieldDefinition, EsignFieldType } from '@propertypro/shared';
import { FieldOverlay } from '@/components/esign/field-overlay';
import { FieldPalette } from '@/components/esign/field-palette';

// pdfjs-dist has top-level side effects that crash during SSR — skip SSR entirely
const PdfViewer = dynamic(
  () => import('@/components/pdf/pdf-viewer').then((m) => m.PdfViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center p-12">
        <div className="text-sm text-content-tertiary">Loading PDF viewer…</div>
      </div>
    ),
  },
);

interface PageDimension {
  width: number;
  height: number;
}

export interface TemplateFieldEditorProps {
  /** Shown above the document so the author knows what they are editing. */
  templateName: string;
  /** Raw bytes (a file still on disk). Wins over `pdfUrl`. */
  pdfData?: Uint8Array | null;
  /** Presigned URL (a document already in storage). */
  pdfUrl?: string | null;
  /** Recipient ids, in the order they were added. */
  signerRoles: string[];
  /** Recipient id → the name to show for it. */
  roleLabels: Record<string, string>;
  /** Recipient id → its swatch colour. */
  roleColors: Record<string, string>;
  fields: EsignFieldDefinition[];
  onFieldsChange: (next: EsignFieldDefinition[]) => void;
  /**
   * A click on the page, as a percentage of it. Centring and clamping live in
   * `builder-state`, so the geometry has one owner and one set of tests.
   */
  onFieldPlace: (input: {
    recipientId: string;
    type: EsignFieldType;
    page: number;
    x: number;
    y: number;
  }) => void;
}

export function TemplateFieldEditor({
  templateName,
  pdfData,
  pdfUrl,
  signerRoles,
  roleLabels,
  roleColors,
  fields,
  onFieldsChange,
  onFieldPlace,
}: TemplateFieldEditorProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const [pageDimensions, setPageDimensions] = useState<PageDimension[]>([]);
  const [activeRole, setActiveRole] = useState(signerRoles[0] ?? '');
  const [activeFieldType, setActiveFieldType] = useState<EsignFieldType | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);

  // A recipient removed on step 2 must not stay armed on step 3.
  const effectiveRole = signerRoles.includes(activeRole) ? activeRole : (signerRoles[0] ?? '');

  const fieldCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const role of signerRoles) {
      counts[role] = fields.filter((f) => f.signerRole === role).length;
    }
    return counts;
  }, [signerRoles, fields]);

  const handleDocumentLoad = useCallback(
    (meta: { totalPages: number; pageDimensions: PageDimension[] }) => {
      setPageDimensions(meta.pageDimensions);
    },
    [],
  );

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!activeFieldType || !effectiveRole) return;

      const rect = e.currentTarget.getBoundingClientRect();
      if (!pageDimensions[currentPage]) return;

      onFieldPlace({
        recipientId: effectiveRole,
        type: activeFieldType,
        page: currentPage,
        x: ((e.clientX - rect.left) / rect.width) * 100,
        y: ((e.clientY - rect.top) / rect.height) * 100,
      });
      setActiveFieldType(null);
    },
    [activeFieldType, effectiveRole, currentPage, pageDimensions, onFieldPlace],
  );

  const handleFieldUpdate = useCallback(
    (
      fieldId: string,
      update: Partial<Pick<EsignFieldDefinition, 'x' | 'y' | 'width' | 'height'>>,
    ) => {
      onFieldsChange(fields.map((f) => (f.id === fieldId ? { ...f, ...update } : f)));
    },
    [fields, onFieldsChange],
  );

  const handleFieldRemove = useCallback(
    (fieldId: string) => {
      onFieldsChange(fields.filter((f) => f.id !== fieldId));
      setSelectedFieldId(null);
    },
    [fields, onFieldsChange],
  );

  const handleFieldSelect = useCallback((fieldId: string) => {
    setSelectedFieldId(fieldId || null);
  }, []);

  const currentDimensions = pageDimensions[currentPage] ?? { width: 612, height: 792 };
  const hasDocument = Boolean(pdfData || pdfUrl);

  return (
    <div className="overflow-hidden rounded-lg border border-edge-subtle">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-edge-subtle bg-surface-card px-4 py-3">
        <span className="truncate text-sm font-medium text-content">{templateName}</span>
        <span className="text-xs tabular-nums text-content-tertiary">
          {fields.length} field{fields.length === 1 ? '' : 's'} placed
        </span>
      </div>

      {/*
        A fixed viewport height was the old shape here, and its arithmetic never
        reconciled: the editor sits inside the shell's gutter, a top bar and a
        breadcrumb strip, so `100vh - 4rem` was always wrong by whatever those
        came to. A plain min-height lets the step size itself and lets the page
        scroll as one thing.
      */}
      <div className="flex min-h-[32rem] flex-col lg:flex-row">
        <div className="shrink-0 border-b border-edge-subtle bg-surface-page p-4 lg:border-b-0 lg:border-r">
          <FieldPalette
            signerRoles={signerRoles}
            roleLabels={roleLabels}
            activeRole={effectiveRole}
            onRoleChange={setActiveRole}
            activeFieldType={activeFieldType}
            onFieldTypeSelect={setActiveFieldType}
            fieldCounts={fieldCounts}
            signerRoleColors={roleColors}
          />
        </div>

        <div
          className="flex-1 overflow-auto bg-surface-page p-6"
          onClick={activeFieldType ? handleOverlayClick : undefined}
          style={{ cursor: activeFieldType ? 'crosshair' : undefined }}
        >
          {hasDocument ? (
            <PdfViewer
              {...(pdfData ? { pdfData } : { pdfUrl: pdfUrl as string })}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
              onDocumentLoad={handleDocumentLoad}
              scale={1}
            >
              <FieldOverlay
                fields={fields}
                pageDimensions={currentDimensions}
                currentPage={currentPage}
                mode="edit"
                selectedFieldId={selectedFieldId}
                onFieldSelect={handleFieldSelect}
                onFieldUpdate={handleFieldUpdate}
                onFieldRemove={handleFieldRemove}
                signerRoleColors={roleColors}
              />
            </PdfViewer>
          ) : (
            <p className="p-12 text-center text-sm text-content-secondary">
              Choose a document first.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
