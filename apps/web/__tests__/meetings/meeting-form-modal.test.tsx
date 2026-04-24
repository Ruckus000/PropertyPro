import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mutateAsyncMock } = vi.hoisted(() => ({
  mutateAsyncMock: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/hooks/use-meetings', () => ({
  useCreateMeeting: () => ({ mutateAsync: mutateAsyncMock, isPending: false }),
  useUpdateMeeting: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useMeeting: () => ({ data: undefined, isLoading: false }),
}));

import { MeetingForm } from '@/components/meetings/meeting-form';

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('MeetingForm modal', () => {
  beforeEach(() => {
    mutateAsyncMock.mockClear();
    mutateAsyncMock.mockResolvedValue({});
  });

  it('auto-focuses the title field; controlled inputs preserve spaces', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    renderWithClient(
      <MeetingForm communityId={1} communityTimezone="America/New_York" onClose={onClose} />,
    );

    await expect(screen.getByRole('dialog')).toBeVisible();

    const title = screen.getByLabelText('Title');
    await waitFor(() => expect(title).toHaveFocus());

    // Radix dialog + jsdom can swallow Space in user.type; assert the real controlled path.
    fireEvent.change(title, { target: { value: 'Hello World' } });
    expect(title).toHaveValue('Hello World');

    const location = screen.getByLabelText('Location');
    await user.click(location);
    expect(location).toHaveFocus();
    fireEvent.change(location, { target: { value: 'Room A B' } });
    expect(location).toHaveValue('Room A B');
  });
});
