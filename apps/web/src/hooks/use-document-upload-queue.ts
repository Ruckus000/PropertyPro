'use client';

/**
 * State and sending for the multi-file upload queue.
 *
 * Each row uploads on its own: two at a time, each with its own progress, and
 * one row's failure does not stop the others or undo the ones that finished.
 * A failed row stays in the queue with the server's message so it can be fixed
 * and sent again; finished rows are dropped from the next send.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { indexLibraryByFileName, type LibraryDocumentRef } from '@/lib/documents/duplicate-uploads';
import {
  isReplacing,
  makeRows,
  sendableRows,
  type QueueAction,
  type QueueRow,
} from '@/lib/documents/upload-queue';
import { replaceDocumentFile, uploadDocumentFile } from './use-document-upload';

const CONCURRENCY = 2;

export interface QueueOutcome {
  sent: number;
  failed: number;
  /** Document ids created or whose file was replaced. */
  documentIds: number[];
  /** Uploads that went through but whose notifications could not be sent. */
  notificationWarnings: number;
}

export function useDocumentUploadQueue(options: {
  communityId: number;
  existingDocuments: readonly LibraryDocumentRef[];
  defaultCategoryId: number | null;
}) {
  const { communityId, existingDocuments, defaultCategoryId } = options;
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [isSending, setIsSending] = useState(false);
  // Read inside `send` so an edit made while a send is queued is not lost.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const duplicateIndex = useMemo(() => indexLibraryByFileName(existingDocuments), [existingDocuments]);

  const addFiles = useCallback(
    (files: readonly File[]) => {
      setRows((current) => [...current, ...makeRows(files, duplicateIndex, defaultCategoryId)]);
    },
    [defaultCategoryId, duplicateIndex],
  );

  const updateRow = useCallback((key: string, patch: Partial<QueueRow>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }, []);

  const removeRow = useCallback((key: string) => {
    setRows((current) => current.filter((row) => row.key !== key));
  }, []);

  const clear = useCallback(() => setRows([]), []);

  const send = useCallback(
    async (params: { action: QueueAction; redactionAttested: boolean }): Promise<QueueOutcome> => {
      const work = sendableRows(rowsRef.current);
      const outcome: QueueOutcome = { sent: 0, failed: 0, documentIds: [], notificationWarnings: 0 };
      setIsSending(true);

      const sendOne = async (row: QueueRow) => {
        setRows((current) =>
          current.map((r) => (r.key === row.key ? { ...r, status: 'uploading', progress: 0, error: null } : r)),
        );
        const onProgress = (progress: number) =>
          setRows((current) => current.map((r) => (r.key === row.key ? { ...r, progress } : r)));
        try {
          if (isReplacing(row)) {
            const result = await replaceDocumentFile(
              {
                communityId,
                documentId: row.duplicate.id,
                file: row.file,
                redactionAttested: params.redactionAttested,
              },
              onProgress,
            );
            outcome.documentIds.push(result.id);
          } else {
            const result = await uploadDocumentFile(
              {
                communityId,
                title: row.title.trim(),
                description: row.description.trim() || null,
                categoryId: row.categoryId as number,
                file: row.file,
                redactionAttested: params.action === 'post' ? params.redactionAttested : false,
                draft: params.action === 'draft',
              },
              onProgress,
            );
            outcome.documentIds.push(Number(result.document['id']));
            if (result.warnings.length > 0) outcome.notificationWarnings += 1;
          }
          outcome.sent += 1;
          setRows((current) =>
            current.map((r) => (r.key === row.key ? { ...r, status: 'done', progress: 100 } : r)),
          );
        } catch (error) {
          outcome.failed += 1;
          setRows((current) =>
            current.map((r) =>
              r.key === row.key
                ? {
                    ...r,
                    status: 'failed',
                    progress: 0,
                    error: error instanceof Error ? error.message : 'Upload failed. Please try again.',
                  }
                : r,
            ),
          );
        }
      };

      // A small worker pool: each worker takes the next row until none are left.
      let next = 0;
      const worker = async () => {
        while (next < work.length) {
          const row = work[next];
          next += 1;
          if (row) await sendOne(row);
        }
      };
      try {
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, work.length) }, worker));
      } finally {
        setIsSending(false);
      }
      return outcome;
    },
    [communityId],
  );

  return { rows, isSending, addFiles, updateRow, removeRow, clear, send };
}
