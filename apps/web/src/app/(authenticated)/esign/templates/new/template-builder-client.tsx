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
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Plus,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import {
  ESIGN_TEMPLATE_TYPES,
  type EsignFieldDefinition,
  type EsignFieldType,
  type EsignFieldsSchema,
  type EsignTemplateType,
} from '@propertypro/shared';
import {
  useCreateEsignTemplate,
  usePresignEsignTemplateUpload,
} from '@/hooks/use-esign-templates';
import { TemplateFieldEditor } from '@/components/esign/template-field-editor';
import { ESIGN_FIELD_COLORS } from '@/components/esign/esign-field-colors';

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

function buildUploadUrl(uploadUrl: string, token?: string): string {
  if (!token || uploadUrl.includes('token=')) {
    return uploadUrl;
  }

  return `${uploadUrl}${uploadUrl.includes('?') ? '&' : '?'}token=${token}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TemplateBuilderClient({
  communityId,
}: TemplateBuilderClientProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const createTemplate = useCreateEsignTemplate(communityId);
  const presignUpload = usePresignEsignTemplateUpload();

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
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null);
  const [signerRoles, setSignerRoles] = useState<string[]>(['signer']);
  const [newRoleInput, setNewRoleInput] = useState('');

  // -----------------------------------------------------------------------
  // Phase 2 — Editor state
  // -----------------------------------------------------------------------
  const [fields, setFields] = useState<EsignFieldDefinition[]>([]);
  const [saving, setSaving] = useState(false);

  // -----------------------------------------------------------------------
  // PDF upload handler
  // -----------------------------------------------------------------------
  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.type !== 'application/pdf') {
        alert('Please select a PDF file.');
        return;
      }
      setPdfFile(file);
      // Read file into Uint8Array for CSP-safe PDF.js preview (no blob: URLs)
      const buffer = await file.arrayBuffer();
      setPdfData(new Uint8Array(buffer));
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
    },
    [signerRoles],
  );

  // -----------------------------------------------------------------------
  // Phase transition
  // -----------------------------------------------------------------------
  const canProceedToEditor = name.trim() && pdfData;

  const goToEditor = useCallback(() => {
    if (!canProceedToEditor) return;
    setPhase(2);
  }, [canProceedToEditor]);

  // -----------------------------------------------------------------------
  // Save template
  // -----------------------------------------------------------------------
  const handleSave = useCallback(async () => {
    if (!pdfFile || !name.trim()) return;

    setSaving(true);
    try {
      const presigned = await presignUpload.mutateAsync({
        communityId,
        fileName: pdfFile.name,
        fileSize: pdfFile.size,
        mimeType: pdfFile.type || 'application/pdf',
      });
      const storagePath = presigned.path;
      const uploadUrl = buildUploadUrl(presigned.uploadUrl, presigned.token);

      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': pdfFile.type || 'application/pdf' },
        body: pdfFile,
      });

      if (!uploadRes.ok) {
        throw new Error('Failed to upload template PDF');
      }

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
    presignUpload,
    router,
  ]);

  // -----------------------------------------------------------------------
  // Phase 1 — Setup UI
  // -----------------------------------------------------------------------
  if (phase === 1) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <PageHeader
          title="Create Template"
        />

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
                    setPdfData(null);
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
                        ESIGN_FIELD_COLORS[idx % ESIGN_FIELD_COLORS.length],
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
  // Phase 2 — the shared field editor, driven by the uploaded bytes.
  // -----------------------------------------------------------------------

  return (
    <TemplateFieldEditor
      templateName={name}
      pdfData={pdfData}
      signerRoles={signerRoles}
      fields={fields}
      onFieldsChange={setFields}
      onSave={() => void handleSave()}
      saving={saving}
      errorMessage={createTemplate.error?.message ?? null}
      onBack={() => setPhase(1)}
      backLabel="Setup"
      saveLabel="Save Template"
      savingLabel="Saving..."
    />
  );
}
