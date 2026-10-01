'use client';

/**
 * Upload several documents at once, then post them or save them as drafts.
 *
 * Built for the documents library and for the website builder's Documents
 * view: it takes the community, the library it already holds (for same-name
 * checks) and callbacks — nothing about where it is mounted.
 *
 * Every row is judged before any bytes move (`classifyUpload`): files that can
 * never be posted say why and are skipped; photos of paper get advice. One
 * redaction attestation covers the batch, asked only when a row needs it for
 * the action chosen — the server makes the same decision per file.
 */

import { useCallback, useMemo, useState, type ChangeEvent, type DragEvent } from 'react';
import {
  CheckCircle2,
  CircleAlert,
  FileText,
  Loader2,
  TriangleAlert,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { AlertBanner } from '@/components/shared/alert-banner';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDocumentCategories } from '@/hooks/use-document-categories';
import { useDocumentUploadQueue, type QueueOutcome } from '@/hooks/use-document-upload-queue';
import type { LibraryDocumentRef } from '@/lib/documents/duplicate-uploads';
import {
  isReplacing,
  queueBlocker,
  queueSummary,
  rowNeedsAttestation,
  sendableRows,
  type QueueAction,
  type QueueRow,
} from '@/lib/documents/upload-queue';
import { DOCUMENT_ACCEPT, MAX_DOCUMENT_BYTES, MAX_IMAGE_BYTES } from '@/lib/documents/upload-rules';
import { cn } from '@/lib/utils';
import { RedactionAttestationField } from './redaction-attestation-field';

interface DocumentUploadQueueProps {
  communityId: number;
  /** The library as the screen already holds it, for same-name checks. */
  existingDocuments: readonly LibraryDocumentRef[];
  /** Pre-selects every new row's category (the screen's current category). */
  initialCategoryId?: number | null;
  /** Called after a send in which every row went through. */
  onComplete?: (outcome: QueueOutcome & { action: QueueAction }) => void;
  /** Called after any send that changed the library, even a partial one. */
  onChanged?: (outcome: QueueOutcome) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function DocumentUploadQueue({
  communityId,
  existingDocuments,
  initialCategoryId = null,
  onComplete,
  onChanged,
}: DocumentUploadQueueProps) {
  const { categories, isLoading, error: categoriesError } = useDocumentCategories(communityId);
  const queue = useDocumentUploadQueue({
    communityId,
    existingDocuments,
    defaultCategoryId: initialCategoryId,
  });
  const { rows, isSending } = queue;
  const [attested, setAttested] = useState(false);
  /** The action last attempted; the blocker message answers for it. */
  const [tried, setTried] = useState<QueueAction | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const categoryNameOf = useCallback(
    (id: number | null) => categories.find((category) => category.id === id)?.name ?? null,
    [categories],
  );
  const sendable = sendableRows(rows);
  const needsFor = (action: QueueAction) =>
    sendable.some((row) => rowNeedsAttestation(row, action, categoryNameOf));
  const needsForPost = needsFor('post');
  const needsForDraft = needsFor('draft');

  const heading = useMemo(() => {
    const name = categoryNameOf(initialCategoryId);
    return name ? `Add to ${name}` : 'Upload documents';
  }, [categoryNameOf, initialCategoryId]);

  const addFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    queue.addFiles(Array.from(files));
    // A new file is a new thing to attest to.
    setAttested(false);
  };

  const send = async (action: QueueAction) => {
    setTried(action);
    const required = action === 'post' ? needsForPost : needsForDraft;
    if (queueBlocker({ rows, attestationRequired: required, attested })) return;

    const outcome = await queue.send({ action, redactionAttested: attested });
    if (outcome.sent > 0) onChanged?.(outcome);
    if (outcome.failed === 0) {
      toast.success(
        action === 'draft'
          ? `${outcome.sent} saved as draft${outcome.sent === 1 ? '' : 's'}. Owners can’t see ${outcome.sent === 1 ? 'it' : 'them'} yet.`
          : `${outcome.sent} document${outcome.sent === 1 ? '' : 's'} posted. Owners can see ${outcome.sent === 1 ? 'it' : 'them'} now.`,
      );
      if (outcome.notificationWarnings > 0) {
        toast.warning(
          `Residents could not be notified about ${outcome.notificationWarnings} of ${outcome.sent === 1 ? 'it' : 'them'}. The documents are posted.`,
        );
      }
      queue.clear();
      setTried(null);
      setAttested(false);
      onComplete?.({ ...outcome, action });
    } else {
      toast.error(
        `${outcome.failed} file${outcome.failed === 1 ? '' : 's'} couldn’t be uploaded. Fix ${outcome.failed === 1 ? 'it' : 'them'} and try again.`,
      );
    }
  };

