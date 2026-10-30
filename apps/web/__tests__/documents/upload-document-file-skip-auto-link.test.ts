/**
 * `uploadDocumentFile` and the server's automatic record linking (D12).
 *
 * `skipAutoLink` is the caller telling `POST /api/v1/documents` that it will
 * link the document itself, so the key must reach the wire when asked for and
 * be absent otherwise (every other caller's request is byte-identical to what
 * it was).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadDocumentFile } from '@/hooks/use-document-upload';

class FakeXhr {
  status = 200;
  upload: { onprogress: unknown } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  open() {}
  setRequestHeader() {}
  send() {
    queueMicrotask(() => this.onload?.());
  }
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (url: string) => {
    if (url === '/api/v1/upload') {
      return Response.json({ data: { path: 'communities/42/documents/a.pdf', uploadUrl: 'https://storage.test/a', token: 't', documentId: '1' } });
    }
    return Response.json({ data: { id: 7 } });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const request = { communityId: 42, title: 'Budget', categoryId: 3, file: new File(['x'], 'budget.pdf', { type: 'application/pdf' }) };

function createBody(): Record<string, unknown> {
  const call = fetchMock.mock.calls.find(([url]) => url === '/api/v1/documents');
  return JSON.parse((call?.[1] as RequestInit).body as string) as Record<string, unknown>;
}

describe('uploadDocumentFile', () => {
  it('sends skipAutoLink when the caller links the document itself', async () => {
    await uploadDocumentFile({ ...request, skipAutoLink: true });

    expect(createBody()['skipAutoLink']).toBe(true);
  });

  it('leaves it out of every other request', async () => {
    await uploadDocumentFile(request);

    expect(createBody()).not.toHaveProperty('skipAutoLink');
  });
});
