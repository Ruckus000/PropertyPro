/**
 * useComplianceMutations — Optimistic Update & Rollback Tests
 *
 * Focus: The state machine behavior when mutations succeed, fail, or race.
 * Tests the optimistic update → rollback pattern that prevents stale UI
 * for board members clicking through compliance items.
 */
import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { useComplianceMutations } from '../useComplianceMutations';
import { COMPLIANCE_QUERY_KEY } from '../useComplianceChecklist';
import type { ChecklistItemData } from '@/components/compliance/compliance-checklist-item';

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

const mockFetch = vi.fn() as Mock;
vi.stubGlobal('fetch', mockFetch);

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const COMMUNITY_ID = 42;

function makeChecklistItem(
  overrides?: Partial<ChecklistItemData>,
): ChecklistItemData {
  return {
    id: 1,
    communityId: COMMUNITY_ID,
    templateKey: '718_declaration',
    title: 'Declaration of Condominium',
    description: 'Test description',
    category: 'governing_documents',
    statuteReference: '§718.111(12)(g)(2)(a)',
    status: 'unsatisfied',
    documentId: null,
    documentPostedAt: null,
    isApplicable: true,
    deadlineDays: 30,
    rollingMonths: null,
    isConditional: false,
    ...overrides,
  } as ChecklistItemData;
}

