import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { uploadDocumentFileMock, replaceDocumentFileMock } = vi.hoisted(() => ({
  uploadDocumentFileMock: vi.fn(),
  replaceDocumentFileMock: vi.fn(),
}));

vi.mock('../use-document-upload', () => ({
  uploadDocumentFile: uploadDocumentFileMock,
  replaceDocumentFile: replaceDocumentFileMock,
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

function setup() {
  return renderHook(() =>
    useDocumentUploadQueue({ communityId: 8, existingDocuments: LIBRARY, defaultCategoryId: 3 }),
  );
}

describe('useDocumentUploadQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
