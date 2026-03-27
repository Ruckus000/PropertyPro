import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { ResidentSearchCombobox } from '../ResidentSearchCombobox';

// cmdk uses ResizeObserver which jsdom doesn't provide
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock Radix Popover to always render content inline (no portal/animation/timer)
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? <>{children}</> : <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const mockFetch = vi.fn() as Mock;
vi.stubGlobal('fetch', mockFetch);

function wrapper({ children }: PropsWithChildren) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function makeResults(names: string[]) {
  return {
    results: names.map((n, i) => ({
      id: `user-${i}`,
      title: n,
      subtitle: `unit-${i}@example.com`,
      unitNumber: `10${i}`,
    })),
  };
}

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// The CommandInput renders with role="combobox" in cmdk; select by placeholder
function getSearchInput() {
  return screen.getByPlaceholderText('Type name or unit number...');
}

// Helper: change input value
function typeQuery(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

// Flush debounce timer + await async search to settle
async function flushAndSettle() {
  await act(async () => {
    await vi.runAllTimersAsync();
  });
}

describe('ResidentSearchCombobox', () => {
  it('does not fetch for a 1-character alpha query', async () => {
    const onChange = vi.fn();
    render(
      <ResidentSearchCombobox communityId={99} value={null} onChange={onChange} />,
      { wrapper },
    );

    typeQuery(getSearchInput(), 'a');
    await flushAndSettle();

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fetches for a 2-character alpha query', async () => {
    mockFetch.mockReturnValue(jsonResponse(makeResults(['Jane Smith'])));
    const onChange = vi.fn();
    render(
      <ResidentSearchCombobox communityId={99} value={null} onChange={onChange} />,
      { wrapper },
    );

    typeQuery(getSearchInput(), 'ja');
    await flushAndSettle();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/api/v1/search/residents');
    expect(url).toContain('q=ja');
    expect(url).toContain('limit=10');
    expect(url).toContain('communityId=99');
  });

  it('fetches for a 1-character numeric query', async () => {
    mockFetch.mockReturnValue(jsonResponse(makeResults([])));
    const onChange = vi.fn();
    render(
      <ResidentSearchCombobox communityId={99} value={null} onChange={onChange} />,
      { wrapper },
    );

    typeQuery(getSearchInput(), '1');
    await flushAndSettle();

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('debounces rapid keypresses to a single request', async () => {
    mockFetch.mockReturnValue(jsonResponse(makeResults(['Jane Smith'])));
    const onChange = vi.fn();
    render(
      <ResidentSearchCombobox communityId={99} value={null} onChange={onChange} />,
      { wrapper },
    );

    const input = getSearchInput();
    // fire multiple changes in quick succession — debounce timer not yet flushed
    typeQuery(input, 'j');
    typeQuery(input, 'ja');
    typeQuery(input, 'jan');
    typeQuery(input, 'jane');
    typeQuery(input, 'jane s');

    expect(mockFetch).not.toHaveBeenCalled();
    await flushAndSettle();

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('reads results from the results key, not data', async () => {
    const body = { results: [{ id: 'u1', title: 'Jane Smith', subtitle: 'jane@example.com', unitNumber: '101' }] };
    mockFetch.mockReturnValue(jsonResponse(body));
    const onChange = vi.fn();
    render(
      <ResidentSearchCombobox communityId={99} value={null} onChange={onChange} />,
      { wrapper },
    );

    typeQuery(getSearchInput(), 'ja');
    await flushAndSettle();

    expect(screen.getByText('Jane Smith')).toBeTruthy();
  });

  it('renders empty state message when no results returned', async () => {
    mockFetch.mockReturnValue(jsonResponse({ results: [] }));
    const onChange = vi.fn();
    render(
      <ResidentSearchCombobox communityId={99} value={null} onChange={onChange} />,
      { wrapper },
    );

    typeQuery(getSearchInput(), 'zz');
    await flushAndSettle();

    expect(screen.getByText('No residents found')).toBeTruthy();
  });

  it('does not throw on fetch error', () => {
    // Provide a handled rejection so it doesn't bubble as an unhandled error
    const handledError = Promise.reject(new Error('network error'));
    handledError.catch(() => undefined); // prevent unhandled rejection warning
    mockFetch.mockReturnValue(handledError);
    const onChange = vi.fn();
    expect(() =>
      render(
        <ResidentSearchCombobox communityId={99} value={null} onChange={onChange} />,
        { wrapper },
      )
    ).not.toThrow();
  });
});
