import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { ComplianceActivityFeed } from '../compliance-activity-feed';

// Mock the history sheet so we can assert open prop without rendering the
// full AuditTrailViewer (which fetches its own data).
vi.mock('../compliance-activity-history-sheet', () => ({
  ComplianceActivityHistorySheet: ({
    open,
    communityId,
  }: {
    open: boolean;
    communityId: number;
  }) =>
    open ? (
      <div data-testid="history-sheet-open" data-community-id={communityId}>
        history sheet
      </div>
    ) : null,
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
});

describe('ComplianceActivityFeed', () => {
  it('renders the actor display name from the API users map', async () => {
    mockFetch.mockReturnValue(
      jsonResponse({
        data: [
          {
            id: 1,
            userId: 'user-uuid-1',
            action: 'upload_document',
            resourceType: 'document',
            resourceId: '42',
            metadata: { itemTitle: 'Bylaws' },
            createdAt: new Date().toISOString(),
          },
        ],
        pagination: { nextCursor: null, hasMore: false },
        users: { 'user-uuid-1': 'Jane Manager' },
      }),
    );

    render(<ComplianceActivityFeed communityId={42} />, { wrapper });

    expect(await screen.findByText('Jane Manager')).toBeTruthy();
    expect(screen.getByText('Bylaws')).toBeTruthy();
    // The full UUID should NOT appear anywhere on screen.
    expect(screen.queryByText(/user-uuid-1/)).toBeNull();
  });

  it('opens the history sheet when "View all history" is clicked', async () => {
    mockFetch.mockReturnValue(
      jsonResponse({
        data: [],
        pagination: { nextCursor: null, hasMore: false },
        users: {},
      }),
    );

    render(<ComplianceActivityFeed communityId={42} />, { wrapper });

    const trigger = await screen.findByRole('button', { name: /view all history/i });
    expect(screen.queryByTestId('history-sheet-open')).toBeNull();

    await act(async () => {
      fireEvent.click(trigger);
    });

    const sheet = await screen.findByTestId('history-sheet-open');
    expect(sheet).toBeTruthy();
    expect(sheet.getAttribute('data-community-id')).toBe('42');
  });

  it('hides the entire panel when the API returns 403 (no audit:read permission)', async () => {
    mockFetch.mockReturnValue(jsonResponse({ error: { message: 'Forbidden' } }, 403));

    const { container } = render(<ComplianceActivityFeed communityId={42} />, {
      wrapper,
    });

    await waitFor(() => {
      expect(container.children.length).toBe(0);
    });
    expect(screen.queryByRole('heading', { name: /recent activity/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /view all history/i })).toBeNull();
  });

  it('keeps the header + trigger visible on non-403 errors so users can still drill into history', async () => {
    mockFetch.mockReturnValue(jsonResponse({ error: { message: 'Boom' } }, 500));

    render(<ComplianceActivityFeed communityId={42} />, { wrapper });

    expect(
      await screen.findByRole('button', { name: /view all history/i }),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: /recent activity/i })).toBeTruthy();
    expect(screen.getByText(/couldn't load recent activity/i)).toBeTruthy();
  });

  it('falls back to the action label alone when the entry has no userId', async () => {
    mockFetch.mockReturnValue(
      jsonResponse({
        data: [
          {
            id: 7,
            userId: null,
            action: 'mark_applicable',
            resourceType: 'checklist_item',
            resourceId: '99',
            metadata: { itemTitle: 'Insurance' },
            createdAt: new Date().toISOString(),
          },
        ],
        pagination: { nextCursor: null, hasMore: false },
        users: {},
      }),
    );

    render(<ComplianceActivityFeed communityId={42} />, { wrapper });

    expect(await screen.findByText('Insurance')).toBeTruthy();
    expect(screen.getByText(/marked as applicable/i)).toBeTruthy();
  });
});
