import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COMPLIANCE_CHECKLIST_QUERY_KEY,
  useComplianceChecklist,
} from '../use-compliance-checklist';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('COMPLIANCE_CHECKLIST_QUERY_KEY', () => {
  it('is a stable per-community key', () => {
    expect(COMPLIANCE_CHECKLIST_QUERY_KEY(7)).toEqual([
      'compliance-checklist',
      7,
    ]);
  });
});

describe('useComplianceChecklist', () => {
  it('does not fetch when communityId is falsy', () => {
    renderHook(() => useComplianceChecklist(0), { wrapper: createWrapper() });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not fetch when communityId is negative', () => {
    renderHook(() => useComplianceChecklist(-3), { wrapper: createWrapper() });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs then GETs with exact URLs, methods, body, and forwards the AbortSignal', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(201, { data: [] }))
      .mockResolvedValueOnce(
        jsonResponse(200, { data: [{ id: 1, templateKey: 'k' }] }),
      );

    const { result } = renderHook(() => useComplianceChecklist(42), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/v1/compliance',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId: 42 }),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/v1/compliance?communityId=42',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result.current.data).toEqual([{ id: 1, templateKey: 'k' }]);
  });

  it('returns json.data on success', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { data: [], meta: { alreadyGenerated: true } }))
      .mockResolvedValueOnce(
        jsonResponse(200, { data: [{ id: 9, templateKey: 'bylaws' }] }),
      );

    const { result } = renderHook(() => useComplianceChecklist(1), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 9, templateKey: 'bylaws' }]);
  });

  it('returns [] when GET response has no data field', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(201, { data: [] }))
      .mockResolvedValueOnce(jsonResponse(200, {}));

    const { result } = renderHook(() => useComplianceChecklist(1), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it('throws the condo/HOA-only literal on a 403 POST (no server message)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => {
        throw new Error('invalid json');
      },
    });

    const { result } = renderHook(() => useComplianceChecklist(1), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe(
      'Compliance checklist is only available for condo/HOA communities.',
    );
    // GET must not run when POST fails (short-circuit preserved).
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses the server message on a 403 POST when present', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(403, { error: { message: 'User is not a member of this community' } }),
    );

    const { result } = renderHook(() => useComplianceChecklist(1), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe(
      'User is not a member of this community',
    );
  });

  it('throws the generic init literal on a non-403 POST failure', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, {}));

    const { result } = renderHook(() => useComplianceChecklist(1), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe(
      'Failed to initialize compliance checklist',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws the load literal when GET is not ok', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(201, { data: [] }))
      .mockResolvedValueOnce(jsonResponse(500, {}));

    const { result } = renderHook(() => useComplianceChecklist(1), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe(
      'Failed to load compliance checklist',
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws the load literal when the GET 200 body is unparseable (no silent [])', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(201, { data: [] }))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('not json');
        },
      });

    const { result } = renderHook(() => useComplianceChecklist(1), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe(
      'Failed to load compliance checklist',
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refetches when communityId changes', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(201, { data: [] }))
      .mockResolvedValueOnce(jsonResponse(200, { data: [{ id: 1 }] }))
      .mockResolvedValueOnce(jsonResponse(201, { data: [] }))
      .mockResolvedValueOnce(jsonResponse(200, { data: [{ id: 2 }] }));

    const { result, rerender } = renderHook(
      ({ id }: { id: number }) => useComplianceChecklist(id),
      { wrapper: createWrapper(), initialProps: { id: 1 } },
    );

    await waitFor(() => expect(result.current.data).toEqual([{ id: 1 }]));

    rerender({ id: 2 });

    await waitFor(() => expect(result.current.data).toEqual([{ id: 2 }]));
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/v1/compliance',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ communityId: 2 }) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      '/api/v1/compliance?communityId=2',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
