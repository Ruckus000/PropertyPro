'use client';

/**
 * Upload queue for hero photos.
 *
 * Wraps the existing `useImageUpload` (presign → PUT → finalize) rather than
 * adding a second upload path — the phase's security summary is explicit that
 * the existing pipeline and its `validate-upload` checks are the only one.
 *
 * What this adds on top is sequencing and per-file status, which a bare
 * mutation cannot express for a multi-file picker.
 *
 * Lives in a hook, not a component, because `guard:component-api-calls`
 * forbids components calling `/api/v1` directly and its allowlist is empty.
 * It issues no literal `/api/v1/` fetch of its own — every request goes
 * through `useImageUpload` — so `guard:hook-requestjson` never inspects it and
 * it must NOT be added to that guard's allowlist, which fails on dead entries.
 */

import { useCallback, useRef, useState } from 'react';
import { useImageUpload, type ImageUploadResult } from './use-image-upload';

export type HeroPhotoUploadStatus = 'pending' | 'uploading' | 'done' | 'error';

export interface HeroPhotoUpload {
  /** Client-side identity. Storage paths do not exist until finalize returns. */
  localId: string;
  filename: string;
  status: HeroPhotoUploadStatus;
  error: string | null;
  result: ImageUploadResult | null;
}

export interface UseHeroPhotosOptions {
  communityId: number;
  /**
   * Called once per successfully finalized file, immediately.
   *
   * Deliberately per-file rather than once at the end of the queue: finalize
   * has already written the resized variants and charged the community's
   * storage quota, but nothing references them until this lands in block
   * content. Reporting late would widen the window in which a PM who navigates
   * away leaves orphaned bytes behind.
   */
  onUploaded: (result: ImageUploadResult) => void;
}

export interface UseHeroPhotosResult {
  uploads: HeroPhotoUpload[];
  /** Queue files. Resolves when the queue drains. */
  upload: (files: File[], altText: string) => Promise<void>;
  /** Forget a finished row (the caller owns the durable list). */
  dismiss: (localId: string) => void;
  isUploading: boolean;
}

export function useHeroPhotos({
  communityId,
  onUploaded,
}: UseHeroPhotosOptions): UseHeroPhotosResult {
  const { mutateAsync } = useImageUpload({ communityId });
  const [uploads, setUploads] = useState<HeroPhotoUpload[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Read at fire time so a queue started with one callback does not keep
  // calling a stale one after a re-render.
  const onUploadedRef = useRef(onUploaded);
  onUploadedRef.current = onUploaded;

  const seqRef = useRef(0);

  const patch = useCallback((localId: string, next: Partial<HeroPhotoUpload>) => {
    setUploads((prev) =>
      prev.map((row) => (row.localId === localId ? { ...row, ...next } : row)),
    );
  }, []);

  const upload = useCallback(
    async (files: File[], altText: string) => {
      if (files.length === 0) return;

      const queued: HeroPhotoUpload[] = files.map((file) => {
        seqRef.current += 1;
        return {
          localId: `upload-${seqRef.current}`,
          filename: file.name,
          status: 'pending',
          error: null,
          result: null,
        };
      });
      setUploads((prev) => [...prev, ...queued]);
      setIsUploading(true);

      try {
        // Strictly sequential, NOT Promise.all.
        //
        // The presign route checks the community's storage quota per request;
        // parallel presigns race that check and can overshoot the plan limit.
        // Finalize also runs a sharp resize per file, so eight concurrent
        // 10 MB uploads is a load profile nothing here was sized for.
        for (const [index, file] of files.entries()) {
          const row = queued[index]!;
          patch(row.localId, { status: 'uploading' });
          try {
            const result = await mutateAsync({ file, kind: 'hero', altText });
            patch(row.localId, { status: 'done', result });
            onUploadedRef.current(result);
          } catch (caught) {
            // One bad file must not abandon the rest of the queue.
            patch(row.localId, {
              status: 'error',
              error: caught instanceof Error ? caught.message : 'Upload failed.',
            });
          }
        }
      } finally {
        setIsUploading(false);
      }
    },
    [mutateAsync, patch],
  );

  const dismiss = useCallback((localId: string) => {
    setUploads((prev) => prev.filter((row) => row.localId !== localId));
  }, []);

  return { uploads, upload, dismiss, isUploading };
}
