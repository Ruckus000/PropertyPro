'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { FilePlus2, PenTool } from 'lucide-react';
import { isElevatedRole, type CommunityRole, type TransitionRole, type ManagerPermissions } from '@propertypro/shared';
import { DocumentUploadArea } from './document-upload-area';
import { type DocumentListItem } from './document-list';
import { DocumentListContainer, useDocumentsInvalidator } from './document-list-container';
import { DocumentViewer } from './document-viewer';
import { DocumentVersionHistory } from './document-version-history';
import { DocumentCategoryFilter } from './document-category-filter';
import { DocumentSearch } from './document-search';
import type { UploadDocumentResult } from '@/hooks/useDocumentUpload';

interface DocumentLibraryProps {
  communityId: number;
  userId: string;
  userRole: CommunityRole | TransitionRole;
  isUnitOwner?: boolean;
  permissions?: ManagerPermissions;
  /** Effective community feature — hide E‑Sign when the plan/type does not include it. */
  hasEsign: boolean;
  /** Pre-populate search from command palette "View all" link */
  initialSearchQuery?: string;
}

type ViewMode = 'list' | 'viewer' | 'versions';

export function DocumentLibrary({
  communityId,
  userId,
  userRole,
  isUnitOwner,
  permissions,
  hasEsign,
  initialSearchQuery,
}: DocumentLibraryProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [uploadCategoryId, setUploadCategoryId] = useState<number | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<DocumentListItem | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [showUpload, setShowUpload] = useState(false);
  const [searchMode, setSearchMode] = useState(!!initialSearchQuery);

  const canUpload = isElevatedRole(userRole, { isUnitOwner, permissions });
  const invalidateDocuments = useDocumentsInvalidator(communityId);

  const openUploadPanel = useCallback(() => {
    setUploadCategoryId(selectedCategoryId);
    setShowUpload(true);
  }, [selectedCategoryId]);

  const handleDocumentUploaded = useCallback((result: UploadDocumentResult) => {
    invalidateDocuments();
    if (result.warnings.length === 0) {
      setShowUpload(false);
    }
  }, [invalidateDocuments]);

  const handleSelectDocument = useCallback((doc: DocumentListItem) => {
    setSelectedDocument(doc);
    setViewMode('viewer');
  }, []);

  const handleViewVersions = useCallback((doc: DocumentListItem) => {
    setSelectedDocument(doc);
    setViewMode('versions');
  }, []);

  const handleCloseViewer = useCallback(() => {
    setViewMode('list');
  }, []);

  const handleDeleteDocument = useCallback((doc: DocumentListItem) => {
    if (selectedDocument?.id === doc.id) {
      setSelectedDocument(null);
      setViewMode('list');
    }
  }, [selectedDocument]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-content">Documents</h1>
          <p className="mt-1 text-sm text-content-secondary">
            Manage and view community documents
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
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
        </div>
      </div>

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

      <div className="overflow-hidden rounded-md border border-edge bg-surface-card">
        <div className="border-b border-edge px-6 py-4">
          <DocumentCategoryFilter
            communityId={communityId}
            selectedCategoryId={selectedCategoryId}
            onCategoryChange={setSelectedCategoryId}
          />
        </div>

        <div className="grid min-h-[500px] lg:grid-cols-2">
          {/* Document list — hidden on mobile when viewing a document */}
          <div className={`min-w-0 border-r border-edge p-6 ${viewMode !== 'list' ? 'hidden lg:block' : ''}`}>
            <DocumentListContainer
              communityId={communityId}
              categoryId={selectedCategoryId}
              onSelectDocument={handleSelectDocument}
              onDeleteDocument={handleDeleteDocument}
              onUploadRequest={openUploadPanel}
              canManage={canUpload}
            />
          </div>

          {/* Viewer pane — hidden on mobile when in list mode */}
          <div className={`min-w-0 p-6 ${viewMode === 'list' && !selectedDocument ? 'hidden lg:block' : ''}`}>
            {viewMode !== 'list' && (
              <button
                type="button"
                onClick={handleCloseViewer}
                className="mb-3 inline-flex items-center gap-1 text-sm text-content-secondary hover:text-content lg:hidden"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Back to list
              </button>
            )}
            {viewMode === 'viewer' && (
              <DocumentViewer
                canEditAuthored={canUpload}
                communityId={communityId}
                document={selectedDocument}
                onClose={handleCloseViewer}
                onViewVersions={handleViewVersions}
              />
            )}
            {viewMode === 'versions' && selectedDocument && (
              <DocumentVersionHistory
                communityId={communityId}
                document={selectedDocument}
                onClose={handleCloseViewer}
                onSelectVersion={(version) => {
                  setSelectedDocument({
                    ...selectedDocument,
                    id: version.id,
                    fileName: version.fileName,
                    fileSize: version.fileSize,
                    mimeType: version.mimeType,
                    createdAt: version.createdAt,
                  });
                  setViewMode('viewer');
                }}
              />
            )}
            {viewMode === 'list' && !selectedDocument && (
              <DocumentViewer
                communityId={communityId}
                document={null}
                onClose={handleCloseViewer}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
