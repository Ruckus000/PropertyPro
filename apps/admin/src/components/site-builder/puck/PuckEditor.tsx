'use client';

/**
 * PuckEditor — Puck-based visual site builder that wraps the translation layer.
 *
 * Replaces BlockEditor when the NEXT_PUBLIC_USE_PUCK_EDITOR feature flag is set.
 * Uses the same API endpoints so both editors can coexist during transition.
 *
 * ADR-002 improvements:
 * - #5: "Live Preview" toggle shows real iframe alongside Puck canvas
 * - #7: onAction-based dirty tracking avoids full-page diff on every debounce
 * - #14: Accepts community branding for future theme integration
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Puck } from '@puckeditor/core';
import '@puckeditor/core/puck.css';
import type { Data } from '@puckeditor/core';
import { Loader2, Eye, EyeOff } from 'lucide-react';

import { puckConfig } from './config';
import {
  rowsToPuckData,
  diffPuckData,
  diffDirtyBlocks,
  classifyAction,
  applyChangeSet,
  mergeApplyResult,
  type SiteBlockRow,
  type IdMap,
  type KnownState,
} from './translate';
import { extractApiError } from '../shared/extractApiError';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { PreviewPanel } from '../PreviewPanel';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/** Branding data from the communities table (jsonb column). */
export interface CommunityBranding {
  primaryColor?: string;
  secondaryColor?: string;
  logoPath?: string;
}

interface PuckEditorProps {
  communityId: number;
  communitySlug: string;
  /** Community branding for theme context (ADR-002 #14). */
  branding?: CommunityBranding | null;
}

// ---------------------------------------------------------------------------
// PuckEditor component
// ---------------------------------------------------------------------------

export function PuckEditor({ communityId, communitySlug, branding }: PuckEditorProps) {
  const [initialData, setInitialData] = useState<Data | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<'publish' | 'discard' | null>(null);

  // ADR-002 #5: Live preview toggle
  const [showLivePreview, setShowLivePreview] = useState(false);

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

  // ADR-002 #7: Dirty tracking — only diff changed blocks on content-only changes
  const dirtyPuckIdsRef = useRef<Set<string>>(new Set());
  const needsFullDiffRef = useRef(false);

  // Track whether we have any drafts for the discard button
  const [hasDrafts, setHasDrafts] = useState(false);

  // Store branding in a ref for future use in Puck config resolveData
  const brandingRef = useRef(branding);
  brandingRef.current = branding;

  // ---------------------------------------------------------------------------
  // Error helper — avoids repeated instanceof checks (ADR-002 review feedback)
  // ---------------------------------------------------------------------------

  const handleError = useCallback((err: unknown, fallback: string) => {
    setError(err instanceof Error ? err.message : fallback);
  }, []);

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
      handleError(err, 'Failed to load blocks');
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
  // ADR-002 #7: Uses dirty set for content-only changes, full diff for structural
  // ---------------------------------------------------------------------------

  const flushSaves = useCallback(async () => {
    const data = latestDataRef.current;
    if (!data || isSavingRef.current) return;

    // Choose targeted or full diff based on action tracking
    const dirty = dirtyPuckIdsRef.current;
    const needsFull = needsFullDiffRef.current;

    // Reset dirty tracking for next cycle
    dirtyPuckIdsRef.current = new Set();
    needsFullDiffRef.current = false;

    const changeSet =
      !needsFull && dirty.size > 0
        ? diffDirtyBlocks(data, idMapRef.current, knownStateRef.current, dirty)
        : diffPuckData(data, idMapRef.current, knownStateRef.current);

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
      handleError(err, 'Auto-save failed');
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
  // ADR-002 #7: onAction — track which blocks are dirty for targeted diffing
  // ---------------------------------------------------------------------------

  const handleAction = useCallback(
    (action: { type: string; destinationIndex?: number; index?: number }, appState: { data: Data }) => {
      const kind = classifyAction(action.type);
      if (kind === null) return; // UI-only action, ignore

      if (kind === 'structural') {
        // Structural change (insert, remove, reorder, etc.) — needs full diff
        needsFullDiffRef.current = true;
      } else {
        // Content change (replace) — mark the specific block as dirty
        const idx = action.destinationIndex ?? action.index;
        if (idx !== undefined && appState.data.content[idx]) {
          const puckId = appState.data.content[idx].props.id as string;
          dirtyPuckIdsRef.current.add(puckId);
        } else {
          // Can't identify the block — fall back to full diff
          needsFullDiffRef.current = true;
        }
      }
    },
    [],
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
      handleError(err, 'Failed to publish');
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
      handleError(err, 'Failed to discard drafts');
    }
  }, [communityId, loadBlocks]);

  // ---------------------------------------------------------------------------
  // Puck publish button callback (triggers our publish confirmation)
  // ---------------------------------------------------------------------------

  const handlePuckPublish = useCallback(
    async (_data: Data) => {
      if (isSavingRef.current) {
        setError('A save is currently in progress. Please try publishing again in a moment.');
        return;
      }
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
          {/* ADR-002 #5: Live Preview toggle */}
          <button
            type="button"
            onClick={() => setShowLivePreview((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
              showLivePreview
                ? 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {showLivePreview ? <EyeOff size={12} /> : <Eye size={12} />}
            {showLivePreview ? 'Hide' : 'Live'} Preview
          </button>
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

      {/* Puck editor + optional Live Preview */}
      <div className="flex flex-1 overflow-hidden">
        <div className={showLivePreview ? 'w-3/5 overflow-hidden' : 'flex-1 overflow-hidden'}>
          <Puck
            config={puckConfig}
            data={initialData}
            onChange={handleChange}
            onAction={handleAction}
            onPublish={handlePuckPublish}
            headerTitle={communitySlug}
          />
        </div>

        {/* ADR-002 #5: Live Preview panel — shows real rendered site with actual data */}
        {showLivePreview && (
          <div className="w-2/5 border-l border-gray-200 overflow-hidden">
            <PreviewPanel communitySlug={communitySlug} />
          </div>
        )}
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
