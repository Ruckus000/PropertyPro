'use client';

import { useState, useEffect } from 'react';
import type { DocumentListItem } from './document-list';

interface VersionHistoryItem {
  id: number;
  title: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  createdAt: string;
  uploadedBy: string | null;
}

interface VersionHistoryResponse {
  data: VersionHistoryItem[];
}

interface DocumentVersionHistoryProps {
  communityId: number;
  document: DocumentListItem;
  onClose?: () => void;
  onSelectVersion?: (version: VersionHistoryItem) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function DocumentVersionHistory({
  communityId,
  document,
  onClose,
  onSelectVersion,
}: DocumentVersionHistoryProps) {
  const [versions, setVersions] = useState<VersionHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setError(null);

    fetch(`/api/v1/documents/${document.id}/versions?communityId=${communityId}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load version history');
        return res.json();
      })
      .then((json: VersionHistoryResponse) => {
        setVersions(json.data);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load version history');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [document.id, communityId]);

  return (
    <div className="flex h-full flex-col rounded-md border border-edge bg-surface-card">
      <div className="flex items-center justify-between border-b border-edge px-4 py-3">
        <div>
          <h3 className="font-medium text-content">Version History</h3>
          <p className="text-sm text-content-tertiary">{document.title}</p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 text-content-tertiary hover:bg-surface-muted hover:text-content-secondary"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>

      <div className="border-b border-status-warning-border bg-status-warning-bg px-4 py-2">
        <p className="text-xs text-status-warning">
          <strong>Note:</strong> Grouped by same document title and category; this is not an explicit revision chain.
        </p>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-interactive border-t-transparent" />
            <span className="ml-2 text-sm text-content-secondary">Loading versions...</span>
          </div>
        )}

        {error && (
          <div className="p-4">
            <p className="text-sm text-status-danger">{error}</p>
          </div>
        )}

        {!isLoading && !error && versions.length === 0 && (
          <div className="p-8 text-center">
            <p className="text-sm text-content-secondary">No other versions found</p>
            <p className="text-xs text-content-tertiary">
              This is the only document with this title and category
            </p>
          </div>
        )}

        {!isLoading && !error && versions.length > 0 && (
          <div className="divide-y divide-edge">
            {versions.map((version, index) => (
              <div
                key={version.id}
                className={`flex items-center justify-between p-4 ${
                  version.id === document.id ? 'bg-interactive-subtle' : 'hover:bg-surface-hover'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-content">
                      {version.id === document.id ? 'Current Version' : `Version ${versions.length - index}`}
                    </p>
                    {version.id === document.id && (
                      <span className="rounded-full bg-interactive-subtle px-2 py-0.5 text-xs font-medium text-interactive">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-content-tertiary">
                    {version.fileName} &middot; {formatFileSize(version.fileSize)}
                  </p>
                  <p className="text-xs text-content-disabled">{formatDate(version.createdAt)}</p>
                </div>
                <div className="ml-4 flex items-center gap-2">
                  {version.id !== document.id && onSelectVersion && (
                    <button
                      type="button"
                      onClick={() => onSelectVersion(version)}
                      className="rounded-md border border-edge-strong px-3 py-1.5 text-sm text-content-secondary hover:bg-surface-hover"
                    >
                      View
                    </button>
                  )}
                  <a
                    href={`/api/v1/documents/${version.id}/download?communityId=${communityId}&attachment=true`}
                    className="rounded-md border border-edge-strong px-3 py-1.5 text-sm text-content-secondary hover:bg-surface-hover"
                  >
                    Download
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
