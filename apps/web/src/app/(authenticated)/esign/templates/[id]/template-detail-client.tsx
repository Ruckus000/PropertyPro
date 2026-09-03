'use client';

/**
 * TemplateDetailClient — Read-only template preview with field overlay.
 *
 * Displays template metadata, PDF preview with field markers in view mode,
 * and action buttons (Send for Signing, Edit Fields, Clone, Archive).
 */

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Archive,
  ChevronLeft,
  Copy,
  Edit,
  Loader2,
  Send,
} from 'lucide-react';
import { Badge } from '@propertypro/ui';
import type { EsignFieldsSchema } from '@propertypro/shared';
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shared/page-header';
import {
  useEsignTemplate,
  useArchiveEsignTemplate,
  useCloneEsignTemplate,
} from '@/hooks/use-esign-templates';
import { useEsignTemplatePdfUrl } from '@/hooks/use-esign-template-pdf';
import { FieldOverlay } from '@/components/esign/field-overlay';
import { ESIGN_FIELD_COLORS } from '@/components/esign/esign-field-colors';
import {
  describeInFlightSignatures,
  templateFieldsAreEditable,
  templateHasSourceDocument,
} from '@/lib/esign/template-readiness';

const PdfViewer = dynamic(
  () => import('@/components/pdf/pdf-viewer').then((m) => m.PdfViewer),
  { ssr: false, loading: () => <div className="flex items-center justify-center p-12"><div className="text-sm text-[var(--text-tertiary)]">Loading PDF viewer...</div></div> },
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TemplateDetailClientProps {
  communityId: number;
  templateId: number;
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

const STATUS_VARIANT: Record<string, 'success' | 'neutral'> = {
  active: 'success',
  archived: 'neutral',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TemplateDetailClient({
  communityId,
  templateId,
}: TemplateDetailClientProps) {
  const router = useRouter();
  const {
    data: template,
    isLoading,
    error,
  } = useEsignTemplate(communityId, templateId);
  const archiveMutation = useArchiveEsignTemplate(communityId);
  const cloneMutation = useCloneEsignTemplate(communityId);

  const [currentPage, setCurrentPage] = useState(0);
  const [pageDimensions, setPageDimensions] = useState<PageDimension[]>([]);
  const [showCloneDialog, setShowCloneDialog] = useState(false);
  const [cloneName, setCloneName] = useState('');

  // Presigned PDF URL — fetched only when the template has a source document.
  const {
    data: pdfData,
    isLoading: pdfIsLoading,
    isFetching: pdfIsFetching,
    refetch: refetchPdf,
  } = useEsignTemplatePdfUrl({
    communityId,
    templateId,
    enabled: Boolean(template?.sourceDocumentPath),
  });
  const presignedPdfUrl = pdfData?.pdfUrl ?? null;

  // -----------------------------------------------------------------------
  // Derived state
  // -----------------------------------------------------------------------
  const fieldsSchema = template?.fieldsSchema as EsignFieldsSchema | null;
  const fields = fieldsSchema?.fields ?? [];
  const signerRoles = fieldsSchema?.signerRoles ?? [];

  const signerRoleColors = useMemo(() => {
    const map: Record<string, string> = {};
    signerRoles.forEach((role, i) => {
      map[role] = ESIGN_FIELD_COLORS[i % ESIGN_FIELD_COLORS.length]!;
    });
    return map;
  }, [signerRoles]);

  const currentDimensions = pageDimensions[currentPage] ?? {
    width: 612,
    height: 792,
  };

  // Which verbs this template can actually honour. Offering one the server
  // will refuse only moves the failure to the end of the work.
  const canSend = template ? templateHasSourceDocument(template) : false;
  const inFlightCount =
    typeof template?.inFlightSubmissionCount === 'number'
      ? template.inFlightSubmissionCount
      : 0;
  const fieldsEditable = template ? templateFieldsAreEditable(template) : false;

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------
  const handleDocumentLoad = useCallback(
    (meta: { totalPages: number; pageDimensions: PageDimension[] }) => {
      setPageDimensions(meta.pageDimensions);
    },
    [],
  );

  const handleArchive = useCallback(async () => {
    if (!confirm('Are you sure you want to archive this template?')) return;
    await archiveMutation.mutateAsync(templateId);
    router.push(`/esign/templates?communityId=${communityId}`);
  }, [archiveMutation, templateId, communityId, router]);

  const handleClone = useCallback(async () => {
    if (!cloneName.trim()) return;
    await cloneMutation.mutateAsync({ templateId, name: cloneName.trim() });
    setShowCloneDialog(false);
    setCloneName('');
    router.push(`/esign/templates?communityId=${communityId}`);
  }, [cloneMutation, templateId, cloneName, communityId, router]);

  // -----------------------------------------------------------------------
  // Loading / error states
  // -----------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
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
          <ChevronLeft className="size-4" />
          Back to Templates
        </Link>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={template.name}
        description={template.description ?? undefined}
        actions={
          <div className="flex items-center gap-2">
            <Badge
              variant={STATUS_VARIANT[template.status] ?? 'neutral'}
              size="sm"
            >
              {template.status}
            </Badge>
            {canSend && (
              <Link
                href={`/esign/submissions/new?communityId=${communityId}&templateId=${templateId}`}
                className="inline-flex items-center gap-2 rounded-md bg-[var(--interactive-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--interactive-primary-hover)]"
              >
                <Send className="size-4" />
                Send for Signing
              </Link>
            )}
            {fieldsEditable && (
              <Link
                href={`/esign/templates/${templateId}/edit?communityId=${communityId}`}
                className="inline-flex items-center gap-2 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-subtle)]"
              >
                <Edit className="size-4" />
                Edit Fields
              </Link>
            )}
            <button
              type="button"
              onClick={() => {
                setCloneName(`${template.name} (copy)`);
                setShowCloneDialog(true);
              }}
              className="inline-flex items-center gap-2 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-subtle)]"
            >
              <Copy className="size-4" />
              Clone
            </button>
            <button
              type="button"
              onClick={() => void handleArchive()}
              disabled={archiveMutation.isPending}
              className="inline-flex items-center gap-2 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2 text-sm font-medium text-[var(--status-danger)] transition-colors hover:bg-[var(--status-danger-bg)] disabled:opacity-40"
            >
              <Archive className="size-4" />
              Archive
            </button>
          </div>
        }
      />

      {/* Why Edit Fields is missing. The signing page reads the field schema
          live off the template on every open, so changing it mid-flight would
          change the document under the people signing it. */}
      {!fieldsEditable && (
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

      {/* Metadata panel */}
      <div className="grid grid-cols-4 gap-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
            Type
          </p>
          <p className="mt-1 text-sm text-[var(--text-primary)]">
            {TYPE_LABELS[template.templateType ?? ''] ??
              template.templateType ??
              'Unknown'}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
            Fields
          </p>
          <p className="mt-1 text-sm tabular-nums text-[var(--text-primary)]">
            {fields.length}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
            Signer Roles
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {signerRoles.map((role) => (
              <span
                key={role}
                className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-subtle)] px-2 py-0.5 text-xs capitalize text-[var(--text-secondary)]"
              >
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: signerRoleColors[role] }}
                />
                {role.replace(/_/g, ' ')}
              </span>
            ))}
            {signerRoles.length === 0 && (
              <span className="text-sm text-[var(--text-tertiary)]">None</span>
            )}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
            Created
          </p>
          <p className="mt-1 text-sm text-[var(--text-primary)]">
            {new Date(template.createdAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
        </div>
      </div>

      {/* PDF preview with field overlay */}
      {template.sourceDocumentPath ? (
        presignedPdfUrl ? (
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-6">
            <PdfViewer
              pdfUrl={presignedPdfUrl}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
              onDocumentLoad={handleDocumentLoad}
              scale={1}
            >
              <FieldOverlay
                fields={fields}
                pageDimensions={currentDimensions}
                currentPage={currentPage}
                mode="view"
                signerRoleColors={signerRoleColors}
              />
            </PdfViewer>
          </div>
        ) : pdfIsLoading || pdfIsFetching ? (
          <div
            role="status"
            aria-label="Loading PDF preview"
            data-testid="pdf-preview-loading"
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-6"
          >
            <Skeleton className="h-[600px] w-full" />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-12">
            <p className="text-sm text-[var(--status-danger)]">We couldn&apos;t load the PDF preview. Please try again.</p>
            <button
              type="button"
              onClick={() => void refetchPdf()}
              className="inline-flex items-center gap-2 rounded-md bg-[var(--interactive-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--interactive-primary-hover)] transition-colors"
            >
              Retry
            </button>
          </div>
        )
      ) : (
        <div className="flex items-center justify-center rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-card)] py-16">
          <p className="text-sm text-[var(--text-tertiary)]">
            No PDF document uploaded for this template.
          </p>
        </div>
      )}

      {/* Clone dialog (simple inline) */}
      {showCloneDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              Clone Template
            </h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Enter a name for the cloned template.
            </p>
            <input
              type="text"
              value={cloneName}
              onChange={(e) => setCloneName(e.target.value)}
              className="mt-4 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--interactive-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--interactive-primary)]"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleClone();
                if (e.key === 'Escape') setShowCloneDialog(false);
              }}
            />
            {cloneMutation.error && (
              <p className="mt-2 text-xs text-[var(--status-danger)]">
                {cloneMutation.error.message}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCloneDialog(false)}
                className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-subtle)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleClone()}
                disabled={!cloneName.trim() || cloneMutation.isPending}
                className="inline-flex items-center gap-2 rounded-md bg-[var(--interactive-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--interactive-primary-hover)] disabled:opacity-40"
              >
                {cloneMutation.isPending && (
                  <Loader2 className="size-4 animate-spin" />
                )}
                Clone
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
