'use client';

/**
 * TemplateEditClient — edit an existing template's details and fields.
 *
 * The server side of this already existed and was unreachable: `PATCH
 * /api/v1/esign/templates/[id]` accepts and validates `fieldsSchema`, `name`
 * and `description`, and `useUpdateEsignTemplate` was a correct client for it
 * with no call sites. "Edit Fields" on the detail page pointed at the blank
 * new-template builder instead.
 *
 * Two phases, mirroring the builder: details, then the shared field editor.
 * Unlike the builder it needs no upload — the stored PDF is rendered from the
 * presigned URL the detail page already uses.
 *
 * PATCH accepts neither `sourceDocumentPath` nor `templateType`, so the
 * document itself and the template's type cannot be changed here.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, ChevronLeft } from 'lucide-react';
import type { EsignFieldDefinition, EsignFieldsSchema } from '@propertypro/shared';
import { PageHeader } from '@/components/shared/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { TemplateFieldEditor } from '@/components/esign/template-field-editor';
import { useEsignTemplate, useUpdateEsignTemplate } from '@/hooks/use-esign-templates';
import { useEsignTemplatePdfUrl } from '@/hooks/use-esign-template-pdf';
import {
  describeInFlightSignatures,
  templateFieldsAreEditable,
  templateHasSourceDocument,
} from '@/lib/esign/template-readiness';

interface TemplateEditClientProps {
  communityId: number;
  templateId: number;
}

/** A template with no schema is legal; it simply cannot be sent yet. */
const DEFAULT_SIGNER_ROLES = ['signer'];

export function TemplateEditClient({ communityId, templateId }: TemplateEditClientProps) {
  const router = useRouter();
  const { data: template, isLoading, error } = useEsignTemplate(communityId, templateId);
  const updateTemplate = useUpdateEsignTemplate(communityId);

  const [phase, setPhase] = useState<1 | 2>(1);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [fields, setFields] = useState<EsignFieldDefinition[]>([]);
  const [signerRoles, setSignerRoles] = useState<string[]>(DEFAULT_SIGNER_ROLES);
  const [seededId, setSeededId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const canEditFields = template ? templateFieldsAreEditable(template) : false;
  const hasDocument = template ? templateHasSourceDocument(template) : false;
  const inFlightCount =
    typeof template?.inFlightSubmissionCount === 'number'
      ? template.inFlightSubmissionCount
      : 0;

  const { data: pdf } = useEsignTemplatePdfUrl({
    communityId,
    templateId,
    enabled: hasDocument,
  });

  // Seed once, when the record arrives. Keyed on the row id so a refetch
  // cannot discard edits in progress.
  useEffect(() => {
    if (!template || seededId === template.id) return;
    const schema = template.fieldsSchema as EsignFieldsSchema | null;
    setName(String(template.name ?? ''));
    setDescription(String(template.description ?? ''));
    setFields(schema?.fields ?? []);
    setSignerRoles(
      schema?.signerRoles && schema.signerRoles.length > 0
        ? schema.signerRoles
        : DEFAULT_SIGNER_ROLES,
    );
    setSeededId(template.id);
  }, [template, seededId]);

  const handleSave = useCallback(async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await updateTemplate.mutateAsync({
        templateId,
        name: name.trim(),
        description: description.trim(),
        fieldsSchema: { version: 1, fields, signerRoles },
      });
      router.push(`/esign/templates/${templateId}?communityId=${communityId}`);
    } catch {
      // Surfaced through the mutation's error state in the editor header.
    } finally {
      setSaving(false);
    }
  }, [
    name,
    description,
    fields,
    signerRoles,
    templateId,
    communityId,
    router,
    updateTemplate,
  ]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !template) {
    return (
      <div className="mx-auto max-w-2xl py-10 text-center">
        <p className="text-sm text-[var(--status-danger)]">
          {error?.message ?? 'Template not found'}
        </p>
        <Link
          href={`/esign/templates?communityId=${communityId}`}
          className="mt-4 inline-flex items-center gap-1 text-sm text-[var(--interactive-primary)] hover:underline"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Back to Templates
        </Link>
      </div>
    );
  }

  if (phase === 2) {
    return (
      <TemplateFieldEditor
        templateName={name}
        pdfUrl={pdf?.pdfUrl ?? null}
        signerRoles={signerRoles}
        fields={fields}
        onFieldsChange={setFields}
        onSave={() => void handleSave()}
        saving={saving || updateTemplate.isPending}
        errorMessage={updateTemplate.error?.message ?? null}
        onBack={() => setPhase(1)}
        backLabel="Details"
        saveLabel="Save Changes"
        savingLabel="Saving..."
      />
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title={`Edit ${template.name}`}
        actions={
          <Link
            href={`/esign/templates/${templateId}?communityId=${communityId}`}
            className="inline-flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            Back to Template
          </Link>
        }
      />

      {/* Why the editor is unreachable, when it is. */}
      {!canEditFields && (
        <div
          role="status"
          className="rounded-lg border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-4 py-3 text-sm text-[var(--status-warning)]"
        >
          <span className="font-medium">
            Fields are locked: {describeInFlightSignatures(inFlightCount)}.
          </span>{' '}
          Changing them now would change the document under the people signing
          it. Clone this template and edit the copy instead.
        </div>
      )}

      {canEditFields && !hasDocument && (
        <div
          role="status"
          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-3 text-sm text-[var(--text-secondary)]"
        >
          This template has no PDF, so there is nothing to place fields on. You
          can still rename it below.
        </div>
      )}

      <div className="space-y-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5">
        <label className="block">
          <span className="text-sm font-medium text-[var(--text-primary)]">
            Template Name
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            className="mt-1 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2 text-sm text-[var(--text-primary)] focus-visible:border-[var(--interactive-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--interactive-primary)]"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-[var(--text-primary)]">
            Description
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={2000}
            className="mt-1 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2 text-sm text-[var(--text-primary)] focus-visible:border-[var(--interactive-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--interactive-primary)]"
          />
        </label>

        <div className="flex items-center justify-end gap-3 border-t border-[var(--border-subtle)] pt-4">
          {canEditFields && hasDocument ? (
            <button
              type="button"
              onClick={() => setPhase(2)}
              disabled={!name.trim()}
              className="inline-flex items-center gap-2 rounded-md bg-[var(--interactive-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--interactive-primary-hover)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Continue to Editor
              <ArrowRight className="size-4" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={!name.trim() || saving || updateTemplate.isPending}
              className="inline-flex items-center gap-2 rounded-md bg-[var(--interactive-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--interactive-primary-hover)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Save Changes
            </button>
          )}
        </div>

        {updateTemplate.error && (
          <p className="text-sm text-[var(--status-danger)]">
            {updateTemplate.error.message}
          </p>
        )}
      </div>
    </div>
  );
}
