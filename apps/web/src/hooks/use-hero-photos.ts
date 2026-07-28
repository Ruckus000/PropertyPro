'use client';

/**
 * Sequential upload queue for a multi-image field.
 *
 * Named for the hero because that is where it started; the gallery block's
 * image list now uses it too via the `kind` option. The sequencing, per-file
 * status and alt-before-upload rules below are identical for both.
 *
 * Wraps the existing `useImageUpload` (presign → PUT → finalize) rather than
 * adding a second upload path — the phase's security summary is explicit that
 * the existing pipeline and its `validate-upload` checks are the only one.
 *
 * What this adds on top is sequencing, per-file status, and per-file alt text.
 *
 * Lives in a hook, not a component, because `guard:component-api-calls`
 * forbids components calling `/api/v1` directly and its allowlist is empty.
 * It issues no literal `/api/v1/` fetch of its own — every request goes
 * through `useImageUpload` — so `guard:hook-requestjson` never inspects it and
 * it must NOT be added to that guard's allowlist, which fails on dead entries.
 */

import { useCallback, useRef, useState } from 'react';
import { DECORATIVE_PLACEHOLDER_ALT } from '@/lib/site-assets/client-image';
import { useImageUpload, type ImageUploadResult } from './use-image-upload';

export type HeroPhotoUploadStatus = 'pending' | 'uploading' | 'done' | 'error';

/**
 * One file to upload, already described by the PM.
 *
 * Alt text is collected BEFORE the upload starts, not after. finalize requires
 * `altText: z.string().min(1)`, so there is no such thing as uploading first
 * and describing later — that combination presigns, PUTs the bytes, and only
 * then 400s, leaving an orphaned object behind every time.
 */
export interface HeroPhotoUploadItem {
  /** Caller-owned identity; doubles as the queue row id. */
  id: string;
  file: File;
  /** Destined for BLOCK CONTENT. Empty iff `decorative`. */
  alt: string;
  decorative: boolean;
}

export interface HeroPhotoUpload {
  localId: string;
  filename: string;
  status: HeroPhotoUploadStatus;
  error: string | null;
  result: ImageUploadResult | null;
}

export interface UseHeroPhotosOptions {
  communityId: number;
  /**
   * Which storage kind the files land under. Defaults to `'hero'` — this queue
   * predates the gallery block and every existing caller is the hero field.
   *
   * The queue itself is kind-agnostic: sequencing, per-file status and
   * alt-before-upload are the same problem for any multi-file list. Only the
   * presign `kind` differs, so the gallery reuses this rather than growing a
   * second copy of the same sequential loop.
   */
  kind?: 'hero' | 'content';
  /**
   * Called once per successfully finalized file, immediately.
   *
   * Deliberately per-file rather than once at the end of the queue: finalize
   * has already written the resized variants and charged the community's
   * storage quota, but nothing references them until this lands in block
   * content. Reporting late would widen the window in which a PM who navigates
   * away leaves orphaned bytes behind.
   *
   * The ITEM is handed back alongside the result because the authoritative alt
   * is the one the PM staged, never `result.altText` — which for a decorative
   * photo is a pipeline placeholder.
   */
  onUploaded: (result: ImageUploadResult, item: HeroPhotoUploadItem) => void;
}

export interface UseHeroPhotosResult {
  uploads: HeroPhotoUpload[];
  /** Queue described files. Resolves when the queue drains. */
  upload: (items: HeroPhotoUploadItem[]) => Promise<void>;
  /** Forget a finished row (the caller owns the durable list). */
  dismiss: (localId: string) => void;
  isUploading: boolean;
}

export function useHeroPhotos({
  communityId,
  kind = 'hero',
  onUploaded,
}: UseHeroPhotosOptions): UseHeroPhotosResult {
  const { mutateAsync } = useImageUpload({ communityId });
  const [uploads, setUploads] = useState<HeroPhotoUpload[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Read at fire time so a queue started with one callback does not keep
  // calling a stale one after a re-render.
  const onUploadedRef = useRef(onUploaded);
  onUploadedRef.current = onUploaded;

  const patch = useCallback((localId: string, next: Partial<HeroPhotoUpload>) => {
    setUploads((prev) =>
      prev.map((row) => (row.localId === localId ? { ...row, ...next } : row)),
    );
  }, []);

  const upload = useCallback(
    async (items: HeroPhotoUploadItem[]) => {
      if (items.length === 0) return;

      setUploads((prev) => [
        ...prev,
        ...items.map((item) => ({
          localId: item.id,
          filename: item.file.name,
          status: 'pending' as const,
          error: null,
          result: null,
        })),
      ]);
      setIsUploading(true);

      try {
        // Strictly sequential, NOT Promise.all.
        //
        // The presign route checks the community's storage quota per request;
        // parallel presigns race that check and can overshoot the plan limit.
        // Finalize also runs a sharp resize per file, so eight concurrent
        // 10 MB uploads is a load profile nothing here was sized for.
        for (const item of items) {
          const alt = item.alt.trim();

          // Belt and braces behind the UI gate. Sending '' is a guaranteed 400
          // AFTER the bytes are already in storage, so fail the row here
          // rather than stranding an object to prove the point.
          if (!item.decorative && alt.length === 0) {
            patch(item.id, {
              status: 'error',
              error: 'Describe this photo before adding it.',
            });
            continue;
          }

          patch(item.id, { status: 'uploading' });
          try {
            const result = await mutateAsync({
              file: item.file,
              kind,
              altText: item.decorative ? DECORATIVE_PLACEHOLDER_ALT : alt,
            });
            patch(item.id, { status: 'done', result });
            onUploadedRef.current(result, item);
          } catch (caught) {
            // One bad file must not abandon the rest of the queue.
            patch(item.id, {
              status: 'error',
              error: caught instanceof Error ? caught.message : 'Upload failed.',
            });
          }
        }
      } finally {
        setIsUploading(false);
      }
    },
    [mutateAsync, patch, kind],
  );

  const dismiss = useCallback((localId: string) => {
    setUploads((prev) => prev.filter((row) => row.localId !== localId));
  }, []);

  return { uploads, upload, dismiss, isUploading };
}
