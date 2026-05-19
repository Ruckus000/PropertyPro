import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ActivityFetchError,
  COMPLIANCE_ACTIVITY_QUERY_KEY,
  normalizeActivityFeedResponse,
  useComplianceActivityFeed,
} from '../use-compliance-activity';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const entry = {
  id: 1,
  userId: 'u1',
  action: 'upload_document',
  resourceType: 'document',
  resourceId: 'doc-1',
  metadata: null,
  createdAt: '2026-05-18T00:00:00.000Z',
};

beforeEach(() => {
  fetchMock.mockReset();
});

describe('COMPLIANCE_ACTIVITY_QUERY_KEY', () => {
  it('is a stable per-community key', () => {
    expect(COMPLIANCE_ACTIVITY_QUERY_KEY(7)).toEqual([
      'compliance-activity',
      7,
    ]);
  });
});

describe('normalizeActivityFeedResponse', () => {
  it('handles the flat {data:[]} envelope', () => {
    expect(
      normalizeActivityFeedResponse({ data: [entry], users: { u1: 'Al' } }),
    ).toEqual({
      data: [entry],
      pagination: { nextCursor: null, hasMore: false },
      users: { u1: 'Al' },
    });
  });

  it('handles the double-wrapped {data:{data,pagination,users}} envelope', () => {
    expect(
      normalizeActivityFeedResponse({
        data: {
          data: [entry],
          pagination: { nextCursor: 'c', hasMore: true },
          users: { u1: 'Al' },
        },
      }),
    ).toEqual({
      data: [entry],
      pagination: { nextCursor: 'c', hasMore: true },
      users: { u1: 'Al' },
    });
  });

  it('throws ActivityFetchError on an invalid response', () => {
    expect(() => normalizeActivityFeedResponse({ nope: true })).toThrow(
      ActivityFetchError,
    );
  });
});

describe('useComplianceActivityFeed', () => {
  it('requests the exact URL with limit=8, forwards the signal, normalizes', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { data: [entry], users: { u1: 'Al' } }),
    );
    const { result } = renderHook(() => useComplianceActivityFeed(42), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      data: [entry],
      pagination: { nextCursor: null, hasMore: false },
      users: { u1: 'Al' },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/audit-trail?communityId=42&limit=8',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('surfaces a non-OK response as an ActivityFetchError carrying the status', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(403, {}));
    const { result } = renderHook(() => useComplianceActivityFeed(42), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ActivityFetchError);
    expect(result.current.error?.status).toBe(403);
  });
});
