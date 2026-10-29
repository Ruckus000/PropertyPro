'use client';

/**
 * Add the Florida records the website is missing (website builder, D11, C3).
 *
 * The person drops files; each one is matched to the record it is, by its file
 * name, and nothing is posted until they press **Post {n} records**.
 *
 * - A file whose name points at exactly one missing record shows **Matched**
 *   and **Change**. Anything else shows "Pick a record" and is left out of the
 *   Post count until a record is chosen. A file name is no evidence for the
 *   insurance records, so those are never proposed (`proposeTemplateKeyForFile`).
 *   A record is proposed for one file only.
 * - Each file is uploaded, as posted, into the category its record files under
 *   (`getTemplateDocumentCategory`), then linked to the record with
 *   `linkDocument`. Two files go at a time; one that fails doesn't stop the
 *   others, and the result says in plain sentences which posted and which
 *   didn't. A file that uploaded but couldn't be linked is not uploaded again
 *   on the next Post, and removing its row keeps that outcome on screen: the
 *   file is still in Documents.
 * - The upload asks the server NOT to link the document itself (`skipAutoLink`).
 *   Posting a document otherwise links it to the one record it fits, which can
 *   be a different record from the one the person chose with Change; the link
 *   here is the person's choice, and the only one.
 * - The redaction attestation (§718.111(12)(c)) is asked once, when any record
 *   about to be posted files under a category that needs it.
 * - "May apply" lists the conditional records with a hint and **Doesn't apply**.
 *
 * Mount it while it is open; `onClose` is called when it closes. The caller
 * refreshes what it shows from that, since records may have been posted.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, CircleAlert, CircleCheck, FileText, TriangleAlert, Upload, X } from 'lucide-react';
import { proposeTemplateKeyForFile } from '@propertypro/shared';
import { getTemplateDocumentCategory } from '@/components/compliance/compliance-visibility';
import {
  RedactionAttestationField,
  categoryRequiresRedactionAttestation,
} from '@/components/documents/redaction-attestation-field';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useComplianceMutations } from '@/hooks/use-compliance-mutations';
import { useDocumentCategories } from '@/hooks/use-document-categories';
import { uploadDocumentFile } from '@/hooks/use-document-upload';
import { recordsAlertQueryKey } from '@/hooks/use-records-alert';
import { DOCUMENT_ACCEPT, classifyUpload, titleFromFileName, type UploadVerdict } from '@/lib/documents/upload-rules';
import type { MissingRecord } from '@/lib/site-editor/records-status';
import { cn } from '@/lib/utils';
import { APPLIES_HINT } from './applies-hint';
import { NotApplicableDialog } from './not-applicable-dialog';

/** Two uploads at a time, as the documents library's queue does. */
const CONCURRENCY = 2;

/** Touch targets: 44 px below 768 px, the default height above. */
const TOUCH = 'min-h-11 md:min-h-9';

export interface AddRecordsDrawerProps {
  communityId: number;
  /** The records the website is missing (`missingRecordItems`). */
  missing: readonly MissingRecord[];
  /** The records that may not apply (`conditionalRecordItems`). */
  conditional: readonly MissingRecord[];
  onClose: () => void;
}

interface DropRow {
  key: string;
  file: File;
  verdict: UploadVerdict;
  /** The record this file fills: proposed from its name, or chosen. */
  itemId: number | null;
  /** True only while `itemId` is the proposal from the file name. */
  matched: boolean;
  status: 'ready' | 'working' | 'failed';
  /** Set once the file is uploaded, so a failed link is retried without uploading again. */
  documentId: number | null;
}

interface Outcome {
  key: string;
  ok: boolean;
  text: string;
  /** The file posted to Documents but could not be linked to its record. */
  postedUnlinked?: boolean;
}

