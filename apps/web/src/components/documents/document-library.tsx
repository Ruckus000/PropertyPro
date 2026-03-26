'use client';

import { useState, useCallback } from 'react';
import { PenTool, X } from 'lucide-react';
import { isElevatedRole, type CommunityRole, type NewCommunityRole, type ManagerPermissions } from '@propertypro/shared';
import { DocumentUploadArea } from './document-upload-area';
import { DocumentList, type DocumentListItem } from './document-list';
import { DocumentViewer } from './document-viewer';
import { DocumentVersionHistory } from './document-version-history';
import { DocumentCategoryFilter } from './document-category-filter';
import { DocumentSearch } from './document-search';
import type { UploadDocumentResult } from '@/hooks/useDocumentUpload';

interface DocumentLibraryProps {
  communityId: number;
  userId: string;
  userRole: CommunityRole | NewCommunityRole;
  isUnitOwner?: boolean;
  permissions?: ManagerPermissions;
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
  initialSearchQuery,
}: DocumentLibraryProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [uploadCategoryId, setUploadCategoryId] = useState<number | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<DocumentListItem | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [refreshKey, setRefreshKey] = useState(0);
  const [showUpload, setShowUpload] = useState(false);
  const [searchMode, setSearchMode] = useState(!!initialSearchQuery);
  const [showEsignBanner, setShowEsignBanner] = useState(false);

  const canUpload = isElevatedRole(userRole, { isUnitOwner, permissions });

  const openUploadPanel = useCallback(() => {
    setUploadCategoryId(selectedCategoryId);
    setShowUpload(true);
  }, [selectedCategoryId]);

  const handleDocumentUploaded = useCallback((result: UploadDocumentResult) => {
    setRefreshKey((prev) => prev + 1);
    if (result.warnings.length === 0) {
      setShowUpload(false);
    }
  }, []);

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
          {canUpload && (
            <button
              type="button"
              onClick={() => setShowEsignBanner(!showEsignBanner)}
              className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors sm:px-4 ${
                showEsignBanner
                  ? 'border-interactive bg-interactive-subtle text-interactive'
                  : 'border-edge-strong text-content-secondary hover:bg-surface-hover'
              }`}
            >
              <PenTool size={16} />
              E-Sign
            </button>
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

      {showEsignBanner && (
        <div className="relative rounded-md border border-interactive bg-interactive-subtle p-4">
          <button
            type="button"
            onClick={() => setShowEsignBanner(false)}
            className="absolute right-3 top-3 text-content-disabled hover:text-content-link"
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
          <div className="flex items-start gap-3">
            <PenTool size={20} className="mt-0.5 shrink-0 text-content-link" />
            <div>
              <h3 className="text-sm font-semibold text-content">
                E-Signatures Coming Soon
              </h3>
              <p className="mt-1 text-sm text-interactive">
                Built-in document signing is on the way. Create templates,
                send for signature, and track completions — all without
                leaving PropertyPro.
              </p>
            </div>
          </div>
        </div>
      )}

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
            <DocumentList
              communityId={communityId}
              categoryId={selectedCategoryId}
              onSelectDocument={handleSelectDocument}
              onDeleteDocument={handleDeleteDocument}
              onUploadRequest={openUploadPanel}
              refreshKey={refreshKey}
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
