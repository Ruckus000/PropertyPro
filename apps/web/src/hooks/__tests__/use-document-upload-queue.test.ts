import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { uploadDocumentFileMock, replaceDocumentFileMock, patchChecklistItemMock } = vi.hoisted(() => ({
  uploadDocumentFileMock: vi.fn(),
  replaceDocumentFileMock: vi.fn(),
  patchChecklistItemMock: vi.fn(),
}));

vi.mock('../use-document-upload', () => ({
  uploadDocumentFile: uploadDocumentFileMock,
  replaceDocumentFile: replaceDocumentFileMock,
}));
vi.mock('../use-compliance-mutations', () => ({
  patchChecklistItem: patchChecklistItemMock,
}));

import { useDocumentUploadQueue } from '../use-document-upload-queue';

const LIBRARY = [
  { id: 71, title: 'Budget', fileName: 'budget.pdf', categoryId: 1, sourceType: 'library', postedAt: '2026-01-01T00:00:00Z' },
];

function pdf(name: string): File {
  return new File(['%PDF-1.4'], name, { type: 'application/pdf' });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const RECORDS = [
  { itemId: 11, templateKey: '718_budget', title: 'Annual Budget', category: 'financial_records', state: 'nothing_posted' as const },
];

let queryClient: QueryClient;

function setup(records?: typeof RECORDS) {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return renderHook(
    (props: { records?: typeof RECORDS }) =>
      useDocumentUploadQueue({
        communityId: 8,
        existingDocuments: LIBRARY,
        defaultCategoryId: 3,
        records: props.records,
        categoryForRecord: () => 2,
      }),
    { wrapper, initialProps: { records } },
  );
}

describe('useDocumentUploadQueue', () => {
  beforeEach(() => {
    // Reset, not clear: a failing test must not leave queued once-values for the next.
    vi.resetAllMocks();
  });

  it('uploads two at a time, never more', async () => {
    const pending = [deferred<unknown>(), deferred<unknown>(), deferred<unknown>()];
    let inFlight = 0;
    let peak = 0;
    uploadDocumentFileMock.mockImplementation(async () => {
      const d = pending[uploadDocumentFileMock.mock.calls.length - 1]!;
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      try {
        return await d.promise;
      } finally {
        inFlight -= 1;
      }
    });
    const { result } = setup();
    act(() => result.current.addFiles([pdf('a.pdf'), pdf('b.pdf'), pdf('c.pdf')]));

    let send!: Promise<unknown>;
    act(() => {
      send = result.current.send({ action: 'post', redactionAttested: false });
    });
    await vi.waitFor(() => expect(uploadDocumentFileMock).toHaveBeenCalledTimes(2));
    expect(peak).toBe(2);

    await act(async () => {
      pending[0]!.resolve({ document: { id: 1 }, warnings: [] });
      pending[1]!.resolve({ document: { id: 2 }, warnings: [] });
    });
    await vi.waitFor(() => expect(uploadDocumentFileMock).toHaveBeenCalledTimes(3));
    await act(async () => {
      pending[2]!.resolve({ document: { id: 3 }, warnings: [] });
      await send;
    });
    expect(peak).toBe(2);
  });

  it('one failure does not stop the others, and keeps the server’s message on its row', async () => {
    uploadDocumentFileMock
      .mockResolvedValueOnce({ document: { id: 1 }, warnings: [] })
      .mockRejectedValueOnce(new Error('This document category commonly contains protected personal information.'))
      .mockResolvedValueOnce({ document: { id: 3 }, warnings: [] });
    const { result } = setup();
    act(() => result.current.addFiles([pdf('a.pdf'), pdf('b.pdf'), pdf('c.pdf')]));

    let outcome: Awaited<ReturnType<typeof result.current.send>> | undefined;
    await act(async () => {
      outcome = await result.current.send({ action: 'post', redactionAttested: false });
    });

    expect(outcome).toMatchObject({ sent: 2, failed: 1, documentIds: [1, 3] });
    const failed = result.current.rows.filter((r) => r.status === 'failed');
    expect(failed).toHaveLength(1);
    expect(failed[0]?.error).toMatch(/protected personal information/);
    expect(result.current.rows.filter((r) => r.status === 'done')).toHaveLength(2);
  });

  it('a retry sends only the failed row', async () => {
    uploadDocumentFileMock
      .mockResolvedValueOnce({ document: { id: 1 }, warnings: [] })
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ document: { id: 2 }, warnings: [] });
    const { result } = setup();
    act(() => result.current.addFiles([pdf('a.pdf'), pdf('b.pdf')]));
    await act(async () => {
      await result.current.send({ action: 'post', redactionAttested: false });
    });

    await act(async () => {
      await result.current.send({ action: 'post', redactionAttested: false });
    });

    expect(uploadDocumentFileMock).toHaveBeenCalledTimes(3);
    expect(uploadDocumentFileMock.mock.calls[2]?.[0]).toMatchObject({ title: 'b' });
  });

  it('"Save as draft" creates drafts and sends no attestation for them', async () => {
    uploadDocumentFileMock.mockResolvedValue({ document: { id: 1 }, warnings: [] });
    const { result } = setup();
    act(() => result.current.addFiles([pdf('Rules.pdf')]));

    await act(async () => {
      await result.current.send({ action: 'draft', redactionAttested: true });
    });

    expect(uploadDocumentFileMock).toHaveBeenCalledWith(
      expect.objectContaining({ communityId: 8, title: 'Rules', categoryId: 3, draft: true, redactionAttested: false }),
      expect.any(Function),
    );
  });

  it('a same-name file replaces the existing document’s file by default', async () => {
    replaceDocumentFileMock.mockResolvedValue({ id: 71, fileName: 'budget.pdf', fileSize: 8, mimeType: 'application/pdf' });
    const { result } = setup();
    act(() => result.current.addFiles([pdf('Budget.PDF')]));

    let outcome: Awaited<ReturnType<typeof result.current.send>> | undefined;
    await act(async () => {
      outcome = await result.current.send({ action: 'post', redactionAttested: true });
    });

    expect(replaceDocumentFileMock).toHaveBeenCalledWith(
      expect.objectContaining({ communityId: 8, documentId: 71, redactionAttested: true }),
      expect.any(Function),
    );
    expect(uploadDocumentFileMock).not.toHaveBeenCalled();
    expect(outcome?.documentIds).toEqual([71]);
  });

  it('never sends a refused file', async () => {
    const { result } = setup();
    act(() => result.current.addFiles([new File(['x'], 'contacts.xlsx')]));

    await act(async () => {
      await result.current.send({ action: 'post', redactionAttested: false });
    });

    expect(uploadDocumentFileMock).not.toHaveBeenCalled();
  });

  it('counts uploads whose notifications could not be sent', async () => {
    uploadDocumentFileMock.mockResolvedValue({
      document: { id: 1 },
      warnings: [{ code: 'notification_dispatch_failed', message: 'x' }],
    });
    const { result } = setup();
    act(() => result.current.addFiles([pdf('a.pdf')]));

    let outcome: Awaited<ReturnType<typeof result.current.send>> | undefined;
    await act(async () => {
      outcome = await result.current.send({ action: 'post', redactionAttested: false });
    });

    expect(outcome?.notificationWarnings).toBe(1);
  });

  describe('filing into a record', () => {
    it('guesses the record from the file name when files are added', () => {
      const { result } = setup(RECORDS);
      act(() => result.current.addFiles([pdf('2026 annual budget.pdf'), pdf('minutes.pdf')]));
      expect(result.current.rows.map((r) => [r.recordId, r.recordSuggested, r.categoryId])).toEqual([
        [11, true, 2],
        [null, false, 3],
      ]);
    });

    it('a chosen record skips the server’s auto-link and is linked, replacing any stale file', async () => {
      uploadDocumentFileMock.mockResolvedValue({ document: { id: 90 }, warnings: [] });
      patchChecklistItemMock.mockResolvedValue({});
      const { result } = setup(RECORDS);
      act(() => result.current.addFiles([pdf('annual budget.pdf')]));

      let outcome: Awaited<ReturnType<typeof result.current.send>> | undefined;
      await act(async () => {
        outcome = await result.current.send({ action: 'post', redactionAttested: true });
      });

      expect(uploadDocumentFileMock).toHaveBeenCalledWith(
        expect.objectContaining({ skipAutoLink: true }),
        expect.any(Function),
      );
      expect(patchChecklistItemMock).toHaveBeenCalledWith({
        id: 11,
        communityId: 8,
        action: 'link_document',
        documentId: 90,
        replace: true,
      });
      expect(outcome).toMatchObject({ sent: 1, failed: 0, linked: 1, documentIds: [90] });
    });

    it('a file with no record chosen is left to auto-link, as before', async () => {
      uploadDocumentFileMock.mockResolvedValue({ document: { id: 90 }, warnings: [] });
      const { result } = setup(RECORDS);
      act(() => result.current.addFiles([pdf('minutes.pdf')]));

      await act(async () => {
        await result.current.send({ action: 'post', redactionAttested: false });
      });

      expect(uploadDocumentFileMock).toHaveBeenCalledWith(
        expect.objectContaining({ skipAutoLink: false }),
        expect.any(Function),
      );
      expect(patchChecklistItemMock).not.toHaveBeenCalled();
    });

    it('a replacement is never linked: its document keeps the record it has', async () => {
      replaceDocumentFileMock.mockResolvedValue({ id: 71, fileName: 'budget.pdf', fileSize: 8, mimeType: 'application/pdf' });
      const { result } = setup(RECORDS);
      act(() => result.current.addFiles([pdf('budget.pdf')]));
      act(() => result.current.updateRow(result.current.rows[0]!.key, { recordId: 11 }));

      await act(async () => {
        await result.current.send({ action: 'post', redactionAttested: true });
      });

      expect(replaceDocumentFileMock).toHaveBeenCalledTimes(1);
      expect(patchChecklistItemMock).not.toHaveBeenCalled();
    });

    it('a failed link keeps the uploaded document; the retry links it without uploading again', async () => {
      uploadDocumentFileMock.mockResolvedValue({ document: { id: 90 }, warnings: [] });
      patchChecklistItemMock
        .mockRejectedValueOnce(new Error('This file is already posted as another record'))
        .mockResolvedValueOnce({});
      const { result } = setup(RECORDS);
      act(() => result.current.addFiles([pdf('annual budget.pdf')]));

      let first: Awaited<ReturnType<typeof result.current.send>> | undefined;
      await act(async () => {
        first = await result.current.send({ action: 'post', redactionAttested: true });
      });
      expect(first).toMatchObject({ sent: 0, failed: 1, linkFailed: 1, linked: 0, documentIds: [90] });
      expect(result.current.rows[0]).toMatchObject({ status: 'failed', documentId: 90 });
      expect(result.current.rows[0]?.error).toBe(
        'Posted, but we couldn’t file it as Annual Budget. This file is already posted as another record. Post again to retry the link.',
      );

      let retry: Awaited<ReturnType<typeof result.current.send>> | undefined;
      await act(async () => {
        retry = await result.current.send({ action: 'post', redactionAttested: false });
      });
      expect(uploadDocumentFileMock).toHaveBeenCalledTimes(1);
      expect(patchChecklistItemMock).toHaveBeenCalledTimes(2);
      // The retry only linked: nothing more was uploaded, so nothing is reported as sent.
      expect(retry).toMatchObject({ sent: 0, failed: 0, linked: 1 });
      expect(result.current.rows[0]?.status).toBe('done');
    });

    it('refreshes the checklist after a send, since a record may now be filled', async () => {
      uploadDocumentFileMock.mockResolvedValue({ document: { id: 90 }, warnings: [] });
      const { result } = setup(RECORDS);
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
      act(() => result.current.addFiles([pdf('minutes.pdf')]));

      await act(async () => {
        await result.current.send({ action: 'post', redactionAttested: false });
      });

      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['compliance-checklist', 8] });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['pm', 'site', 'records-alert', 8] });
    });

    it('a DRAFT is never filed, even with a record chosen: it is left to auto-link once posted', async () => {
      uploadDocumentFileMock.mockResolvedValue({ document: { id: 90 }, warnings: [] });
      const { result } = setup(RECORDS);
      act(() => result.current.addFiles([pdf('annual budget.pdf')]));
      expect(result.current.rows[0]?.recordId).toBe(11);

      let outcome: Awaited<ReturnType<typeof result.current.send>> | undefined;
      await act(async () => {
        outcome = await result.current.send({ action: 'draft', redactionAttested: false });
      });

      expect(uploadDocumentFileMock).toHaveBeenCalledWith(
        expect.objectContaining({ draft: true, skipAutoLink: false }),
        expect.any(Function),
      );
      expect(patchChecklistItemMock).not.toHaveBeenCalled();
      expect(outcome).toMatchObject({ sent: 1, linked: 0 });
    });

    it('a record that has left the list since it was chosen is not linked over', async () => {
      uploadDocumentFileMock.mockResolvedValue({ document: { id: 90 }, warnings: [] });
      const { result } = setup(RECORDS);
      act(() => result.current.addFiles([pdf('minutes.pdf')]));
      // Record 99 was filled elsewhere, so the refreshed list no longer has it.
      act(() => result.current.updateRow(result.current.rows[0]!.key, { recordId: 99 }));

      await act(async () => {
        await result.current.send({ action: 'post', redactionAttested: false });
      });

      expect(uploadDocumentFileMock).toHaveBeenCalledWith(
        expect.objectContaining({ skipAutoLink: false }),
        expect.any(Function),
      );
      expect(patchChecklistItemMock).not.toHaveBeenCalled();
    });

    it('a link retried with "Save as draft" still links: the document is already posted', async () => {
      uploadDocumentFileMock.mockResolvedValue({ document: { id: 90 }, warnings: [] });
      patchChecklistItemMock.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({});
      const { result } = setup(RECORDS);
      act(() => result.current.addFiles([pdf('annual budget.pdf')]));
      await act(async () => {
        await result.current.send({ action: 'post', redactionAttested: true });
      });

      let retry: Awaited<ReturnType<typeof result.current.send>> | undefined;
      await act(async () => {
        retry = await result.current.send({ action: 'draft', redactionAttested: false });
      });

      expect(uploadDocumentFileMock).toHaveBeenCalledTimes(1);
      expect(patchChecklistItemMock).toHaveBeenCalledTimes(2);
      expect(retry).toMatchObject({ sent: 0, linked: 1, unfiled: 0 });
    });

    it('a link retried after its record was filled elsewhere is counted as posted but not filed', async () => {
      uploadDocumentFileMock.mockResolvedValue({ document: { id: 90 }, warnings: [] });
      patchChecklistItemMock.mockRejectedValueOnce(new Error('boom'));
      const { result, rerender } = setup(RECORDS);
      act(() => result.current.addFiles([pdf('annual budget.pdf')]));
      await act(async () => {
        await result.current.send({ action: 'post', redactionAttested: true });
      });
      // The refetched checklist no longer lists Annual Budget.
      rerender({ records: [] });

      let retry: Awaited<ReturnType<typeof result.current.send>> | undefined;
      await act(async () => {
        retry = await result.current.send({ action: 'post', redactionAttested: false });
      });

      expect(uploadDocumentFileMock).toHaveBeenCalledTimes(1);
      expect(patchChecklistItemMock).toHaveBeenCalledTimes(1);
      expect(retry).toMatchObject({ sent: 0, failed: 0, linked: 0, unfiled: 1 });
    });

    it('files chosen records before any upload left to auto-link, so auto-link cannot take a chosen record', async () => {
      uploadDocumentFileMock.mockImplementation(async (request: { title: string }) => ({
        document: { id: request.title === 'minutes' ? 91 : 90 },
        warnings: [],
      }));
      patchChecklistItemMock.mockResolvedValue({});
      const { result } = setup(RECORDS);
      // The unchosen file is first in the queue.
      act(() => result.current.addFiles([pdf('minutes.pdf'), pdf('annual budget.pdf')]));

      await act(async () => {
        await result.current.send({ action: 'post', redactionAttested: true });
      });

      const minutesCall = uploadDocumentFileMock.mock.calls.findIndex(([request]) => request.title === 'minutes');
      expect(patchChecklistItemMock.mock.invocationCallOrder[0]).toBeLessThan(
        uploadDocumentFileMock.mock.invocationCallOrder[minutesCall]!,
      );
    });
  });
});
