/// <reference types="@testing-library/jest-dom" />
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/components/maintenance/SubmitForm', () => ({
  SubmitForm: (props: { onCreated?: (r: { id: number }) => void }) => (
    <button
      type="button"
      onClick={() => props.onCreated?.({ id: 99 })}
      data-testid="submit-form-stub"
    >
      mock submit form
    </button>
  ),
}));

import { RequestCreateSheet } from '../RequestCreateSheet';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
  );
}

beforeEach(() => vi.clearAllMocks());

describe('<RequestCreateSheet>', () => {
  it('renders the Submit Request drawer when open', () => {
    render(wrap(
      <RequestCreateSheet open={true} onClose={vi.fn()} communityId={42} userId="u-1" />,
    ));
    expect(screen.getByRole('heading', { name: /submit request/i })).toBeInTheDocument();
    expect(screen.getByTestId('submit-form-stub')).toBeInTheDocument();
  });

  it('calls onClose after SubmitForm.onCreated fires', async () => {
    const onClose = vi.fn();
    render(wrap(
      <RequestCreateSheet open={true} onClose={onClose} communityId={42} userId="u-1" />,
    ));
    fireEvent.click(screen.getByTestId('submit-form-stub'));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
