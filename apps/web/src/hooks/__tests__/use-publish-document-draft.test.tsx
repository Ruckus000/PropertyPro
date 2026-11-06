/**
 * The publish hook carries the author's redaction attestation to the route,
 * which refuses (400) without it for minutes and sensitive categories.
 */
import * as React from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import { usePublishDocumentDraft } from '../use-document-draft';

describe('usePublishDocumentDraft', () => {
  it('sends the redaction attestation as a JSON body', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { documentId: 900 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => usePublishDocumentDraft(42, 5), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ redactionAttested: true });
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/api/v1/documents/drafts/5/publish?communityId=42');
    expect(init).toMatchObject({ method: 'POST' });
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ redactionAttested: true });
  });
});
