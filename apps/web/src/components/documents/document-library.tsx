'use client';

import { useState, useCallback } from 'react';
import type { CommunityRole } from '@propertypro/shared';
import { DocumentUploadArea } from './document-upload-area';
import { DocumentList, type DocumentListItem } from './document-list';
import { DocumentViewer } from './document-viewer';
import { DocumentVersionHistory } from './document-version-history';
import { DocumentCategoryFilter } from './document-category-filter';
import { DocumentSearch } from './document-search';

interface DocumentLibraryProps {
  communityId: number;
  userId: string;
  userRole: CommunityRole;
}

type ViewMode = 'list' | 'viewer' | 'versions';

const ELEVATED_ROLES: CommunityRole[] = [
  'owner',
  'board_member',
  'board_president',
  'property_manager_admin',
];

export function DocumentLibrary({
  communityId,
  userId,
  userRole,
}: DocumentLibraryProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<DocumentListItem | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [refreshKey, setRefreshKey] = useState(0);
  const [showUpload, setShowUpload] = useState(false);
  const [searchMode, setSearchMode] = useState(false);

  const canUpload = ELEVATED_ROLES.includes(userRole);

  const handleDocumentUploaded = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
    setShowUpload(false);
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Documents</h1>
          <p className="mt-1 text-sm text-gray-600">
            Manage and view community documents
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSearchMode(!searchMode)}
            className={`rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
              searchMode
                ? 'border-blue-600 bg-blue-50 text-blue-700'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {searchMode ? 'Hide Search' : 'Search'}
          </button>
          {canUpload && (
            <button
              type="button"
              onClick={() => setShowUpload(!showUpload)}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                showUpload
                  ? 'bg-gray-200 text-gray-800'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {showUpload ? 'Cancel' : 'Upload Document'}
            </button>
          )}
        </div>
      </div>

      {showUpload && canUpload && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-medium text-gray-900">Upload Document</h2>
          <DocumentUploadArea
            communityId={communityId}
            categoryId={selectedCategoryId}
            onUploaded={handleDocumentUploaded}
          />
        </div>
      )}

      {searchMode && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <DocumentSearch communityId={communityId} />
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-4">
          <DocumentCategoryFilter
            communityId={communityId}
            selectedCategoryId={selectedCategoryId}
            onCategoryChange={setSelectedCategoryId}
          />
        </div>

        <div className="grid min-h-[500px] lg:grid-cols-2">
          <div className="border-r border-gray-200 p-6">
            <DocumentList
              communityId={communityId}
              categoryId={selectedCategoryId}
              onSelectDocument={handleSelectDocument}
              onDeleteDocument={handleDeleteDocument}
              refreshKey={refreshKey}
              canManage={canUpload}
            />
          </div>

          <div className="p-6">
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
