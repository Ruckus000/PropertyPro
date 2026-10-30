/**
 * `useRecordsAlert` options (website builder, Task 24): the sidebar badge turns
 * the query off where it can never be non-zero and gives it a longer freshness
 * window; the website home passes neither and must keep the client's defaults.
 */
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const { requestJsonMock } = vi.hoisted(() => ({ requestJsonMock: vi.fn() }));
vi.mock('@/lib/api/request-json', () => ({
  requestJson: requestJsonMock,
  JSON_HEADERS: { 'Content-Type': 'application/json' },
}));

import { recordsAlertQueryKey, useRecordsAlert } from '@/hooks/use-records-alert';

function setup(options?: Parameters<typeof useRecordsAlert>[1]) {
  requestJsonMock.mockResolvedValue({ snoozedUntil: null, missingCount: 2 });
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  renderHook(() => useRecordsAlert(7, options), { wrapper });
  return client.getQueryCache().find({ queryKey: recordsAlertQueryKey(7) })!;
}

describe('useRecordsAlert options', () => {
  it('keeps the query client default freshness when none is asked for', () => {
    requestJsonMock.mockClear();
    const query = setup();
    expect(query.observers[0]!.options.staleTime).toBe(60_000);
    expect(requestJsonMock).toHaveBeenCalledWith('/api/v1/pm/site/records-alert?communityId=7');
  });

  it('takes a freshness window of its own', () => {
    expect(setup({ staleTime: 300_000 }).observers[0]!.options.staleTime).toBe(300_000);
  });

  it('sends no request when disabled', () => {
    requestJsonMock.mockClear();
    setup({ enabled: false });
    expect(requestJsonMock).not.toHaveBeenCalled();
  });
});
