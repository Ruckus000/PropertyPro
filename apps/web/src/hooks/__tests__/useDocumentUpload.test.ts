/**
 * useDocumentUpload — Edge Case & Failure Path Tests
 *
 * Focus: What happens when things go wrong. The happy path works or you'd have
 * noticed during development. These tests cover the failure modes that hit
 * 60-80 year old board treasurers on spotty Florida condo WiFi.
 */
import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDocumentUpload, type UploadRequest } from '../useDocumentUpload';

// ---------------------------------------------------------------------------
// Mock fetch globally
// ---------------------------------------------------------------------------

const mockFetch = vi.fn() as Mock;
vi.stubGlobal('fetch', mockFetch);

// Mock XMLHttpRequest
class MockXHR {
  upload = { onprogress: null as ((e: ProgressEvent) => void) | null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  status = 200;
  open = vi.fn();
  setRequestHeader = vi.fn();
  send = vi.fn();
}

let mockXHRInstance: MockXHR;

vi.stubGlobal(
  'XMLHttpRequest',
  vi.fn(() => {
    mockXHRInstance = new MockXHR();
    return mockXHRInstance;
  }),
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestFile(name = 'test.pdf', size = 1024): File {
  const buffer = new ArrayBuffer(size);
  return new File([buffer], name, { type: 'application/pdf' });
}

function makeUploadRequest(overrides?: Partial<UploadRequest>): UploadRequest {
  return {
    communityId: 1,
    title: 'Test Document',
    categoryId: 11,
    file: createTestFile(),
    ...overrides,
  };
}

function mockPresignSuccess() {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () =>
      Promise.resolve({
        data: {
          path: '/uploads/test.pdf',
          uploadUrl: 'https://storage.example.com/presigned-url',
          token: 'tok_abc',
          documentId: 'doc_123',
        },
      }),
  });
}

