import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { UserSearchCombobox } from '../UserSearchCombobox';

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

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

function getSearchInput() {
  return screen.getByPlaceholderText('Type name, email, or unit...');
}

function typeQuery(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

async function flushAndSettle() {
  await act(async () => {
    await vi.runAllTimersAsync();
  });
}

describe('UserSearchCombobox', () => {
  it('calls /api/v1/search/users for a qualifying query', async () => {
    mockFetch.mockReturnValue(
      jsonResponse({
        results: [{ id: 'u1', title: 'Cameron CAM', subtitle: 'CAM', role: 'manager' }],
      }),
    );
    const onChange = vi.fn();

    render(
      <UserSearchCombobox communityId={7} value={null} onChange={onChange} />,
      { wrapper },
    );

    typeQuery(getSearchInput(), 'ca');
    await flushAndSettle();

    expect(mockFetch).toHaveBeenCalled();
    const url = mockFetch.mock.calls[0]![0] as string;
    expect(url).toContain('/api/v1/search/users');
    expect(url).toContain('communityId=7');
  });
});
