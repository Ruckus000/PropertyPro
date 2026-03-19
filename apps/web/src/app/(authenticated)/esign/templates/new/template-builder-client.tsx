'use client';

/**
 * TemplateBuilderClient — Two-phase e-sign template builder.
 *
 * Phase 1 (Setup): Template metadata + PDF upload + signer roles.
 * Phase 2 (Editor): Full-width layout with FieldPalette sidebar, PdfViewer,
 *   and FieldOverlay in edit mode.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  Loader2,
  Plus,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  ESIGN_TEMPLATE_TYPES,
  type EsignFieldDefinition,
  type EsignFieldType,
  type EsignFieldsSchema,
  type EsignTemplateType,
} from '@propertypro/shared';
import dynamic from 'next/dynamic';
import { useCreateEsignTemplate } from '@/hooks/use-esign-templates';
import { FieldOverlay } from '@/components/esign/field-overlay';
import { FieldPalette } from '@/components/esign/field-palette';

// pdfjs-dist has top-level side effects that crash during SSR — skip SSR entirely
const PdfViewer = dynamic(
  () => import('@/components/esign/pdf-viewer').then((m) => m.PdfViewer),
  { ssr: false, loading: () => <div className="flex items-center justify-center p-12"><div className="text-sm text-[var(--text-tertiary)]">Loading PDF viewer...</div></div> },
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TemplateBuilderClientProps {
  communityId: number;
}

interface PageDimension {
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SIGNER_ROLE_COLORS = [
  '#2563eb', // blue
  '#dc2626', // red
  '#16a34a', // green
  '#9333ea', // purple
  '#ea580c', // orange
  '#0891b2', // cyan
  '#be185d', // pink
  '#854d0e', // amber
];

const TYPE_LABELS: Record<string, string> = {
  proxy: 'Proxy',
  consent: 'Consent',
  lease_addendum: 'Lease Addendum',
  maintenance_auth: 'Maintenance Auth',
  violation_ack: 'Violation Acknowledgment',
  assessment_agreement: 'Assessment Agreement',
  custom: 'Custom',
};

/** Default field sizes (percentage of page) by type. */
const DEFAULT_FIELD_SIZE: Record<EsignFieldType, { w: number; h: number }> = {
  signature: { w: 20, h: 5 },
  initials: { w: 10, h: 5 },
  date: { w: 15, h: 4 },
  text: { w: 25, h: 4 },
  checkbox: { w: 4, h: 4 },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TemplateBuilderClient({
  communityId,
}: TemplateBuilderClientProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const createTemplate = useCreateEsignTemplate(communityId);

  // -----------------------------------------------------------------------
  // Phase state
  // -----------------------------------------------------------------------
  const [phase, setPhase] = useState<1 | 2>(1);

  // -----------------------------------------------------------------------
  // Phase 1 — Setup form state
  // -----------------------------------------------------------------------
  const [name, setName] = useState('');
  const [templateType, setTemplateType] = useState<EsignTemplateType>('custom');
  const [description, setDescription] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [signerRoles, setSignerRoles] = useState<string[]>(['signer']);
  const [newRoleInput, setNewRoleInput] = useState('');

  // -----------------------------------------------------------------------
  // Phase 2 — Editor state
  // -----------------------------------------------------------------------
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [pageDimensions, setPageDimensions] = useState<PageDimension[]>([]);
  const [fields, setFields] = useState<EsignFieldDefinition[]>([]);
  const [activeRole, setActiveRole] = useState('signer');
  const [activeFieldType, setActiveFieldType] = useState<EsignFieldType | null>(
    null,
  );
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // -----------------------------------------------------------------------
  // Signer role color map
  // -----------------------------------------------------------------------
  const signerRoleColors = useMemo(() => {
    const map: Record<string, string> = {};
    signerRoles.forEach((role, i) => {
      map[role] = SIGNER_ROLE_COLORS[i % SIGNER_ROLE_COLORS.length]!;
    });
    return map;
  }, [signerRoles]);

  // -----------------------------------------------------------------------
  // Field counts per role
  // -----------------------------------------------------------------------
  const fieldCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const role of signerRoles) {
      counts[role] = fields.filter((f) => f.signerRole === role).length;
    }
    return counts;
  }, [fields, signerRoles]);

  // -----------------------------------------------------------------------
  // PDF upload handler
  // -----------------------------------------------------------------------
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.type !== 'application/pdf') {
        alert('Please select a PDF file.');
        return;
      }
      setPdfFile(file);
      // Create a local blob URL for preview
      const url = URL.createObjectURL(file);
      setPdfUrl(url);
    },
    [],
  );

  // -----------------------------------------------------------------------
  // Signer role management
  // -----------------------------------------------------------------------
  const addSignerRole = useCallback(() => {
    const role = newRoleInput.trim().toLowerCase().replace(/\s+/g, '_');
    if (!role || signerRoles.includes(role)) return;
    setSignerRoles((prev) => [...prev, role]);
    setNewRoleInput('');
  }, [newRoleInput, signerRoles]);

  const removeSignerRole = useCallback(
    (role: string) => {
      if (signerRoles.length <= 1) return;
      setSignerRoles((prev) => prev.filter((r) => r !== role));
      setFields((prev) => prev.filter((f) => f.signerRole !== role));
      if (activeRole === role) {
        setActiveRole(signerRoles.find((r) => r !== role) ?? 'signer');
      }
    },
    [signerRoles, activeRole],
  );

  // -----------------------------------------------------------------------
  // Phase transition
  // -----------------------------------------------------------------------
  const canProceedToEditor = name.trim() && pdfUrl;

  const goToEditor = useCallback(() => {
    if (!canProceedToEditor) return;
    setActiveRole(signerRoles[0]!);
    setPhase(2);
  }, [canProceedToEditor, signerRoles]);

  // -----------------------------------------------------------------------
  // Document load handler
  // -----------------------------------------------------------------------
  const handleDocumentLoad = useCallback(
    (meta: { totalPages: number; pageDimensions: PageDimension[] }) => {
      setTotalPages(meta.totalPages);
      setPageDimensions(meta.pageDimensions);
    },
    [],
  );

  // -----------------------------------------------------------------------
  // Field placement — click on PDF to add field
  // -----------------------------------------------------------------------
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

      setFields((prev) => [...prev, newField]);
      setSelectedFieldId(newField.id);
      setActiveFieldType(null);
    },
    [activeFieldType, activeRole, currentPage, pageDimensions],
  );

  // -----------------------------------------------------------------------
  // Field operations
  // -----------------------------------------------------------------------
  const handleFieldUpdate = useCallback(
    (
      fieldId: string,
      update: Partial<Pick<EsignFieldDefinition, 'x' | 'y' | 'width' | 'height'>>,
    ) => {
      setFields((prev) =>
        prev.map((f) => (f.id === fieldId ? { ...f, ...update } : f)),
      );
    },
    [],
  );

  const handleFieldRemove = useCallback((fieldId: string) => {
    setFields((prev) => prev.filter((f) => f.id !== fieldId));
    setSelectedFieldId(null);
  }, []);

  const handleFieldSelect = useCallback((fieldId: string) => {
    setSelectedFieldId(fieldId || null);
  }, []);

  // -----------------------------------------------------------------------
  // Save template
  // -----------------------------------------------------------------------
  const handleSave = useCallback(async () => {
    if (!pdfFile || !name.trim()) return;

    setSaving(true);
    try {
      // Upload PDF to get storage path (simplified: use filename for now)
      // In production, this uploads to Supabase Storage first.
      const storagePath = `esign-templates/${communityId}/${Date.now()}-${pdfFile.name}`;

      const fieldsSchema: EsignFieldsSchema = {
        version: 1,
        fields,
        signerRoles,
      };

      await createTemplate.mutateAsync({
        name: name.trim(),
        templateType,
        sourceDocumentPath: storagePath,
        fieldsSchema,
        description: description.trim() || undefined,
      });

      router.push(`/esign/templates?communityId=${communityId}`);
    } catch {
      // Error is surfaced via mutation state
    } finally {
      setSaving(false);
    }
  }, [
    pdfFile,
    name,
    communityId,
    fields,
    signerRoles,
    templateType,
    description,
    createTemplate,
    router,
  ]);

  // -----------------------------------------------------------------------
  // Phase 1 — Setup UI
  // -----------------------------------------------------------------------
  if (phase === 1) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Back link */}
        <Link
          href={`/esign/templates?communityId=${communityId}`}
          className="inline-flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <ChevronLeft className="size-4" />
          Back to Templates
        </Link>

        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
          Create Template
        </h1>

        <div className="space-y-5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-6">
          {/* Name */}
          <div>
            <label
              htmlFor="template-name"
              className="mb-1 block text-sm font-medium text-[var(--text-primary)]"
            >
              Template Name <span className="text-[var(--status-danger)]">*</span>
            </label>
            <input
              id="template-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Proxy Ballot 2026"
              className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--interactive-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--interactive-primary)]"
            />
          </div>

          {/* Template Type */}
          <div>
            <label
              htmlFor="template-type"
              className="mb-1 block text-sm font-medium text-[var(--text-primary)]"
            >
              Template Type
            </label>
            <select
              id="template-type"
              value={templateType}
              onChange={(e) =>
                setTemplateType(e.target.value as EsignTemplateType)
              }
              className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--interactive-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--interactive-primary)]"
            >
              {ESIGN_TEMPLATE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t] ?? t}
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor="template-desc"
              className="mb-1 block text-sm font-medium text-[var(--text-primary)]"
            >
              Description
            </label>
            <textarea
              id="template-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Optional description of this template..."
              className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--interactive-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--interactive-primary)]"
            />
          </div>

          {/* PDF Upload */}
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text-primary)]">
              PDF Document <span className="text-[var(--status-danger)]">*</span>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={handleFileChange}
              className="hidden"
            />
            {pdfFile ? (
              <div className="flex items-center gap-3 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-4 py-3">
                <span className="flex-1 truncate text-sm text-[var(--text-primary)]">
                  {pdfFile.name}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setPdfFile(null);
                    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
                    setPdfUrl(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="text-[var(--text-tertiary)] hover:text-[var(--status-danger)] transition-colors"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-md border-2 border-dashed border-[var(--border-subtle)] bg-[var(--surface-card)] py-8 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--interactive-primary)] hover:text-[var(--interactive-primary)]"
              >
                <Upload className="size-5" />
                Click to upload a PDF
              </button>
            )}
          </div>

          {/* Signer Roles */}
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text-primary)]">
              Signer Roles
            </label>
            <p className="mb-2 text-xs text-[var(--text-tertiary)]">
              Define the roles that will sign this document (e.g., owner, board_president).
            </p>
            <div className="space-y-2">
              {signerRoles.map((role, idx) => (
                <div
                  key={role}
                  className="flex items-center gap-2 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-3 py-2"
                >
                  <span
                    className="size-3 shrink-0 rounded-full"
                    style={{
                      backgroundColor:
                        SIGNER_ROLE_COLORS[idx % SIGNER_ROLE_COLORS.length],
                    }}
                  />
                  <span className="flex-1 text-sm capitalize text-[var(--text-primary)]">
                    {role.replace(/_/g, ' ')}
                  </span>
                  {signerRoles.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSignerRole(role)}
                      className="text-[var(--text-tertiary)] hover:text-[var(--status-danger)] transition-colors"
                      aria-label={`Remove ${role}`}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              ))}

              {/* Add role input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newRoleInput}
                  onChange={(e) => setNewRoleInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addSignerRole();
                    }
                  }}
                  placeholder="Add a signer role..."
                  className="flex-1 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--interactive-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--interactive-primary)]"
                />
                <button
                  type="button"
                  onClick={addSignerRole}
                  disabled={!newRoleInput.trim()}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-subtle)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Plus className="size-4" />
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Continue button */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={goToEditor}
            disabled={!canProceedToEditor}
            className="inline-flex items-center gap-2 rounded-md bg-[var(--interactive-primary)] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--interactive-primary-hover)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Continue to Editor
            <ArrowRight className="size-4" />
          </button>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Phase 2 — Editor UI
  // -----------------------------------------------------------------------

  const currentDimensions = pageDimensions[currentPage] ?? {
    width: 612,
    height: 792,
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Editor header */}
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setPhase(1)}
            className="inline-flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <ArrowLeft className="size-4" />
            Setup
          </button>
          <span className="text-sm font-medium text-[var(--text-primary)]">
            {name}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--text-tertiary)]">
            {fields.length} field{fields.length !== 1 ? 's' : ''} placed
          </span>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || fields.length === 0}
            className="inline-flex items-center gap-2 rounded-md bg-[var(--interactive-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--interactive-primary-hover)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            {saving ? 'Saving...' : 'Save Template'}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {createTemplate.error && (
        <div className="border-b border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-2 text-sm text-[var(--status-danger)]">
          {createTemplate.error.message}
        </div>
      )}

      {/* Editor body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
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

        {/* PDF viewer area */}
        <div
          className="flex-1 overflow-auto bg-[var(--surface-page)] p-6"
          onClick={activeFieldType ? handleOverlayClick : undefined}
          style={{ cursor: activeFieldType ? 'crosshair' : undefined }}
        >
          {pdfUrl && (
            <PdfViewer
              pdfUrl={pdfUrl}
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