function mockDocumentCreateSuccess() {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () =>
      Promise.resolve({
        data: { id: 1, title: 'Test Document' },
      }),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useDocumentUpload', () => {
  it('starts with idle state', () => {
    const { result } = renderHook(() => useDocumentUpload());
    expect(result.current.isUploading).toBe(false);
    expect(result.current.progress).toBe(0);
    expect(result.current.error).toBeNull();
  });

  it('handles presign API failure gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Internal server error' }),
    });

    const { result } = renderHook(() => useDocumentUpload());
    let error: Error | undefined;

    await act(async () => {
      try {
        await result.current.uploadDocument(makeUploadRequest());
      } catch (e) {
        error = e as Error;
      }
    });

    expect(error?.message).toBe('Unable to prepare upload');
    expect(result.current.isUploading).toBe(false);
    expect(result.current.progress).toBe(0);
    expect(result.current.error).toBe('Unable to prepare upload');
  });

  it('handles presign network timeout', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const { result } = renderHook(() => useDocumentUpload());
    let error: Error | undefined;

    await act(async () => {
      try {
        await result.current.uploadDocument(makeUploadRequest());
      } catch (e) {
        error = e as Error;
      }
    });

    expect(error?.message).toBe('Failed to fetch');
    expect(result.current.isUploading).toBe(false);
    expect(result.current.error).toBe('Failed to fetch');
  });

  it('handles S3 upload failure (non-2xx response)', async () => {
    mockPresignSuccess();

    const { result } = renderHook(() => useDocumentUpload());
    let error: Error | undefined;

    const uploadPromise = act(async () => {
      try {
        await result.current.uploadDocument(makeUploadRequest());
      } catch (e) {
        error = e as Error;
      }
    });

    // Wait for XHR to be created
    await vi.waitFor(() => {
      expect(mockXHRInstance.send).toHaveBeenCalled();
    });

    // Simulate S3 returning 403
    await act(async () => {
      mockXHRInstance.status = 403;
      mockXHRInstance.onload?.();
    });

    await uploadPromise;

    expect(error?.message).toBe('Upload failed. Please try again.');
    expect(result.current.isUploading).toBe(false);
    expect(result.current.error).toBe('Upload failed. Please try again.');
  });

  it('handles S3 upload network error (connection dropped)', async () => {
    mockPresignSuccess();

    const { result } = renderHook(() => useDocumentUpload());
    let error: Error | undefined;

    const uploadPromise = act(async () => {
      try {
        await result.current.uploadDocument(makeUploadRequest());
      } catch (e) {
        error = e as Error;
      }
    });

    await vi.waitFor(() => {
      expect(mockXHRInstance.send).toHaveBeenCalled();
    });

    await act(async () => {
      mockXHRInstance.onerror?.();
    });

    await uploadPromise;

    expect(error?.message).toBe('Upload failed. Please try again.');
    expect(result.current.error).toBe('Upload failed. Please try again.');
  });

  it('handles metadata save failure after successful S3 upload', async () => {
    mockPresignSuccess();
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'DB write failed' }),
    });

    const { result } = renderHook(() => useDocumentUpload());
    let error: Error | undefined;

    const uploadPromise = act(async () => {
      try {
        await result.current.uploadDocument(makeUploadRequest());
      } catch (e) {
        error = e as Error;
      }
    });

    await vi.waitFor(() => {
      expect(mockXHRInstance.send).toHaveBeenCalled();
    });

    await act(async () => {
      mockXHRInstance.status = 200;
      mockXHRInstance.onload?.();
    });

    await uploadPromise;

    expect(error?.message).toBe(
      'Upload completed, but saving document metadata failed',
    );
    expect(result.current.error).toBe(
      'Upload completed, but saving document metadata failed',
    );
  });

  it('handles expired presigned URL (slow connection, large file)', async () => {
    // Scenario: presign succeeds, but by the time the 45MB PDF finishes
    // uploading on spotty condo WiFi, the presigned URL has expired.
    // S3 returns 403 Forbidden on the PUT.
    mockPresignSuccess();

    const { result } = renderHook(() => useDocumentUpload());
    let error: Error | undefined;

    const uploadPromise = act(async () => {
      try {
        // Simulate a large file upload
        await result.current.uploadDocument(
          makeUploadRequest({
            file: createTestFile('insurance-policy.pdf', 45 * 1024 * 1024),
          }),
        );
      } catch (e) {
        error = e as Error;
      }
    });

    await vi.waitFor(() => {
      expect(mockXHRInstance.send).toHaveBeenCalled();
    });

    // Simulate expired presigned URL — S3 returns 403
    await act(async () => {
      mockXHRInstance.status = 403;
      mockXHRInstance.onload?.();
    });

    await uploadPromise;

    // User should see a clear error, not a spinner
    expect(error?.message).toBe('Upload failed. Please try again.');
    expect(result.current.isUploading).toBe(false);
    expect(result.current.error).toBe('Upload failed. Please try again.');
    // Progress should reset — not stuck at some partial value
    expect(result.current.progress).toBe(0);
  });

  it('handles S3 timeout during upload (request takes too long)', async () => {
    // Scenario: presign succeeds, upload starts, but S3 times out the request
    // because the connection is too slow. XHR fires onerror.
    mockPresignSuccess();

    const { result } = renderHook(() => useDocumentUpload());
    let error: Error | undefined;

    const uploadPromise = act(async () => {
      try {
        await result.current.uploadDocument(makeUploadRequest());
      } catch (e) {
        error = e as Error;
      }
    });

    await vi.waitFor(() => {
      expect(mockXHRInstance.send).toHaveBeenCalled();
    });

    // Simulate timeout — XHR fires onerror (distinct from non-2xx onload)
    await act(async () => {
      mockXHRInstance.onerror?.();
    });

    await uploadPromise;

    expect(error?.message).toBe('Upload failed. Please try again.');
    expect(result.current.isUploading).toBe(false);
    expect(result.current.error).toBe('Upload failed. Please try again.');
  });

  it('completes full upload cycle: presign → S3 → document create', async () => {
    mockPresignSuccess();
    mockDocumentCreateSuccess();

    const { result } = renderHook(() => useDocumentUpload());

    const uploadPromise = act(async () => {
      await result.current.uploadDocument(makeUploadRequest());
    });

    await vi.waitFor(() => {
      expect(mockXHRInstance.send).toHaveBeenCalled();
    });

    // Complete the S3 upload
    await act(async () => {
      mockXHRInstance.status = 200;
      mockXHRInstance.onload?.();
    });

    await uploadPromise;
    expect(result.current.isUploading).toBe(false);
    expect(result.current.progress).toBe(100);
    expect(result.current.error).toBeNull();
  });

});
