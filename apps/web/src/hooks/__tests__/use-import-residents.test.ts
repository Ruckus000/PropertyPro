/**
 * use-import-residents — extracted bulk resident-import mutation hooks.
 *
 * Verifies the relocated `dryRunImport` / `executeImport` network helpers
 * behave byte-identically to their previous in-component form: exact
 * URL/method/headers/body, success returns the whole `{ data }` envelope, and
 * the documented `{ message }` / `.catch(() => null)` error literals.
 */
import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type PropsWithChildren } from 'react';
import { useDryRunImport, useImportResidents } from '../use-import-residents';

const fetchMock = vi.fn() as Mock;
vi.stubGlobal('fetch', fetchMock);

const COMMUNITY_ID = 7;
const CSV = 'name,email,role,unit_number\nJane,jane@x.com,owner,101';

function wrapper({ children }: PropsWithChildren) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return createElement(QueryClientProvider, { client }, children);
}

function jsonResponse(ok: boolean, body: unknown): Response {
  return {
    ok,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function nonJsonResponse(): Response {
  return {
    ok: false,
    json: () => Promise.reject(new Error('not json')),
  } as unknown as Response;
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('useDryRunImport', () => {
  it('POSTs the exact URL/method/headers/body with dryRun:true', async () => {
    const payload = {
      data: { preview: [{ name: 'Jane', email: 'jane@x.com', role: 'owner', unit_number: '101' }], errors: [], header: ['name'] },
    };
    fetchMock.mockResolvedValue(jsonResponse(true, payload));

    const { result } = renderHook(() => useDryRunImport(COMMUNITY_ID), { wrapper });
    result.current.mutate(CSV);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/import-residents');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual({
      communityId: COMMUNITY_ID,
      csv: CSV,
      dryRun: true,
    });
    // Returns the whole envelope (component reads data.data)
    expect(result.current.data).toEqual(payload);
  });

  it('throws the route { message } on non-OK', async () => {
    fetchMock.mockResolvedValue(jsonResponse(false, { message: 'Bad CSV header' }));

    const { result } = renderHook(() => useDryRunImport(COMMUNITY_ID), { wrapper });
    result.current.mutate(CSV);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Bad CSV header');
  });

  it('throws the exact "Failed to validate CSV" literal on non-JSON non-OK', async () => {
    fetchMock.mockResolvedValue(nonJsonResponse());

    const { result } = renderHook(() => useDryRunImport(COMMUNITY_ID), { wrapper });
    result.current.mutate(CSV);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Failed to validate CSV');
  });
});

describe('useImportResidents', () => {
  it('POSTs the exact URL/method/headers/body with dryRun:false', async () => {
    const payload = { data: { importedCount: 1, skippedCount: 0, errors: [] } };
    fetchMock.mockResolvedValue(jsonResponse(true, payload));

    const { result } = renderHook(() => useImportResidents(COMMUNITY_ID), { wrapper });
    result.current.mutate(CSV);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/import-residents');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual({
      communityId: COMMUNITY_ID,
      csv: CSV,
      dryRun: false,
    });
    expect(result.current.data).toEqual(payload);
  });

  it('throws the route { message } on non-OK', async () => {
    fetchMock.mockResolvedValue(jsonResponse(false, { message: 'Import blew up' }));

    const { result } = renderHook(() => useImportResidents(COMMUNITY_ID), { wrapper });
    result.current.mutate(CSV);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Import blew up');
  });

  it('throws the exact "Failed to import residents" literal on non-JSON non-OK', async () => {
    fetchMock.mockResolvedValue(nonJsonResponse());

    const { result } = renderHook(() => useImportResidents(COMMUNITY_ID), { wrapper });
    result.current.mutate(CSV);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Failed to import residents');
  });
});