  if (isLoading) {
    return <p className="text-sm text-content-secondary">Loading upload settings...</p>;
  }
  if (categoriesError) {
    return <AlertBanner status="danger" title="Unable to load categories" description={categoriesError} />;
  }
  if (categories.length === 0) {
    return (
      <EmptyState
        icon="file-text"
        title="Create a category before uploading"
        description="Document uploads are blocked until this community has at least one document category."
        size="sm"
      />
    );
  }

  const blocker = tried
    ? queueBlocker({
        rows,
        attestationRequired: tried === 'post' ? needsForPost : needsForDraft,
        attested,
      })
    : null;
  const postCount = sendable.length;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium text-content">{heading}</h2>

      <div
        onDragOver={(event: DragEvent<HTMLDivElement>) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event: DragEvent<HTMLDivElement>) => {
          event.preventDefault();
          setIsDragging(false);
          addFiles(event.dataTransfer.files);
        }}
        className={cn(
          'flex flex-col items-center justify-center rounded-md border-2 border-dashed p-6 text-center transition-colors',
          isDragging ? 'border-interactive bg-interactive-subtle' : 'border-edge-strong bg-surface-page',
        )}
      >
        <Upload className="mb-2 size-6 text-content-tertiary" aria-hidden="true" />
        <p className="text-sm text-content-secondary">
          Drag files here, or{' '}
          <label className="cursor-pointer font-medium text-content-link hover:text-interactive">
            choose files
            <input
              type="file"
              multiple
              className="sr-only"
              accept={DOCUMENT_ACCEPT}
              disabled={isSending}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                addFiles(event.target.files);
                // Choosing the same file again must fire `change` again.
                event.target.value = '';
              }}
            />
          </label>
        </p>
        <p className="mt-1 text-xs text-content-tertiary">
          PDF or Word (.docx) up to {Math.round(MAX_DOCUMENT_BYTES / 1024 / 1024)} MB · PNG or JPG up to{' '}
          {Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB
        </p>
      </div>

      {rows.length > 0 && (
        <>
          <p className="text-sm text-content-secondary" aria-live="polite">
            {queueSummary(rows)}
          </p>
          <ul className="space-y-3" aria-label="Files to upload">
            {rows.map((row) => (
              <QueueRowItem
                key={row.key}
                row={row}
                categories={categories}
                tried={tried != null}
                disabled={isSending}
                onChange={(patch) => {
                  queue.updateRow(row.key, patch);
                  // A different category or choice can change the question.
                  setAttested(false);
                }}
                onRemove={() => queue.removeRow(row.key)}
              />
            ))}
          </ul>

          {(needsForPost || needsForDraft) && (
            <div className="space-y-1">
              <RedactionAttestationField
                id="document-upload-queue-redaction"
                checked={attested}
                onChange={setAttested}
                disabled={isSending}
              />
              {/* The attestation sentence is recorded verbatim per document, so
                  it stays singular; this says what one tick covers. */}
              {sendable.length > 1 && (
                <p className="text-xs text-content-secondary">
                  One tick covers each file above that needs it. Each one is recorded separately.
                </p>
              )}
            </div>
          )}

          {blocker && (
            <p role="alert" className="text-sm text-status-danger">
              {blocker}
            </p>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" disabled={isSending || postCount === 0} onClick={() => void send('draft')}>
              Save as draft
            </Button>
            <Button loading={isSending} disabled={postCount === 0} onClick={() => void send('post')}>
              {postCount > 0 ? `Post ${postCount} now` : 'Post'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function QueueRowItem({
  row,
  categories,
  tried,
  disabled,
  onChange,
  onRemove,
}: {
  row: QueueRow;
  categories: ReadonlyArray<{ id: number; name: string }>;
  tried: boolean;
  disabled: boolean;
  onChange: (patch: Partial<QueueRow>) => void;
  onRemove: () => void;
}) {
  const refused = row.verdict.kind === 'error';
  const replacing = isReplacing(row);
  const missingCategory = tried && !refused && !replacing && row.categoryId == null;
  const note =
    row.status === 'failed' ? row.error : row.verdict.kind === 'ok' ? null : row.verdict.note;
  const Icon =
    row.status === 'done'
      ? CheckCircle2
      : row.status === 'uploading'
        ? Loader2
        : refused || row.status === 'failed'
          ? CircleAlert
          : row.verdict.kind === 'warning' || row.duplicate
            ? TriangleAlert
            : FileText;
  const titleId = `${row.key}-title`;
  const descriptionId = `${row.key}-description`;
  const [showDescription, setShowDescription] = useState(false);

  return (
    <li
      className={cn(
        'space-y-3 rounded-md border p-3',
        refused || row.status === 'failed'
          ? 'border-status-danger-border bg-status-danger-bg'
          : missingCategory
            ? 'border-status-danger bg-surface-card'
            : 'border-edge bg-surface-card',
      )}
    >
      <div className="flex items-start gap-3">
        <Icon
          className={cn(
            'mt-0.5 size-5 shrink-0',
            row.status === 'uploading' && 'animate-spin motion-reduce:animate-none',
            row.status === 'done'
              ? 'text-status-success'
              : refused || row.status === 'failed'
                ? 'text-status-danger'
                : row.verdict.kind === 'warning' || row.duplicate
                  ? 'text-status-warning'
                  : 'text-content-brand',
          )}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-content">{row.file.name}</p>
          <p className="text-xs text-content-tertiary">
            {formatSize(row.file.size)}
            {row.status === 'uploading' && ` · uploading ${row.progress}%`}
            {row.status === 'done' && ' · done'}
          </p>
          {note && (
            <p
              className={cn(
                'mt-1 text-xs',
                refused || row.status === 'failed' ? 'text-status-danger' : 'text-status-warning',
              )}
            >
              {note}
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Remove ${row.file.name}`}
          disabled={disabled || row.status === 'uploading'}
          onClick={onRemove}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>

      {!refused && row.status !== 'done' && (
        <>
          {row.duplicate && (
            <fieldset className="space-y-2">
              <legend className="text-xs text-content-secondary">
                A document with this name is already in your library: “{row.duplicate.title}”.
              </legend>
              <div className="flex flex-col gap-2 sm:flex-row">
                {(
                  [
                    ['replace', 'Replace the old one', 'Its title, category and link stay the same.'],
                    ['both', 'Keep both', 'Upload this as a separate document.'],
                  ] as const
                ).map(([value, label, hint]) => (
                  <label
                    key={value}
                    className="flex flex-1 cursor-pointer items-start gap-2 rounded-md border border-edge bg-surface-card p-2 text-sm has-[:checked]:border-interactive has-[:checked]:bg-interactive-subtle"
                  >
                    <input
                      type="radio"
                      name={`${row.key}-duplicate`}
                      value={value}
                      checked={row.duplicateChoice === value}
                      disabled={disabled}
                      onChange={() => onChange({ duplicateChoice: value })}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="block font-medium text-content">{label}</span>
                      <span className="block text-xs text-content-secondary">{hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {!replacing && (
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label htmlFor={titleId} className="mb-1 block text-xs font-medium text-content-secondary">
                  Title
                </label>
                <input
                  id={titleId}
                  type="text"
                  value={row.title}
                  disabled={disabled}
                  onChange={(event) => onChange({ title: event.target.value })}
                  className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-edge-focus focus-visible:outline-none focus-visible:ring-1 ring-focus"
                />
              </div>
              <div>
                <span aria-hidden="true" className="mb-1 block text-xs font-medium text-content-secondary">
                  Category
                </span>
                <Select
                  value={row.categoryId != null ? String(row.categoryId) : undefined}
                  disabled={disabled}
                  onValueChange={(value) => onChange({ categoryId: Number(value) })}
                >
                  <SelectTrigger
                    className={cn('w-full', missingCategory && 'border-status-danger')}
                    aria-label={`Category for ${row.file.name}`}
                    aria-invalid={missingCategory || undefined}
                  >
                    <SelectValue placeholder="Choose a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={String(category.id)}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {showDescription || row.description ? (
                <div className="sm:col-span-2">
                  <label htmlFor={descriptionId} className="mb-1 block text-xs font-medium text-content-secondary">
                    Description (optional)
                  </label>
                  <textarea
                    id={descriptionId}
                    rows={2}
                    value={row.description}
                    disabled={disabled}
                    onChange={(event) => onChange({ description: event.target.value })}
                    className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-edge-focus focus-visible:outline-none focus-visible:ring-1 ring-focus"
                  />
                </div>
              ) : (
                <div className="sm:col-span-2">
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto px-0"
                    disabled={disabled}
                    onClick={() => setShowDescription(true)}
                  >
                    Add a description
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </li>
  );
}
