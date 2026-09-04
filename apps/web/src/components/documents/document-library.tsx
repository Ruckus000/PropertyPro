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
import Link from 'next/link';
import { FilePlus2, PenTool } from 'lucide-react';
import { type CommunityRole, type CommunityType } from '@propertypro/shared';
import { checkPermissionV2 } from '@/lib/db/access-control';
import { AlertBanner } from '@/components/shared/alert-banner';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { QuickFilterTabs } from '@/components/shared/quick-filter-tabs';
import { Button } from '@/components/ui/button';
import { useComplianceChecklist } from '@/hooks/use-compliance-checklist';
import { useDocumentCategories } from '@/hooks/use-document-categories';
import { useDocuments, useDocumentsInvalidator } from '@/hooks/use-documents';
import type { UploadDocumentResult } from '@/hooks/use-document-upload';
import {
  coverageFacts,
  filterRows,
  mergeDocumentsAndGaps,
  unlinkedDocuments,
  type ChecklistRow,
  type DocumentQuickFilter,
  type DocumentRow,
} from '@/lib/documents/document-state';
import { DocumentCategoryFilter } from './document-category-filter';
import { DocumentInspector } from './document-inspector';
import { DocumentSearch } from './document-search';
import { DocumentUploadArea } from './document-upload-area';
import { DocumentsTable } from './documents-table';

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

  const canUpload = checkPermissionV2(userRole, communityType, 'documents', 'write', {
    isUnitOwner,
  });

  // Both gates must hold, or the request 403s and the screen breaks.
  const showStatutory = hasCompliance && canReadCompliance;

  const documentsQuery = useDocuments({ communityId });
  const checklistQuery = useComplianceChecklist(communityId, { enabled: showStatutory });
  const { categories } = useDocumentCategories(communityId);
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

  const facts = useMemo(() => coverageFacts(documents, checklist), [checklist, documents]);
  const unlinkedCount = useMemo(
    () => unlinkedDocuments(documents, checklist).length,
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
      />

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
              onDeleted={handleDeleted}
              onClose={() => setSelectedDocument(null)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
