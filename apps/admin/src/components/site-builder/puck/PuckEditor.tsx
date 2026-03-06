'use client';

/**
 * PuckEditor — Puck-based visual site builder that wraps the translation layer.
 *
 * Replaces BlockEditor when the NEXT_PUBLIC_USE_PUCK_EDITOR feature flag is set.
 * Uses the same API endpoints so both editors can coexist during transition.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Puck } from '@puckeditor/core';
import '@puckeditor/core/puck.css';
import type { Data } from '@puckeditor/core';
import { Loader2 } from 'lucide-react';

import { puckConfig } from './config';
import {
  rowsToPuckData,
  diffPuckData,
  applyChangeSet,
  mergeApplyResult,
  type SiteBlockRow,
  type IdMap,
  type KnownState,
} from './translate';
import { extractApiError } from '../shared/extractApiError';
import { ConfirmDialog } from '../shared/ConfirmDialog';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PuckEditorProps {
  communityId: number;
  communitySlug: string;
}

// ---------------------------------------------------------------------------
// PuckEditor component
// ---------------------------------------------------------------------------

export function PuckEditor({ communityId, communitySlug }: PuckEditorProps) {
  const [initialData, setInitialData] = useState<Data | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<'publish' | 'discard' | null>(null);

  // Refs for the translation layer state (persisted across renders)
  const idMapRef = useRef<IdMap>(new Map());
  const knownStateRef = useRef<KnownState>({
    content: new Map(),
    order: [],
    drafts: new Map(),
  });

  // Debounce refs
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestDataRef = useRef<Data | null>(null);
  const isSavingRef = useRef(false);

  // Track whether we have any drafts for the discard button
  const [hasDrafts, setHasDrafts] = useState(false);

  // ---------------------------------------------------------------------------
  // Load blocks from API
  // ---------------------------------------------------------------------------

  const loadBlocks = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/site-blocks?communityId=${communityId}`);
      if (!res.ok) throw new Error(await extractApiError(res));
      const json = (await res.json()) as { data: SiteBlockRow[] };

      const { data, idMap, knownState } = rowsToPuckData(json.data);
      idMapRef.current = idMap;
      knownStateRef.current = knownState;
      setInitialData(data);
      setHasDrafts(json.data.some((r) => r.is_draft));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load blocks');
    } finally {
      setIsLoading(false);
    }
  }, [communityId]);

  useEffect(() => {
    void loadBlocks();
  }, [loadBlocks]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Auto-save with debounce (1000ms)
  // ---------------------------------------------------------------------------

  const flushSaves = useCallback(async () => {
    const data = latestDataRef.current;
    if (!data || isSavingRef.current) return;

    const changeSet = diffPuckData(data, idMapRef.current, knownStateRef.current);
    const hasChanges =
      changeSet.creates.length > 0 ||
      changeSet.updates.length > 0 ||
      changeSet.deletes.length > 0 ||
      changeSet.reorder !== null;

    if (!hasChanges) return;

    isSavingRef.current = true;
    setIsSaving(true);

    try {
      const result = await applyChangeSet(changeSet, communityId);

      // Update known state with successful operations
      mergeApplyResult(result, changeSet, data, idMapRef.current, knownStateRef.current);

      if (!result.ok) {
        setError(result.errors.join('; '));
        // Critical #4: Re-fetch on partial failure to re-sync
        await loadBlocks();
      } else {
        // After any create, we have new drafts
        if (changeSet.creates.length > 0) {
          setHasDrafts(true);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Auto-save failed');
      // Re-fetch on unexpected error
      await loadBlocks();
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }, [communityId, loadBlocks]);

  const handleChange = useCallback(
    (data: Data) => {
      latestDataRef.current = data;

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = setTimeout(() => {
        void flushSaves();
      }, 1000);
    },
    [flushSaves],
  );

  // ---------------------------------------------------------------------------
  // Publish / Discard
  // ---------------------------------------------------------------------------

  const handlePublish = useCallback(async () => {
    setConfirmDialog(null);
    setIsPublishing(true);
    setError(null);

    // Flush pending saves first
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    await flushSaves();

    try {
      const res = await fetch('/api/admin/site-blocks/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId }),
      });
      if (!res.ok) throw new Error(await extractApiError(res));
      // Reload to reflect published state
      await loadBlocks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish');
    } finally {
      setIsPublishing(false);
    }
  }, [communityId, flushSaves, loadBlocks]);

  const handleDiscard = useCallback(async () => {
    setConfirmDialog(null);
    setError(null);
    try {
      const res = await fetch('/api/admin/site-blocks/discard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId }),
      });
      if (!res.ok) throw new Error(await extractApiError(res));
      await loadBlocks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to discard drafts');
    }
  }, [communityId, loadBlocks]);

  // ---------------------------------------------------------------------------
  // Puck publish button callback (triggers our publish confirmation)
  // ---------------------------------------------------------------------------

  const handlePuckPublish = useCallback(
    async (_data: Data) => {
      // Save the latest state first, then show confirm dialog
      latestDataRef.current = _data;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      await flushSaves();
      setConfirmDialog('publish');
    },
    [flushSaves],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (isLoading || !initialData) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Status bar */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
        <div className="flex items-center gap-3">
          {isSaving && (
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Loader2 size={12} className="animate-spin" />
              Saving...
            </span>
          )}
          {isPublishing && (
            <span className="flex items-center gap-1 text-xs text-blue-500">
              <Loader2 size={12} className="animate-spin" />
              Publishing...
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasDrafts && (
            <button
              type="button"
              onClick={() => setConfirmDialog('discard')}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Discard Drafts
            </button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-2 text-red-500 hover:text-red-700 text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Puck editor */}
      <div className="flex-1 overflow-hidden">
        <Puck
          config={puckConfig}
          data={initialData}
          onChange={handleChange}
          onPublish={handlePuckPublish}
          headerTitle={communitySlug}
        />
      </div>

      {/* Confirmation dialogs */}
      {confirmDialog === 'publish' && (
        <ConfirmDialog
          title="Publish Site"
          message="This will publish all draft blocks to the live community website. Visitors will see the changes immediately."
          confirmLabel="Publish Now"
          confirmVariant="primary"
          onConfirm={handlePublish}
          onCancel={() => setConfirmDialog(null)}
        />
      )}

      {confirmDialog === 'discard' && (
        <ConfirmDialog
          title="Discard Drafts"
          message="This will permanently delete all unpublished draft blocks. Published blocks will not be affected. This action cannot be undone."
          confirmLabel="Discard Drafts"
          confirmVariant="danger"
          onConfirm={handleDiscard}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  );
}