// ---------------------------------------------------------------------------
// Wrapper with QueryClient
// ---------------------------------------------------------------------------

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return {
    queryClient,
    wrapper: ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useComplianceMutations', () => {
  // =========================================================================
  // linkDocument — optimistic update
  // =========================================================================

  it('optimistically updates cache on linkDocument', async () => {
    const { queryClient, wrapper } = createWrapper();

    // Seed cache with one unsatisfied item
    const item = makeChecklistItem({ id: 10, status: 'unsatisfied' });
    queryClient.setQueryData([COMPLIANCE_QUERY_KEY, COMMUNITY_ID], [item]);

    // Mock successful PATCH
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: { ...item, documentId: 99, status: 'satisfied' },
        }),
    });

    const { result } = renderHook(() => useComplianceMutations(COMMUNITY_ID), {
      wrapper,
    });

    act(() => {
      result.current.linkDocument.mutate({ itemId: 10, documentId: 99 });
    });

    // Optimistic update should happen immediately
    const cached = queryClient.getQueryData<ChecklistItemData[]>([
      COMPLIANCE_QUERY_KEY,
      COMMUNITY_ID,
    ]);
    expect(cached?.[0]?.documentId).toBe(99);
    expect(cached?.[0]?.status).toBe('satisfied');
  });

  // =========================================================================
  // linkDocument — rollback on failure
  // =========================================================================

  it('rolls back to previous state on linkDocument failure', async () => {
    const { queryClient, wrapper } = createWrapper();

    const item = makeChecklistItem({
      id: 10,
      status: 'unsatisfied',
      documentId: null,
    });
    queryClient.setQueryData([COMPLIANCE_QUERY_KEY, COMMUNITY_ID], [item]);

    // Mock PATCH failure
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ message: 'Internal server error' }),
    });

    const { result } = renderHook(() => useComplianceMutations(COMMUNITY_ID), {
      wrapper,
    });

    act(() => {
      result.current.linkDocument.mutate({ itemId: 10, documentId: 99 });
    });

    // Wait for error to propagate and rollback
    await waitFor(() => {
      expect(result.current.linkDocument.isError).toBe(true);
    });

    // Cache should be rolled back to original state
    const cached = queryClient.getQueryData<ChecklistItemData[]>([
      COMPLIANCE_QUERY_KEY,
      COMMUNITY_ID,
    ]);
    expect(cached?.[0]?.documentId).toBeNull();
    expect(cached?.[0]?.status).toBe('unsatisfied');
  });

  // =========================================================================
  // unlinkDocument — optimistic update
  // =========================================================================

  it('optimistically clears document on unlinkDocument', async () => {
    const { queryClient, wrapper } = createWrapper();

    const item = makeChecklistItem({
      id: 10,
      status: 'satisfied',
      documentId: 99,
      documentPostedAt: '2026-03-01T00:00:00Z' as unknown as null,
    });
    queryClient.setQueryData([COMPLIANCE_QUERY_KEY, COMMUNITY_ID], [item]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: { ...item, documentId: null, status: 'unsatisfied' },
        }),
    });

    const { result } = renderHook(() => useComplianceMutations(COMMUNITY_ID), {
      wrapper,
    });

    act(() => {
      result.current.unlinkDocument.mutate({ itemId: 10 });
    });

    const cached = queryClient.getQueryData<ChecklistItemData[]>([
      COMPLIANCE_QUERY_KEY,
      COMMUNITY_ID,
    ]);
    expect(cached?.[0]?.documentId).toBeNull();
    expect(cached?.[0]?.status).toBe('unsatisfied');
  });

  // =========================================================================
  // markNotApplicable — optimistic update
  // =========================================================================

  it('optimistically marks item as not applicable', async () => {
    const { queryClient, wrapper } = createWrapper();

    const item = makeChecklistItem({ id: 10, isApplicable: true });
    queryClient.setQueryData([COMPLIANCE_QUERY_KEY, COMMUNITY_ID], [item]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: { ...item, isApplicable: false, status: 'not_applicable' },
        }),
    });

    const { result } = renderHook(() => useComplianceMutations(COMMUNITY_ID), {
      wrapper,
    });

    act(() => {
      result.current.markNotApplicable.mutate({ itemId: 10 });
    });

    const cached = queryClient.getQueryData<ChecklistItemData[]>([
      COMPLIANCE_QUERY_KEY,
      COMMUNITY_ID,
    ]);
    expect(cached?.[0]?.isApplicable).toBe(false);
    expect(cached?.[0]?.status).toBe('not_applicable');
  });

  // =========================================================================
  // markApplicable — optimistic update and rollback
  // =========================================================================

  it('rolls back markApplicable on network error', async () => {
    const { queryClient, wrapper } = createWrapper();

    const item = makeChecklistItem({
      id: 10,
      isApplicable: false,
      status: 'not_applicable' as ChecklistItemData['status'],
    });
    queryClient.setQueryData([COMPLIANCE_QUERY_KEY, COMMUNITY_ID], [item]);

    // Simulate network failure
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const { result } = renderHook(() => useComplianceMutations(COMMUNITY_ID), {
      wrapper,
    });

    act(() => {
      result.current.markApplicable.mutate({ itemId: 10 });
    });

    // Wait for error
    await waitFor(() => {
      expect(result.current.markApplicable.isError).toBe(true);
    });

    // Should roll back to not_applicable
    const cached = queryClient.getQueryData<ChecklistItemData[]>([
      COMPLIANCE_QUERY_KEY,
      COMMUNITY_ID,
    ]);
    expect(cached?.[0]?.isApplicable).toBe(false);
  });

  // =========================================================================
  // Correct API payload construction
  // =========================================================================

  it('sends correct PATCH payload for linkDocument', async () => {
    const { queryClient, wrapper } = createWrapper();

    queryClient.setQueryData(
      [COMPLIANCE_QUERY_KEY, COMMUNITY_ID],
      [makeChecklistItem({ id: 10 })],
    );

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: makeChecklistItem({ id: 10 }) }),
    });

    const { result } = renderHook(() => useComplianceMutations(COMMUNITY_ID), {
      wrapper,
    });

    act(() => {
      result.current.linkDocument.mutate({ itemId: 10, documentId: 55 });
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    expect(mockFetch).toHaveBeenCalledWith('/api/v1/compliance', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 10,
        communityId: COMMUNITY_ID,
        action: 'link_document',
        documentId: 55,
      }),
    });
  });

  // =========================================================================
  // Multiple items in cache — only target item changes
  // =========================================================================

  it('only updates the targeted item, not siblings', async () => {
    const { queryClient, wrapper } = createWrapper();

    const items = [
      makeChecklistItem({ id: 10, templateKey: '718_declaration' }),
      makeChecklistItem({ id: 20, templateKey: '718_bylaws' }),
      makeChecklistItem({ id: 30, templateKey: '718_articles' }),
    ];
    queryClient.setQueryData([COMPLIANCE_QUERY_KEY, COMMUNITY_ID], items);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: { ...items[1], documentId: 77, status: 'satisfied' },
        }),
    });

    const { result } = renderHook(() => useComplianceMutations(COMMUNITY_ID), {
      wrapper,
    });

    act(() => {
      result.current.linkDocument.mutate({ itemId: 20, documentId: 77 });
    });

    const cached = queryClient.getQueryData<ChecklistItemData[]>([
      COMPLIANCE_QUERY_KEY,
      COMMUNITY_ID,
    ]);

    // Item 10 and 30 unchanged
    expect(cached?.[0]?.documentId).toBeNull();
    expect(cached?.[2]?.documentId).toBeNull();
    // Item 20 updated
    expect(cached?.[1]?.documentId).toBe(77);
    expect(cached?.[1]?.status).toBe('satisfied');
  });

  // =========================================================================
  // Error message extraction
  // =========================================================================

  it('extracts error message from API response', async () => {
    const { queryClient, wrapper } = createWrapper();

    queryClient.setQueryData(
      [COMPLIANCE_QUERY_KEY, COMMUNITY_ID],
      [makeChecklistItem({ id: 10 })],
    );

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: () =>
        Promise.resolve({ message: 'Insufficient permissions for this action' }),
    });

    const { result } = renderHook(() => useComplianceMutations(COMMUNITY_ID), {
      wrapper,
    });

    act(() => {
      result.current.linkDocument.mutate({ itemId: 10, documentId: 1 });
    });

    await waitFor(() => {
      expect(result.current.linkDocument.isError).toBe(true);
    });

    expect(result.current.linkDocument.error?.message).toBe(
      'Insufficient permissions for this action',
    );
  });

  it('falls back to status code when no message in error response', async () => {
    const { queryClient, wrapper } = createWrapper();

    queryClient.setQueryData(
      [COMPLIANCE_QUERY_KEY, COMMUNITY_ID],
      [makeChecklistItem({ id: 10 })],
    );

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('Invalid JSON')),
    });

    const { result } = renderHook(() => useComplianceMutations(COMMUNITY_ID), {
      wrapper,
    });

    act(() => {
      result.current.linkDocument.mutate({ itemId: 10, documentId: 1 });
    });

    await waitFor(() => {
      expect(result.current.linkDocument.isError).toBe(true);
    });

    expect(result.current.linkDocument.error?.message).toContain('PATCH failed: 500');
  });
});
