'use client';

/**
 * State and sending for the multi-file upload queue.
 *
 * Each row uploads on its own: two at a time, each with its own progress, and
 * one row's failure does not stop the others or undo the ones that finished.
 * A failed row stays in the queue with the server's message so it can be fixed
 * and sent again; finished rows are dropped from the next send.
 *
 * A row POSTED into a record is uploaded without the server's auto-link, then
 * linked to that record: the person's choice is the only link. If the link
 * fails, the row keeps its document and the next send only links it. A draft
 * is never filed: the server refuses to link one (`assertDocumentInCommunity`),
 * and posting the draft later runs auto-link (`documents/route.ts`). Rows filed
 * by choice go before the rest, so an auto-link can never take a chosen record
 * only to have the choice replace it.
 * ponytail: a draft forgets the record chosen for it; once posted, auto-link files it only on an unambiguous match. Trigger: a manager reports a posted draft not filed as the record they chose.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { indexLibraryByFileName, type LibraryDocumentRef } from '@/lib/documents/duplicate-uploads';
import {
  chosenRecordId,
  isReplacing,
  makeRows,
  proposeRecords,
  sendableRows,
  type QueueAction,
  type QueueRow,
} from '@/lib/documents/upload-queue';
import { sentence } from '@/lib/documents/upload-rules';
import type { MissingRecord } from '@/lib/site-editor/records-status';
import { COMPLIANCE_QUERY_KEY } from './use-compliance-checklist';
import { patchChecklistItem } from './use-compliance-mutations';
import { replaceDocumentFile, uploadDocumentFile } from './use-document-upload';
import { recordsAlertQueryKey } from './use-records-alert';

const CONCURRENCY = 2;

export interface QueueOutcome {
  /** Files uploaded (a retry that only links is not counted again). */
  sent: number;
  failed: number;
  /** Of `failed`: uploaded, but not linked to the record chosen for them. */
  linkFailed: number;
  /** Document ids created or whose file was replaced. */
  documentIds: number[];
  /** Uploads that went through but whose notifications could not be sent. */
  notificationWarnings: number;
  /** Rows filed into the record chosen for them. */
  linked: number;
  /** Uploaded rows retried to link, whose record was filled elsewhere meanwhile: posted, not filed. */
  unfiled: number;
}

export function useDocumentUploadQueue(options: {
  communityId: number;
  existingDocuments: readonly LibraryDocumentRef[];
  defaultCategoryId: number | null;
  /** Records a file may be filed into (`recordsToFill`); empty on an apartment. */
  records?: readonly MissingRecord[];
  /** The library category a record files under, or null when there is none. */
  categoryForRecord?: (record: MissingRecord) => number | null;
}) {
  const { communityId, existingDocuments, defaultCategoryId, records, categoryForRecord } = options;
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [isSending, setIsSending] = useState(false);
  // Read inside `send` so an edit made while a send is queued is not lost.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const duplicateIndex = useMemo(() => indexLibraryByFileName(existingDocuments), [existingDocuments]);

  const addFiles = useCallback(
    (files: readonly File[]) => {
      setRows((current) => {
        const added = makeRows(files, duplicateIndex, defaultCategoryId);
        if (!records || records.length === 0) return [...current, ...added];
        // Only records no other file has claimed, so two files never fill one record by default.
        const claimed = new Set(current.flatMap((row) => chosenRecordId(row) ?? []));
        return [...current, ...proposeRecords(added, records, claimed, categoryForRecord ?? (() => null))];
      });
    },
    [categoryForRecord, defaultCategoryId, duplicateIndex, records],
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
      const outcome: QueueOutcome = {
        sent: 0,
        failed: 0,
        linkFailed: 0,
        documentIds: [],
        notificationWarnings: 0,
        linked: 0,
        unfiled: 0,
      };
      setIsSending(true);

      /** The record this row is filed into on this send, or null to leave it to auto-link. */
      const recordFor = (row: QueueRow) => {
        const chosen = chosenRecordId(row);
        // A record filled elsewhere since it was chosen has left the list: leave the file to auto-link.
        const open = chosen == null ? undefined : records?.find((record) => record.itemId === chosen);
        // An uploaded row is already posted (drafts are never linked), so its link is retried whatever the action.
        return open && (row.documentId != null || params.action === 'post') ? open : null;
      };

      const sendOne = async (row: QueueRow) => {
        setRows((current) =>
          current.map((r) => (r.key === row.key ? { ...r, status: 'uploading', progress: 0, error: null } : r)),
        );
        const onProgress = (progress: number) =>
          setRows((current) => current.map((r) => (r.key === row.key ? { ...r, progress } : r)));
        const record = recordFor(row);
        let documentId = row.documentId;
        let linkAttempted = false;
        try {
          if (documentId != null) {
            // Uploaded on an earlier send; only its link is left to do, unless its record has since been filled.
            if (record == null) outcome.unfiled += 1;
          } else if (isReplacing(row)) {
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
                // The record chosen here is the only link; the server must not add its own.
                skipAutoLink: record != null,
              },
              onProgress,
            );
            documentId = Number(result.document['id']);
            outcome.documentIds.push(documentId);
            if (result.warnings.length > 0) outcome.notificationWarnings += 1;
          }
          if (record != null && documentId != null) {
            const uploaded = documentId;
            setRows((current) => current.map((r) => (r.key === row.key ? { ...r, documentId: uploaded } : r)));
            linkAttempted = true;
            try {
              // An offered record may hold a draft, deleted or out-of-date file: replacing it is the point.
              await patchChecklistItem({
                id: record.itemId,
                communityId,
                action: 'link_document',
                documentId: uploaded,
                replace: true,
              });
            } catch (error) {
              throw new Error(
                `Posted, but we couldn’t file it as ${record.title}. ${sentence(
                  error instanceof Error && error.message ? error.message : 'Please try again',
                )} Post again to retry the link.`,
              );
            }
            outcome.linked += 1;
          }
          if (row.documentId == null) outcome.sent += 1;
          setRows((current) =>
            current.map((r) => (r.key === row.key ? { ...r, status: 'done', progress: 100 } : r)),
          );
        } catch (error) {
          outcome.failed += 1;
          if (linkAttempted) outcome.linkFailed += 1;
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
      const pool = async (rows: readonly QueueRow[]) => {
        let next = 0;
        const worker = async () => {
          while (next < rows.length) {
            const row = rows[next];
            next += 1;
            if (row) await sendOne(row);
          }
        };
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, worker));
      };
      try {
        // Chosen links land first; an auto-link that runs after them finds those records filled.
        await pool(work.filter((row) => recordFor(row) != null));
        await pool(work.filter((row) => recordFor(row) == null));
      } finally {
        setIsSending(false);
        // A chosen link, or the server's auto-link, may have filled a record.
        if (work.length > 0) {
          void queryClient.invalidateQueries({ queryKey: [COMPLIANCE_QUERY_KEY, communityId] });
          // The nav badge counts missing records too.
          void queryClient.invalidateQueries({ queryKey: recordsAlertQueryKey(communityId) });
        }
      }
      return outcome;
    },
    [communityId, queryClient, records],
  );

  return { rows, isSending, addFiles, updateRow, removeRow, clear, send };
}
