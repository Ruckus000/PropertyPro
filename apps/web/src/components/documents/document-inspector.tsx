'use client';

/**
 * The right-hand pane: what this record is, and what can be done to it.
 *
 * Absorbs the verbs that used to live on each list row in
 * `document-list-container.tsx` — download and delete. Putting them here rather
 * than on every row is what lets the table carry the statutory columns without
 * becoming unreadable, and it means the destructive verb sits next to the
 * document it applies to rather than in a row the eye has already left.
 */

import { Download, Globe, Lock, RotateCcw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useDeleteDocument } from '@/hooks/use-documents';
import type { ChecklistRow, DocumentRow, DocumentState } from '@/lib/documents/document-state';
import { DocumentVersionHistory } from './document-version-history';
import { DocumentViewer } from './document-viewer';

type InspectorMode = 'viewer' | 'versions';

interface DocumentInspectorProps {
  communityId: number;
  document: DocumentRow | null;
  requirement: ChecklistRow | null;
  state: DocumentState | null;
  canManage: boolean;
  /** Whether the statutory line is meaningful — see DocumentsTable. */
  showStatutory: boolean;
  /** This record is soft-deleted — the board's Deleted column selected it. */
  isDeleted?: boolean;
  /** The board and this panel share one review dialog, owned by the screen. */
  onRequestPublish: (document: DocumentRow, publishing: boolean) => void;
  onRestore: (document: DocumentRow) => void;
  onDeleted: (document: DocumentRow) => void;
  onClose: () => void;
}

export function DocumentInspector({
  communityId,
  document,
  requirement,
  state,
  canManage,
  showStatutory,
  isDeleted = false,
  onRequestPublish,
  onRestore,
  onDeleted,
  onClose,
}: DocumentInspectorProps) {
  const [mode, setMode] = useState<InspectorMode>('viewer');
  const [preview, setPreview] = useState<DocumentRow | null>(document);
  const deleteMutation = useDeleteDocument(communityId);

  // Selecting a different record resets the pane; without this, opening a
  // second document while the version history is open shows the new title
  // above the previous document's chain.
  useEffect(() => {
    setMode('viewer');
    setPreview(document);
  }, [document]);

  const handleDownload = useCallback(() => {
    if (!preview) return;
    window.open(
      `/api/v1/documents/${preview.id}/download?communityId=${communityId}&attachment=true`,
      '_blank',
    );
  }, [communityId, preview]);

  const handleDelete = useCallback(async () => {
    if (!document || !canManage) return;
    // Native confirm() preserves the prior behaviour of the row-level verb.
    if (typeof window !== 'undefined' && !window.confirm(`Are you sure you want to delete "${document.title}"?`)) {
      return;
    }
    try {
      await deleteMutation.mutateAsync({ id: document.id });
      toast.success('Document deleted.');
      onDeleted(document);
    } catch {
      // Surfaced below via the mutation's error state.
    }
  }, [canManage, deleteMutation, document, onDeleted]);

  const isPublic = state === 'public';

  if (!document) {
    return <DocumentViewer communityId={communityId} document={null} onClose={onClose} />;
  }

  return (
    <div className="space-y-4">
      {showStatutory && (
        <div className="rounded-md border border-edge bg-surface-subtle p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-content-tertiary">
            Statutory record
          </p>
          {requirement ? (
            <>
              <p className="mt-1 text-sm text-content">{requirement.title}</p>
              {requirement.statuteReference && (
                <p className="text-xs tabular-nums text-content-secondary">
                  {requirement.statuteReference}
                </p>
              )}
            </>
          ) : (
            <p className="mt-1 text-sm text-content-secondary">
              No requirement points at this file. Link it from Compliance so it counts as
              evidence.
            </p>
          )}
          {state === 'owed' && (
            <p className="mt-2 text-xs text-status-warning">
              Not on the public site.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={handleDownload}>
          <Download className="size-4" aria-hidden="true" />
          Download
        </Button>
        {canManage && isDeleted && (
          <Button variant="outline" size="sm" onClick={() => onRestore(document)}>
            <RotateCcw className="size-4" aria-hidden="true" />
            Restore
          </Button>
        )}
        {canManage && showStatutory && !isDeleted && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onRequestPublish(document, !isPublic)}
          >
            {isPublic ? (
              <Lock className="size-4" aria-hidden="true" />
            ) : (
              <Globe className="size-4" aria-hidden="true" />
            )}
            {isPublic ? 'Remove from public site' : 'Put on public site'}
          </Button>
        )}
        {canManage && !isDeleted && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleDelete()}
            loading={deleteMutation.isPending}
            className="text-status-danger hover:bg-status-danger-bg hover:text-status-danger"
          >
            <Trash2 className="size-4" aria-hidden="true" />
            Delete
          </Button>
        )}
      </div>

      {deleteMutation.error instanceof Error && (
        <p role="alert" className="text-sm text-status-danger">
          {deleteMutation.error.message}
        </p>
      )}

      {mode === 'viewer' && (
        <DocumentViewer
          canEditAuthored={canManage}
          communityId={communityId}
          document={preview}
          onClose={onClose}
          onViewVersions={() => setMode('versions')}
        />
      )}

      {mode === 'versions' && (
        <DocumentVersionHistory
          communityId={communityId}
          document={document}
          onClose={() => setMode('viewer')}
          onSelectVersion={(version) => {
            setPreview({
              ...document,
              id: version.id,
              fileName: version.fileName,
              fileSize: version.fileSize,
              mimeType: version.mimeType,
              createdAt: version.createdAt,
            });
            setMode('viewer');
          }}
        />
      )}
    </div>
  );
}
