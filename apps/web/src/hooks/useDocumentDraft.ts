'use client';

/**
 * Document-draft hook family — TanStack Query wrappers around the drafts
 * API (PR 3). Used by the author UI pages.
 *
 *   - useDocumentDraft(communityId, draftId)        — load + soft-lock metadata
 *   - useCreateDocumentDraft(communityId)           — POST /api/v1/documents/drafts
 *   - useSaveDocumentDraft(communityId, draftId)    — debounced PATCH (autosave)
 *   - useDeleteDocumentDraft(communityId, draftId)  — DELETE
 *   - useUploadDraftImage(communityId, draftId)     — multipart image upload
 *   - useDocumentSearch(communityId, draftId)       — link picker results
 *   - usePublishDocumentDraft(communityId, draftId) — fires Chromium publish
 */
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';

export interface DocumentDraft {
  id: number;
  communityId: number;
  authorId: string;
  title: string;
  bodyHtml: string;
  targetCategoryId: number | null;
  targetMeetingId: number | null;
  sourceDocumentId: number | null;
  coverSheetEnabled: boolean;
  letterheadOptions: { header?: boolean; footer?: boolean };
  lastEditorId: string | null;
  lastEditedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentLinkPickerResult {
  documentId: number;
  title: string;
  category: string | null;
  mimeType: string;
}

interface CreateDraftInput {
  title?: string;
  targetCategoryId?: number | null;
  targetMeetingId?: number | null;
  sourceDocumentId?: number | null;
  initialBodyHtml?: string;
}

interface PatchDraftInput {
  title?: string;
  bodyHtml?: string;
  targetCategoryId?: number | null;
  coverSheetEnabled?: boolean;
  letterheadOptions?: { header?: boolean; footer?: boolean };
}

const KEYS = {
  all: ['document-drafts'] as const,
  list: (communityId: number) => [...KEYS.all, 'list', communityId] as const,
  detail: (communityId: number, draftId: number) =>
    [...KEYS.all, 'detail', communityId, draftId] as const,
  search: (communityId: number, draftId: number, q: string) =>
    [...KEYS.all, 'search', communityId, draftId, q] as const,
};

function qs(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    sp.set(key, String(value));
  }
  return sp.toString();
}

export function useDocumentDraft(communityId: number, draftId: number | null) {
  return useQuery({
    queryKey:
      draftId == null
        ? ([...KEYS.all, 'detail', communityId, 'none'] as const)
        : KEYS.detail(communityId, draftId),
    queryFn: async () =>
      requestJson<DocumentDraft>(
        `/api/v1/documents/drafts/${draftId}?${qs({ communityId })}`,
      ),
    enabled: communityId > 0 && draftId !== null,
  });
}

export function useCreateDocumentDraft(communityId: number) {
  return useMutation({
    mutationFn: async (input: CreateDraftInput) =>
      requestJson<DocumentDraft>('/api/v1/documents/drafts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, ...input }),
      }),
  });
}

export function useSaveDocumentDraft(communityId: number, draftId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: PatchDraftInput) => {
      if (draftId == null) throw new Error('No draft id');
      return requestJson<DocumentDraft>(
        `/api/v1/documents/drafts/${draftId}?${qs({ communityId })}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input),
        },
      );
    },
    onSuccess: (data) => {
      if (draftId == null) return;
      queryClient.setQueryData(KEYS.detail(communityId, draftId), data);
    },
  });
}

export function useDeleteDocumentDraft(communityId: number, draftId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (draftId == null) throw new Error('No draft id');
      return requestJson<{ id: number; deleted: true }>(
        `/api/v1/documents/drafts/${draftId}?${qs({ communityId })}`,
        { method: 'DELETE' },
      );
    },
    onSuccess: () => {
      if (draftId == null) return;
      queryClient.removeQueries({ queryKey: KEYS.detail(communityId, draftId) });
    },
  });
}

export function useUploadDraftImage(communityId: number, draftId: number | null) {
  return useMutation({
    mutationFn: async (file: File) => {
      if (draftId == null) throw new Error('No draft id');
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(
        `/api/v1/documents/drafts/${draftId}/images?${qs({ communityId })}`,
        { method: 'POST', body: fd },
      );
      const body = (await res.json()) as {
        data?: { url: string; path: string; mimeType: string; size: number };
        error?: { message?: string };
      };
      if (!res.ok || !body.data) {
        throw new Error(body.error?.message ?? 'Image upload failed');
      }
      return body.data;
    },
  });
}

export function useDocumentSearch(
  communityId: number,
  draftId: number | null,
  query: string,
) {
  const trimmed = query.trim();
  return useQuery({
    queryKey:
      draftId == null
        ? ([...KEYS.all, 'search', communityId, 'none', trimmed] as const)
        : KEYS.search(communityId, draftId, trimmed),
    queryFn: async () =>
      requestJson<DocumentLinkPickerResult[]>(
        `/api/v1/documents/drafts/${draftId}/document-search?${qs({
          communityId,
          q: trimmed.length > 0 ? trimmed : undefined,
        })}`,
      ),
    enabled: communityId > 0 && draftId !== null,
    staleTime: 30_000,
  });
}

export function usePublishDocumentDraft(communityId: number, draftId: number | null) {
  return useMutation({
    mutationFn: async () => {
      if (draftId == null) throw new Error('No draft id');
      return requestJson<{ documentId: number; warnings?: Array<{ code: string; message: string }> }>(
        `/api/v1/documents/drafts/${draftId}/publish?${qs({ communityId })}`,
        { method: 'POST' },
      );
    },
  });
}

/**
 * Debounced autosave: returns a `save(input)` callback that defers a PATCH
 * to the API by `delayMs` of idle. Cancels a pending save if a new one
 * arrives. Caller is responsible for tracking dirty state.
 */
export function useAutosave(
  communityId: number,
  draftId: number | null,
  delayMs: number = 5000,
) {
  const save = useSaveDocumentDraft(communityId, draftId);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = React.useRef<PatchDraftInput | null>(null);
  // Tracks the in-flight mutation so flush() can await any save that is
  // already running before deciding whether to start another. Without
  // this, clicking "Publish" the moment after typing would fire publish
  // alongside an in-flight autosave, and the published doc could miss
  // the latest edits.
  const inflight = React.useRef<Promise<unknown> | null>(null);

  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const flush = React.useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    // Wait for any in-flight save to finish first.
    if (inflight.current) {
      try {
        await inflight.current;
      } catch {
        // The error is already surfaced via `save.error`; we just need to
        // stop blocking flush.
      }
    }
    if (!pending.current) return null;
    const input = pending.current;
    pending.current = null;
    const promise = save.mutateAsync(input);
    inflight.current = promise;
    try {
      return await promise;
    } catch (err) {
      // Roll back: re-merge the failed input back into pending so a later
      // schedule() / flush() picks it up instead of dropping it on the floor.
      pending.current = { ...input, ...(pending.current ?? {}) };
      throw err;
    } finally {
      if (inflight.current === promise) inflight.current = null;
    }
  }, [save]);

  const schedule = React.useCallback(
    (input: PatchDraftInput) => {
      pending.current = { ...(pending.current ?? {}), ...input };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void flush();
      }, delayMs);
    },
    [delayMs, flush],
  );

  return { schedule, flush, isSaving: save.isPending, error: save.error };
}