function sentence(message: string): string {
  const trimmed = message.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

export function AddRecordsDrawer({ communityId, missing, conditional, onClose }: AddRecordsDrawerProps) {
  const qc = useQueryClient();
  const { categories, isLoading: categoriesLoading, error: categoriesError, resolveCategoryId } =
    useDocumentCategories(communityId);
  const { linkDocument } = useComplianceMutations(communityId);

  const [rows, setRows] = useState<DropRow[]>([]);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [markedIds, setMarkedIds] = useState<ReadonlySet<number>>(new Set());
  const [applying, setApplying] = useState<MissingRecord | null>(null);
  const [attested, setAttested] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [sendCount, setSendCount] = useState(0);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const nextKey = useRef(0);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const mayApplyHeading = useRef<HTMLHeadingElement>(null);
  const postButton = useRef<HTMLButtonElement>(null);
  const chooseInput = useRef<HTMLInputElement>(null);
  const [markCount, setMarkCount] = useState(0);
  const attestationId = useId();

  const mayApply = useMemo(
    () => conditional.filter((item) => !markedIds.has(item.itemId)),
    [conditional, markedIds],
  );
  const items = useMemo(() => [...missing, ...mayApply], [missing, mayApply]);
  // Every record, marked or not: a file that already uploaded keeps its record.
  const allItems = useMemo(() => [...missing, ...conditional], [missing, conditional]);
  const itemById = useMemo(() => new Map(allItems.map((item) => [item.itemId, item])), [allItems]);

  /** The category a record files under, by id and by name. */
  const categoryFor = useCallback(
    (item: MissingRecord) => {
      const wanted = getTemplateDocumentCategory(item.templateKey, item.category);
      const id = resolveCategoryId(wanted);
      const name = categories.find((category) => category.id === id)?.name ?? wanted;
      return { id, name };
    },
    [categories, resolveCategoryId],
  );

  /** Everything needed to post this row now, or null while something is missing. */
  const plan = useCallback(
    (row: DropRow) => {
      if (row.verdict.kind === 'error' || row.itemId == null || row.status === 'working') return null;
      const item = itemById.get(row.itemId);
      if (!item) return null;
      const category = categoryFor(item);
      if (category.id == null) return null;
      // A file already uploaded is only linked on a retry: nothing more is published, so nothing to attest to.
      const sensitive = row.documentId == null && categoryRequiresRedactionAttestation(category.name);
      return { item, categoryId: category.id, sensitive };
    },
    [categoryFor, itemById],
  );

  const postable = rows.filter((row) => plan(row) !== null);
  const needsAttestation = postable.some((row) => plan(row)?.sensitive === true);
  const canPost = !isSending && !categoriesLoading && postable.length > 0 && (!needsAttestation || attested);

  const patchRow = useCallback((key: string, patch: Partial<DropRow>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }, []);

  function addFiles(files: readonly File[]) {
    if (files.length === 0) return;
    const taken = new Set(rowsRef.current.flatMap((row) => (row.itemId == null ? [] : [row.itemId])));
    const added: DropRow[] = files.map((file) => {
      const verdict = classifyUpload(file);
      let itemId: number | null = null;
      if (verdict.kind !== 'error') {
        // Only records no other file has claimed, so two files never fill one record by default.
        const open = missing.filter((item) => !taken.has(item.itemId));
        const key = proposeTemplateKeyForFile(
          file.name,
          open.map((item) => item.templateKey),
        );
        itemId = open.find((item) => item.templateKey === key)?.itemId ?? null;
        if (itemId != null) taken.add(itemId);
      }
      nextKey.current += 1;
      return {
        key: `file-${nextKey.current}`,
        file,
        verdict,
        itemId,
        matched: itemId != null,
        status: 'ready',
        documentId: null,
      };
    });
    setRows((current) => [...current, ...added]);
    // A new file is a new thing to attest to.
    setAttested(false);
  }

  function chooseRecord(key: string, itemId: number | null) {
    patchRow(key, { itemId, matched: false });
    setAttested(false);
  }

  function removeRow(key: string) {
    const uploaded = rowsRef.current.find((row) => row.key === key)?.documentId != null;
    setRows((current) => current.filter((row) => row.key !== key));
    // A file that posted but couldn't be linked is in Documents whatever happens
    // to its row here: its outcome stays, so the person still knows where it is.
    if (!uploaded) setOutcomes((current) => current.filter((outcome) => outcome.key !== key));
    setAttested(false);
  }

  function record(outcome: Outcome) {
    setOutcomes((current) => [...current.filter((o) => o.key !== outcome.key), outcome]);
  }

  async function postRows() {
    const work = rowsRef.current.flatMap((row) => {
      const planned = plan(row);
      return planned ? [{ row, ...planned }] : [];
    });
    if (work.length === 0) return;
    const redactionAttested = attested;
    setIsSending(true);

    const postOne = async ({ row, item, categoryId, sensitive }: (typeof work)[number]) => {
      const name = row.file.name;
      patchRow(row.key, { status: 'working' });
      let documentId = row.documentId;
      try {
        if (documentId == null) {
          const uploaded = await uploadDocumentFile({
            communityId,
            title: titleFromFileName(name),
            categoryId,
            file: row.file,
            redactionAttested: redactionAttested && sensitive,
            skipAutoLink: true,
          });
          documentId = Number(uploaded.document['id']);
          patchRow(row.key, { documentId });
        }
        // Every record here is listed as missing, and may still hold a stale,
        // draft or deleted file: the person's new file replaces it on purpose.
        await linkDocument.mutateAsync({ itemId: item.itemId, documentId, replace: true });
        setRows((current) => current.filter((r) => r.key !== row.key));
        record({ key: row.key, ok: true, text: `Posted ${name} as ${item.title}.` });
      } catch (error) {
        patchRow(row.key, { status: 'failed' });
        record({
          key: row.key,
          ok: false,
          postedUnlinked: documentId != null,
          text:
            documentId != null
              ? `${name} is posted, but we couldn't link it to ${item.title}. Press Post to try the link again.`
              : `We couldn't post ${name}. ${sentence(
                  error instanceof Error && error.message ? error.message : 'Please try again',
                )}`,
        });
      }
    };

    let next = 0;
    const worker = async () => {
      while (next < work.length) {
        const job = work[next];
        next += 1;
        if (job) await postOne(job);
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, work.length) }, worker));
    } finally {
      setIsSending(false);
      setAttested(false);
      setSendCount((n) => n + 1);
      // The nav badge and the alert read the count.
      void qc.invalidateQueries({ queryKey: recordsAlertQueryKey(communityId) });
    }
  }

  // After a send the Post button may be disabled, so focus goes to the result.
  useEffect(() => {
    if (sendCount > 0) resultsHeading.current?.focus();
  }, [sendCount]);

  // The button that opened "Doesn't apply" is gone once its record is marked, so
  // focus goes to the group's heading, or to Post when the group has emptied.
  useEffect(() => {
    if (markCount === 0) return;
    if (mayApplyHeading.current) {
      mayApplyHeading.current.focus();
      return;
    }
    postButton.current?.focus();
    if (document.activeElement !== postButton.current) chooseInput.current?.focus();
  }, [markCount]);

  return (
    <Sheet open onOpenChange={(open) => !open && !isSending && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="space-y-1 p-6 pb-4 pr-14">
          <SheetTitle>Add missing records</SheetTitle>
          <SheetDescription>
            Drop your files here. We work out which record each one is, and you check it before anything is posted.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 pb-6">
          <div
            onDragOver={(event: DragEvent<HTMLDivElement>) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event: DragEvent<HTMLDivElement>) => {
              event.preventDefault();
              setIsDragging(false);
              addFiles(Array.from(event.dataTransfer.files));
            }}
            className={cn(
              'flex flex-col items-center justify-center rounded-md border-2 border-dashed p-6 text-center transition-colors',
              isDragging ? 'border-interactive bg-interactive-subtle' : 'border-edge-strong bg-surface-page',
            )}
          >
            <Upload className="mb-2 size-6 text-content-tertiary" aria-hidden="true" />
            <p className="text-sm text-content-secondary">Drag files here, or</p>
            <label
              className={cn(
                'mt-2 inline-flex cursor-pointer items-center justify-center rounded-md border border-edge bg-surface-card px-4 text-sm font-medium text-content shadow-sm hover:bg-surface-hover',
                'focus-within:ring-2 focus-within:ring-focus focus-within:ring-offset-2',
                TOUCH,
              )}
            >
              Choose files
              <input
                type="file"
                multiple
                ref={chooseInput}
                className="sr-only"
                accept={DOCUMENT_ACCEPT}
                disabled={isSending}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  addFiles(Array.from(event.target.files ?? []));
                  // Choosing the same file again must fire `change` again.
                  event.target.value = '';
                }}
              />
            </label>
            <p className="mt-2 text-xs text-content-secondary">
              PDF or Word (.docx) files, or PNG or JPG images. Nothing is posted until you press Post.
            </p>
          </div>

          {categoriesError && (
            <p role="alert" className="flex items-start gap-2 text-sm text-status-danger">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>We couldn&apos;t load your document categories. Close this and try again.</span>
            </p>
          )}

          {rows.length > 0 && (
            <ul className="space-y-3" aria-label="Files to post">
              {rows.map((row) => (
                <FileRowItem
                  key={row.key}
                  row={row}
                  items={items}
                  allItems={allItems}
                  claimedBy={rows}
                  disabled={isSending}
                  noCategory={
                    !categoriesLoading &&
                    row.verdict.kind !== 'error' &&
                    row.itemId != null &&
                    itemById.has(row.itemId) &&
                    plan({ ...row, status: 'ready' }) === null
                  }
                  onChoose={(itemId) => chooseRecord(row.key, itemId)}
                  onRemove={() => removeRow(row.key)}
                />
              ))}
            </ul>
          )}

          {needsAttestation && (
            <div className="space-y-1">
              <RedactionAttestationField
                id={attestationId}
                checked={attested}
                onChange={setAttested}
                disabled={isSending}
              />
              {postable.length > 1 && (
                <p className="text-xs text-content-secondary">
                  One tick covers each file above that needs it. Each one is recorded separately.
                </p>
              )}
            </div>
          )}

          {/* Present from the start and empty, so what is added to it is announced. */}
          <div role="status">
            {outcomes.length > 0 && (
              <section aria-labelledby={`${attestationId}-results`} className="space-y-2">
                <h3
                  id={`${attestationId}-results`}
                  ref={resultsHeading}
                  tabIndex={-1}
                  className="text-sm font-semibold text-content outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  {outcomeHeading(outcomes)}
                </h3>
                <div>
                  <ul className="space-y-2">
                    {outcomes.map((outcome) => (
                      <li
                        key={outcome.key}
                        className={cn(
                          'flex items-start gap-2 text-sm',
                          outcome.ok ? 'text-status-success' : 'text-status-danger',
                        )}
                      >
                        {outcome.ok ? (
                          <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                        ) : (
                          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                        )}
                        <span>{outcome.text}</span>
                      </li>
                    ))}
                  </ul>
                  {outcomes.some((outcome) => outcome.postedUnlinked) && (
                    <p className="mt-2 text-sm text-content-secondary">
                      A file that posted but couldn&apos;t be linked stays in Documents, so nothing is lost.
                    </p>
                  )}
                </div>
              </section>
            )}
          </div>

          {mayApply.length > 0 && (
            <section aria-labelledby={`${attestationId}-may-apply`} className="space-y-2">
              <h3
                id={`${attestationId}-may-apply`}
                ref={mayApplyHeading}
                tabIndex={-1}
                className="text-sm font-semibold text-content outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                May apply to you
              </h3>
              <p className="text-sm text-content-secondary">
                These are only needed in some cases. If one doesn&apos;t apply to your association, say so and it
                stops showing as missing.
              </p>
              <ul className="space-y-2">
                {mayApply.map((item) => (
                  <li
                    key={item.itemId}
                    className="flex flex-col gap-2 rounded-md border border-edge bg-surface-card p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-content">{item.title}</p>
                      {APPLIES_HINT[item.templateKey] && (
                        <p className="text-sm text-content-secondary">{APPLIES_HINT[item.templateKey]}</p>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn('shrink-0', TOUCH)}
                      aria-label={`Doesn't apply: ${item.title}`}
                      disabled={isSending}
                      onClick={() => setApplying(item)}
                    >
                      Doesn&apos;t apply
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <SheetFooter className="gap-2 border-t border-edge p-6 sm:space-x-0">
          <Button variant="outline" className={TOUCH} disabled={isSending} onClick={onClose}>
            {outcomes.length > 0 ? 'Done' : 'Cancel'}
          </Button>
          <Button
            ref={postButton}
            className={TOUCH}
            loading={isSending}
            disabled={!canPost}
            onClick={() => void postRows()}
          >
            {postable.length > 0 ? `Post ${postable.length} record${postable.length === 1 ? '' : 's'}` : 'Post records'}
          </Button>
        </SheetFooter>
      </SheetContent>

      {applying && (
        <NotApplicableDialog
          communityId={communityId}
          item={applying}
          onDone={(marked) => {
            if (marked) {
              setMarkedIds((current) => new Set(current).add(applying.itemId));
              // A file that was aimed at this record has nowhere to go.
              setRows((current) =>
                current.map((row) =>
                  row.itemId === applying.itemId && row.documentId == null
                    ? { ...row, itemId: null, matched: false }
                    : row,
                ),
              );
              setMarkCount((n) => n + 1);
              void qc.invalidateQueries({ queryKey: recordsAlertQueryKey(communityId) });
            }
            setApplying(null);
          }}
        />
      )}
    </Sheet>
  );
}

function outcomeHeading(outcomes: readonly Outcome[]): string {
  const posted = outcomes.filter((o) => o.ok).length;
  const failed = outcomes.length - posted;
  const parts = [];
  if (posted > 0) parts.push(`${posted} posted`);
  if (failed > 0) parts.push(`${failed} didn't post`);
  return parts.join(', ');
}

function FileRowItem({
  row,
  items,
  allItems,
  claimedBy,
  disabled,
  noCategory,
  onChoose,
  onRemove,
}: {
  row: DropRow;
  items: readonly MissingRecord[];
  /** Every record, for naming the one a locked row is filed under. */
  allItems: readonly MissingRecord[];
  /** Every row, to tell which records another file has already claimed. */
  claimedBy: readonly DropRow[];
  disabled: boolean;
  /** The record is chosen but the library has no category for it. */
  noCategory: boolean;
  onChoose: (itemId: number | null) => void;
  onRemove: () => void;
}) {
  const refused = row.verdict.kind === 'error';
  const chosen = allItems.find((item) => item.itemId === row.itemId);
  // Uploaded already, so it is filed under this record's category (and attested for it): the record cannot change.
  const locked = row.documentId != null;
  const [picking, setPicking] = useState(false);
  const selectId = useId();
  const changeButton = useRef<HTMLButtonElement>(null);
  const select = useRef<HTMLSelectElement>(null);
  const refocusChange = useRef(false);

  useEffect(() => {
    if (picking) select.current?.focus();
  }, [picking]);
  // The select unmounts once a record is chosen; keep focus on Change.
  useEffect(() => {
    if (refocusChange.current && changeButton.current) {
      changeButton.current.focus();
      refocusChange.current = false;
    }
  });

  const claimedByOthers = new Set(
    claimedBy.flatMap((other) => (other.key !== row.key && other.itemId != null ? [other.itemId] : [])),
  );

  return (
    <li className="space-y-2 rounded-md border border-edge bg-surface-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <FileText className="mt-0.5 size-4 shrink-0 text-content-secondary" aria-hidden="true" />
          <span className="min-w-0 break-words text-sm font-medium text-content">{row.file.name}</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 max-md:size-11"
          aria-label={`Remove ${row.file.name}`}
          disabled={disabled}
          onClick={onRemove}
        >
          <X aria-hidden="true" />
        </Button>
      </div>

      {row.verdict.kind !== 'ok' && (
        <p
          className={cn(
            'flex items-start gap-2 text-sm',
            refused ? 'text-status-danger' : 'text-status-warning',
          )}
        >
          {refused ? (
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          ) : (
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          )}
          <span>{row.verdict.note}</span>
        </p>
      )}

      {!refused && (
        <div className="space-y-2">
          {chosen && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="text-sm text-content">
                Fills <span className="font-medium">{chosen.title}</span>
              </p>
              {row.matched && (
                <span className="inline-flex items-center gap-1 rounded-full bg-status-success-bg px-2 py-0.5 text-xs font-medium text-status-success">
                  <Check className="size-3" aria-hidden="true" />
                  Matched
                </span>
              )}
              {!locked && (
                <Button
                  ref={changeButton}
                  variant="link"
                  size="sm"
                  className={cn('h-auto p-0', TOUCH)}
                  aria-expanded={picking}
                  aria-label={`Change record for ${row.file.name}`}
                  disabled={disabled}
                  onClick={() => setPicking((open) => !open)}
                >
                  Change
                </Button>
              )}
            </div>
          )}

          {!locked && (!chosen || picking) && (
            <div className="space-y-1">
              <label htmlFor={selectId} className="block text-xs font-medium text-content-secondary">
                Which record is this?
              </label>
              <select
                id={selectId}
                ref={select}
                value={row.itemId ?? ''}
                disabled={disabled}
                onChange={(event) => {
                  refocusChange.current = event.target.value !== '';
                  setPicking(false);
                  onChoose(event.target.value === '' ? null : Number(event.target.value));
                }}
                className={cn(
                  'w-full rounded-sm border border-edge bg-surface-card px-2 text-sm text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                  TOUCH,
                )}
              >
                <option value="">Pick a record</option>
                {items.map((item) => (
                  <option key={item.itemId} value={item.itemId} disabled={claimedByOthers.has(item.itemId)}>
                    {item.title}
                    {claimedByOthers.has(item.itemId) ? ' (chosen for another file)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {noCategory && (
            <p className="flex items-start gap-2 text-sm text-status-danger">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>We couldn&apos;t find a Documents category for this record. Choose a different record.</span>
            </p>
          )}
        </div>
      )}
    </li>
  );
}
