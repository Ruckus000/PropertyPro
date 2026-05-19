/**
 * Unit tests for BulkAnnouncementDialog (B5 batch 4B drain).
 *
 * Post-drain: the component delegates the POST to `useBulkAnnouncements`.
 * These tests mock that hook and exercise the confirm flow, pending state,
 * success result message, and error-literal rendering.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Radix Select (shadcn) requires ResizeObserver in jsdom.
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const mutateMock = vi.fn();
const resetMock = vi.fn();
let isPending = false;

vi.mock('@/hooks/use-bulk-announcements', () => ({
  useBulkAnnouncements: () => ({
    mutate: mutateMock,
    reset: resetMock,
    isPending,
  }),
}));

import { BulkAnnouncementDialog } from '../../src/components/pm/BulkAnnouncementDialog';

const communities = [
  { id: 1, name: 'Alpha Condos' },
  { id: 2, name: 'Beta HOA' },
];

function renderDialog() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <BulkAnnouncementDialog
        selectedCommunities={communities}
        open
        onClose={() => {}}
      />
    </QueryClientProvider>,
  );
}

function fillForm() {
  fireEvent.change(screen.getByPlaceholderText('Announcement title'), {
    target: { value: 'Pool closure' },
  });
  fireEvent.change(screen.getByPlaceholderText('Announcement body text...'), {
    target: { value: 'Closed for maintenance.' },
  });
}

describe('BulkAnnouncementDialog', () => {
  beforeEach(() => {
    mutateMock.mockReset();
    resetMock.mockReset();
    isPending = false;
  });

  it('moves to confirm step and calls the hook with form values', () => {
    renderDialog();
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Review & Send' }));

    // Confirm step content
    expect(
      screen.getByText(/Send .Pool closure. to/),
    ).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm & Send' }));

    expect(mutateMock).toHaveBeenCalledTimes(1);
    expect(mutateMock.mock.calls[0]![0]).toEqual({
      communityIds: [1, 2],
      title: 'Pool closure',
      body: 'Closed for maintenance.',
      audience: 'all',
      isPinned: false,
    });
  });

  it('shows pending label and disables buttons while pending', () => {
    isPending = true;
    renderDialog();
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Review & Send' }));

    const sendBtn = screen.getByRole('button', { name: 'Sending...' });
    expect(sendBtn).toBeDefined();
    expect((sendBtn as HTMLButtonElement).disabled).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Back' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('renders the success result message', () => {
    mutateMock.mockImplementation((_input, opts) => {
      opts.onSuccess({
        results: [
          { communityId: 1, communityName: 'Alpha Condos', status: 'sent' },
          {
            communityId: 2,
            communityName: 'Beta HOA',
            status: 'failed',
            error: 'x',
          },
        ],
      });
    });

    renderDialog();
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Review & Send' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm & Send' }));

    expect(screen.getByText('Sent to 1/2 communities')).toBeDefined();
    expect(screen.getByText('Sent')).toBeDefined();
  });

  it('renders the exact error literal from the hook', () => {
    mutateMock.mockImplementation((_input, opts) => {
      opts.onError(new Error('Failed to send bulk announcement'));
    });

    renderDialog();
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Review & Send' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm & Send' }));

    expect(
      screen.getByText('Failed to send bulk announcement'),
    ).toBeDefined();
    expect(screen.getByText('Error')).toBeDefined();
  });
});
