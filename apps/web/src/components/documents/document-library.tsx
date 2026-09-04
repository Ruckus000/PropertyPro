'use client';

/**
 * The Documents screen.
 *
 * A document is evidence for a statutory requirement, so this is not a list of
 * files — it is the record set, and some records have no file yet. Gaps sit in
 * the same table as documents; the derived reading behind every row lives in
 * `lib/documents/document-state.ts`.
 *
 * ## Rewritten in place, deliberately
 *
 * `scripts/verify-page-header-usage.ts` hard-codes this exact path in
 * `PAGE_SHELL_COMPONENTS` and exits **2** ("could not check") when a listed file
 * is missing — which reads as broken tooling rather than a failed guard. So the
 * screen is rewritten here rather than renamed to `documents-page-shell.tsx`.
 *
 * ## Why documents are fetched unfiltered
 *
 * The category filter is applied client-side. Fetching per category would make
 * the coverage facts describe the filtered slice rather than the community, and
 * would refetch on every pill. One fetch, filtered locally — which also means
 * `prefetchDocuments` (which warms the all-categories key) now warms the key
 * this screen actually reads.
 */

import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import Link from 'next/link';
import { FilePlus2, PenTool } from 'lucide-react';
import { type CommunityRole, type CommunityType } from '@propertypro/shared';
import { checkPermissionV2 } from '@/lib/db/access-control';
import { AlertBanner } from '@/components/shared/alert-banner';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { QuickFilterTabs } from '@/components/shared/quick-filter-tabs';
import { Button } from '@/components/ui/button';
import { useUrlView } from '@/hooks/use-url-view';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useComplianceChecklist } from '@/hooks/use-compliance-checklist';
import { useDocumentCategories } from '@/hooks/use-document-categories';
import {
  useDeletedDocuments,
  useDocuments,
  useDocumentsInvalidator,
  useRestoreDocument,
  useSetDocumentPublicAccess,
} from '@/hooks/use-documents';
import type { UploadDocumentResult } from '@/hooks/use-document-upload';
import {
  boardColumns,
  coerceDocumentsView,
  coverageFacts,
  filterRows,
  mergeDocumentsAndGaps,
  owedToPublic,
  timelineRows,
  unlinkedDocuments,
  type ChecklistRow,
  type DocumentQuickFilter,
  type DocumentRow,
} from '@/lib/documents/document-state';
import { DocumentCategoryFilter } from './document-category-filter';
import { DocumentInspector } from './document-inspector';
import { DocumentSearch } from './document-search';
import { DocumentUploadArea } from './document-upload-area';
import { DocumentsBoard } from './documents-board';
import { DocumentsTable } from './documents-table';
import { DocumentsTimeline } from './documents-timeline';
import { PublishDocumentDialog } from './publish-document-dialog';

interface DocumentLibraryProps {
  communityId: number;
  communityType: CommunityType;
  userRole: CommunityRole;
  isUnitOwner?: boolean;
  /** Effective community feature — hide E‑Sign when the plan/type does not include it. */
  hasEsign: boolean;
  /** Condo/HOA only. Apartments have no checklist at all. */
  hasCompliance: boolean;
  /** `compliance:read` — an owner and a manager have it; a TENANT does not. */
  canReadCompliance: boolean;
  /** Pre-populate search from command palette "View all" link */
  initialSearchQuery?: string;
}

