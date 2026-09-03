'use client';

/**
 * The field editor, shared by template creation and template editing.
 *
 * It was previously phase 2 of `template-builder-client.tsx`, which bound it
 * to a freshly picked local `File`: the phase rendered only under
 * `{pdfData && …}` and the save handler returned early without one. Nothing
 * about placing fields needs a local file — `PdfViewer` accepts either raw
 * bytes or a URL, and `FieldOverlay` needs no document at all — so the editor
 * takes whichever source its caller has: bytes when creating from an upload,
 * a presigned URL when editing a template already in storage.
 *
 * It owns only editor-local state (which page, what is armed, what is
 * selected). Fields are lifted to the caller, because the caller is what
 * knows how to persist them.
 */

import { useCallback, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import type { EsignFieldDefinition, EsignFieldType } from '@propertypro/shared';
import { FieldOverlay } from '@/components/esign/field-overlay';
import { FieldPalette } from '@/components/esign/field-palette';
import { ESIGN_FIELD_COLORS } from '@/components/esign/esign-field-colors';

// pdfjs-dist has top-level side effects that crash during SSR — skip SSR entirely
const PdfViewer = dynamic(
  () => import('@/components/pdf/pdf-viewer').then((m) => m.PdfViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center p-12">
        <div className="text-sm text-[var(--text-tertiary)]">Loading PDF viewer...</div>
      </div>
    ),
  },
);

interface PageDimension {
  width: number;
  height: number;
}

/** Default field sizes (percentage of page) by type. */
const DEFAULT_FIELD_SIZE: Record<EsignFieldType, { w: number; h: number }> = {
  signature: { w: 20, h: 5 },
  initials: { w: 10, h: 5 },
  date: { w: 15, h: 4 },
  text: { w: 25, h: 4 },
  checkbox: { w: 4, h: 4 },
};

export interface TemplateFieldEditorProps {
  /** Shown in the editor header so the author knows what they are editing. */
  templateName: string;
  /** Raw bytes (creation, from a local upload). Wins over `pdfUrl`. */
  pdfData?: Uint8Array | null;
  /** Presigned URL (editing a template already in storage). */
  pdfUrl?: string | null;
  signerRoles: string[];
  fields: EsignFieldDefinition[];
  onFieldsChange: (next: EsignFieldDefinition[]) => void;
  onSave: () => void;
  saving: boolean;
  errorMessage?: string | null;
  onBack: () => void;
  backLabel: string;
  saveLabel: string;
  savingLabel: string;
}

export function TemplateFieldEditor({
  templateName,
  pdfData,
  pdfUrl,
  signerRoles,
  fields,
  onFieldsChange,
  onSave,
  saving,
  errorMessage,
  onBack,
  backLabel,
  saveLabel,
  savingLabel,
}: TemplateFieldEditorProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const [pageDimensions, setPageDimensions] = useState<PageDimension[]>([]);
  const [activeRole, setActiveRole] = useState(signerRoles[0] ?? 'signer');
  const [activeFieldType, setActiveFieldType] = useState<EsignFieldType | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);

  const signerRoleColors = useMemo(() => {
    const map: Record<string, string> = {};
    signerRoles.forEach((role, i) => {
      map[role] = ESIGN_FIELD_COLORS[i % ESIGN_FIELD_COLORS.length]!;
    });
    return map;
  }, [signerRoles]);

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
      if (!activeFieldType) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const dims = pageDimensions[currentPage];
      if (!dims) return;

      const clickX = ((e.clientX - rect.left) / rect.width) * 100;
      const clickY = ((e.clientY - rect.top) / rect.height) * 100;
      const size = DEFAULT_FIELD_SIZE[activeFieldType];

      const newField: EsignFieldDefinition = {
        id: crypto.randomUUID(),
        type: activeFieldType,
        signerRole: activeRole,
        page: currentPage,
        x: Math.max(0, Math.min(100 - size.w, clickX - size.w / 2)),
        y: Math.max(0, Math.min(100 - size.h, clickY - size.h / 2)),
        width: size.w,
        height: size.h,
        required: true,
      };

      onFieldsChange([...fields, newField]);
      setSelectedFieldId(newField.id);
      setActiveFieldType(null);
    },
    [activeFieldType, activeRole, currentPage, pageDimensions, fields, onFieldsChange],
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

  const currentDimensions = pageDimensions[currentPage] ?? {
    width: 612,
    height: 792,
  };

  const hasDocument = Boolean(pdfData || pdfUrl);

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Editor header */}
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {backLabel}
          </button>
          <span className="text-sm font-medium text-[var(--text-primary)]">
            {templateName}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--text-tertiary)]">
            {fields.length} field{fields.length !== 1 ? 's' : ''} placed
          </span>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || fields.length === 0}
            className="inline-flex items-center gap-2 rounded-md bg-[var(--interactive-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--interactive-primary-hover)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="size-4" aria-hidden="true" />
            )}
            {saving ? savingLabel : saveLabel}
          </button>
        </div>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="border-b border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-2 text-sm text-[var(--status-danger)]"
        >
          {errorMessage}
        </div>
      )}

      {/* Editor body */}
      <div className="flex flex-1 overflow-hidden">
        <div className="shrink-0 overflow-y-auto border-r border-[var(--border-subtle)] bg-[var(--surface-page)] p-4">
          <FieldPalette
            signerRoles={signerRoles}
            activeRole={activeRole}
            onRoleChange={setActiveRole}
            activeFieldType={activeFieldType}
            onFieldTypeSelect={setActiveFieldType}
            fieldCounts={fieldCounts}
            signerRoleColors={signerRoleColors}
          />
        </div>

        <div
          className="flex-1 overflow-auto bg-[var(--surface-page)] p-6"
          onClick={activeFieldType ? handleOverlayClick : undefined}
          style={{ cursor: activeFieldType ? 'crosshair' : undefined }}
        >
          {hasDocument && (
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
                signerRoleColors={signerRoleColors}
              />
            </PdfViewer>
          )}
        </div>
      </div>
    </div>
  );
}