export function DocumentLibrary({
  communityId,
  communityType,
  userRole,
  isUnitOwner,
  hasEsign,
  hasCompliance,
  canReadCompliance,
  initialSearchQuery,
}: DocumentLibraryProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [uploadCategoryId, setUploadCategoryId] = useState<number | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<DocumentRow | null>(null);
  const [quickFilter, setQuickFilter] = useState<DocumentQuickFilter>('all');
  const [showUpload, setShowUpload] = useState(false);
  const [searchMode, setSearchMode] = useState(!!initialSearchQuery);
  const [publishTarget, setPublishTarget] = useState<{
    document: DocumentRow;
    publishing: boolean;
  } | null>(null);
  const { view, setView } = useUrlView('view', coerceDocumentsView);

  const canUpload = checkPermissionV2(userRole, communityType, 'documents', 'write', {
    isUnitOwner,
  });

  // Both gates must hold, or the request 403s and the screen breaks.
  const showStatutory = hasCompliance && canReadCompliance;

  const documentsQuery = useDocuments({ communityId });
  const checklistQuery = useComplianceChecklist(communityId, { enabled: showStatutory });
  const { categories } = useDocumentCategories(communityId);
  // Only the board asks for deleted rows, and only management may see them.
  const deletedQuery = useDeletedDocuments({
    communityId,
    enabled: view === 'board' && canUpload,
  });
  const publicAccessMutation = useSetDocumentPublicAccess(communityId);
  const restoreMutation = useRestoreDocument(communityId);
  const invalidateDocuments = useDocumentsInvalidator(communityId);

  const documents = useMemo<DocumentRow[]>(() => documentsQuery.data ?? [], [documentsQuery.data]);
  const checklist = useMemo<ChecklistRow[]>(
    () => (showStatutory ? ((checklistQuery.data as ChecklistRow[] | undefined) ?? []) : []),
    [checklistQuery.data, showStatutory],
  );

  const categoryNameById = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );

  const rows = useMemo(
    () => filterRows(mergeDocumentsAndGaps(documents, checklist), {
      categoryId: selectedCategoryId,
      quickFilter,
    }),
    [checklist, documents, quickFilter, selectedCategoryId],
  );

  const deletedDocuments = useMemo<DocumentRow[]>(
    () => deletedQuery.data ?? [],
    [deletedQuery.data],
  );

  const columns = useMemo(
    () => boardColumns(rows, deletedDocuments),
    [deletedDocuments, rows],
  );

  const now = useMemo(() => new Date(), []);
  const timeline = useMemo(
    () => timelineRows(documents, checklist, now),
    [checklist, documents, now],
  );

  const selectedIsDeleted = useMemo(
    () => (selectedDocument ? deletedDocuments.some((d) => d.id === selectedDocument.id) : false),
    [deletedDocuments, selectedDocument],
  );

  const facts = useMemo(() => coverageFacts(documents, checklist), [checklist, documents]);
  const unlinkedCount = useMemo(
    () => unlinkedDocuments(documents, checklist).length,
    [checklist, documents],
  );
  const owedCount = useMemo(
    () => owedToPublic(documents, checklist).length,
    [checklist, documents],
  );

  const selectedRequirement = useMemo(() => {
    if (!selectedDocument) return null;
    return checklist.find((item) => item.documentId === selectedDocument.id) ?? null;
  }, [checklist, selectedDocument]);

  const selectedState = useMemo(() => {
    if (!selectedDocument) return null;
    const row = mergeDocumentsAndGaps([selectedDocument], checklist).find(
      (candidate) => candidate.kind === 'document',
    );
    return row?.kind === 'document' ? row.state : null;
  }, [checklist, selectedDocument]);

  const openUploadPanel = useCallback(() => {
    setUploadCategoryId(selectedCategoryId);
    setShowUpload(true);
  }, [selectedCategoryId]);

  const handleDocumentUploaded = useCallback(
    (result: UploadDocumentResult) => {
      invalidateDocuments();
      if (result.warnings.length === 0) {
        setShowUpload(false);
      }
    },
    [invalidateDocuments],
  );

  const handleDeleted = useCallback((doc: DocumentRow) => {
    setSelectedDocument((current) => (current?.id === doc.id ? null : current));
  }, []);

  const errorMessage =
    documentsQuery.error instanceof Error ? documentsQuery.error.message : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documents"
        actions={
          <>
            <button
              type="button"
              onClick={() => setSearchMode(!searchMode)}
              className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors sm:px-4 ${
                searchMode
                  ? 'border-interactive bg-interactive-subtle text-interactive'
                  : 'border-edge-strong text-content-secondary hover:bg-surface-hover'
              }`}
            >
              {searchMode ? 'Hide Search' : 'Search'}
            </button>
            {canUpload && hasEsign && (
              <Link
                href={`/esign?communityId=${communityId}`}
                className="flex items-center gap-2 rounded-md border border-edge-strong px-3 py-2 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-hover sm:px-4"
              >
                <PenTool size={16} aria-hidden />
                E-Sign
              </Link>
            )}
            {canUpload && (
              <Link
                href={`/communities/${communityId}/documents/author/new`}
                className="inline-flex items-center gap-2 rounded-md border border-edge-strong px-3 py-2 text-sm font-medium text-content-secondary hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive sm:px-4"
              >
                <FilePlus2 size={16} aria-hidden="true" />
                Author Document
              </Link>
            )}
            {canUpload && (
              <button
                type="button"
                onClick={() => {
                  if (showUpload) {
                    setShowUpload(false);
                    return;
                  }
                  openUploadPanel();
                }}
                aria-expanded={showUpload}
                // The aria-label is load-bearing: it keeps this control's
                // accessible name distinct from the "Upload Document" SUBMIT
                // button inside the panel, which the e2e matches exactly.
                aria-label={showUpload ? 'Close upload panel' : 'Open upload panel'}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors sm:px-4 ${
                  showUpload
                    ? 'bg-surface-muted text-content'
                    : 'bg-interactive text-white hover:bg-interactive-hover'
                }`}
              >
                {showUpload ? 'Cancel' : 'Upload Document'}
              </button>
            )}
          </>
        }
      >
        <Tabs value={view} onValueChange={setView}>
          <TabsList aria-label="View">
            <TabsTrigger value="list">List</TabsTrigger>
            <TabsTrigger value="board">Board</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
          </TabsList>
        </Tabs>
      </PageHeader>

      {showUpload && canUpload && (
        <div className="rounded-md border border-edge bg-surface-card p-6">
          <h2 className="mb-4 text-lg font-medium text-content">Upload Document</h2>
          <DocumentUploadArea
            communityId={communityId}
            initialCategoryId={uploadCategoryId}
            onUploaded={handleDocumentUploaded}
          />
        </div>
      )}

      {searchMode && (
        <div className="rounded-md border border-edge bg-surface-card p-6">
          <DocumentSearch communityId={communityId} initialQuery={initialSearchQuery} />
        </div>
      )}

      {showStatutory && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <p className="text-sm text-content-secondary">
            <b className="font-semibold text-content">{facts.total}</b> statutory records
            {' · '}
            <b className="font-semibold text-content">{facts.covered}</b> covered
            {' · '}
            <b className="font-semibold text-content">{facts.publicCount}</b> on the public site
          </p>
          <div className="-mx-1 w-full overflow-x-auto px-1 sm:w-auto">
            <QuickFilterTabs
              className="w-max"
              active={quickFilter}
              onChange={(value) => setQuickFilter(value as DocumentQuickFilter)}
              tabs={[
                { label: 'All records', value: 'all' },
                { label: 'Owed to public', value: 'owed', count: owedCount },
                { label: 'Unlinked', value: 'unlinked', count: unlinkedCount },
              ]}
            />
          </div>
        </div>
      )}

      {errorMessage && (
        <AlertBanner
          status="danger"
          variant="subtle"
          title="We couldn't load these documents."
          description={errorMessage}
          action={
            <Button size="sm" onClick={() => void documentsQuery.refetch()}>
              Try again
            </Button>
          }
        />
      )}

      <div className="overflow-hidden rounded-md border border-edge bg-surface-card">
        <div className="border-b border-edge px-6 py-4">
          <DocumentCategoryFilter
            communityId={communityId}
            selectedCategoryId={selectedCategoryId}
            onCategoryChange={setSelectedCategoryId}
          />
        </div>

        <div className="grid min-h-[500px] lg:grid-cols-2">
          <div
            className={`min-w-0 border-r border-edge p-6 ${selectedDocument ? 'hidden lg:block' : ''}`}
          >
            {view === 'list' && (
              <DocumentsTable
                rows={rows}
                isLoading={documentsQuery.isLoading}
                selectedId={selectedDocument?.id ?? null}
                showStatutoryColumns={showStatutory}
                categoryNameById={categoryNameById}
                onSelectDocument={setSelectedDocument}
                {...(documents.length === 0 && !documentsQuery.isLoading
                  ? {
                      emptyAction: (
                        <EmptyState
                          preset="no_documents"
                          size="sm"
                          {...(canUpload
                            ? { action: <Button onClick={openUploadPanel}>Upload Document</Button> }
                            : {})}
                        />
                      ),
                    }
                  : {})}
              />
            )}

            {view === 'board' && (
              <DocumentsBoard
                columns={columns}
                selectedId={selectedDocument?.id ?? null}
                canManage={canUpload}
                onSelectDocument={setSelectedDocument}
                onMove={(document, from, to) => {
                  // Nothing commits on a drop: this opens the same review the
                  // inspector's button does. Only the public/private transition
                  // is draggable — deleting is destructive and keeps its own
                  // explicit verb, and restoring is offered in the panel.
                  if (from === 'deleted' || to === 'deleted') return;
                  setSelectedDocument(document);
                  setPublishTarget({ document, publishing: to === 'public' });
                }}
              />
            )}

            {view === 'timeline' && (
              <DocumentsTimeline
                rows={timeline}
                year={now.getUTCFullYear()}
                currentMonth={now.getUTCMonth()}
                selectedId={selectedDocument?.id ?? null}
                onSelectDocument={(documentId) => {
                  const found = documents.find((d) => d.id === documentId);
                  if (found) setSelectedDocument(found);
                }}
              />
            )}
          </div>

          <div className={`min-w-0 p-6 ${selectedDocument ? '' : 'hidden lg:block'}`}>
            {selectedDocument && (
              <button
                type="button"
                onClick={() => setSelectedDocument(null)}
                className="mb-3 inline-flex items-center gap-1 text-sm text-content-secondary hover:text-content lg:hidden"
              >
                Back to list
              </button>
            )}
            <DocumentInspector
              communityId={communityId}
              document={selectedDocument}
              requirement={selectedRequirement}
              state={selectedState}
              canManage={canUpload}
              showStatutory={showStatutory}
              isDeleted={selectedIsDeleted}
              onRequestPublish={(document, publishing) =>
                setPublishTarget({ document, publishing })
              }
              onRestore={(document) => {
                restoreMutation.mutate(
                  { id: document.id },
                  {
                    onSuccess: () => {
                      setSelectedDocument(null);
                      toast.success('Document restored.');
                    },
                  },
                );
              }}
              onDeleted={handleDeleted}
              onClose={() => setSelectedDocument(null)}
            />
          </div>
        </div>
      </div>

      <PublishDocumentDialog
        open={publishTarget !== null}
        publishing={publishTarget?.publishing ?? true}
        documentTitle={publishTarget?.document.title ?? ''}
        categoryName={
          publishTarget?.document.categoryId != null
            ? categoryNameById.get(publishTarget.document.categoryId) ?? null
            : null
        }
        requirementTitle={
          publishTarget
            ? checklist.find((c) => c.documentId === publishTarget.document.id)?.title ?? null
            : null
        }
        isPending={publicAccessMutation.isPending}
        errorMessage={
          publicAccessMutation.error instanceof Error ? publicAccessMutation.error.message : null
        }
        onCancel={() => {
          setPublishTarget(null);
          publicAccessMutation.reset();
        }}
        onConfirm={(redactionAttested) => {
          if (!publishTarget) return;
          publicAccessMutation.mutate(
            {
              id: publishTarget.document.id,
              publicAccess: publishTarget.publishing,
              ...(redactionAttested === undefined ? {} : { redactionAttested }),
            },
            {
              onSuccess: () => {
                toast.success(
                  publishTarget.publishing
                    ? 'Now on the public site.'
                    : 'Removed from the public site.',
                );
                setPublishTarget(null);
              },
            },
          );
        }}
      />
    </div>
  );
}
