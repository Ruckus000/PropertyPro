/**
 * The Operations hub's request panel: everyone who can read a request may
 * comment on it, and only a manager gets the status control — which offers
 * exactly the moves the PATCH route accepts.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RequestDetailSheet } from '../../src/components/operations/RequestDetailSheet';
import { StatusUpdateForm } from '../../src/components/maintenance/StatusUpdateForm';
import { MAINTENANCE_REQUEST_KEYS, OPERATIONS_KEYS } from '../../src/hooks/use-operations';
import type { MaintenanceRequestItem } from '../../src/lib/api/maintenance-requests';

vi.mock('@/lib/api/maintenance-requests', () => ({
  addComment: vi.fn(),
  getRequest: vi.fn(),
  listMyRequests: vi.fn(),
}));
vi.mock('@/lib/api/admin-maintenance', () => ({
  listAllRequests: vi.fn(),
  updateRequestStatus: vi.fn(),
}));

import { getRequest } from '@/lib/api/maintenance-requests';
import { updateRequestStatus } from '@/lib/api/admin-maintenance';
const getRequestMock = getRequest as ReturnType<typeof vi.fn>;
const updateRequestStatusMock = updateRequestStatus as ReturnType<typeof vi.fn>;

const REQUEST: MaintenanceRequestItem = {
  id: 7,
  communityId: 42,
  title: 'Leaky faucet',
  description: 'The kitchen faucet is dripping.',
  status: 'submitted',
  priority: 'medium',
  category: 'plumbing',
  unitId: 3,
  unitLabel: '4B',
  submittedById: 'resident-1',
  assignedToId: null,
  resolutionDescription: null,
  resolutionDate: null,
  photos: null,
  comments: [],
  createdAt: '2026-01-01T15:00:00Z',
  updatedAt: '2026-01-01T15:00:00Z',
};

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function renderSheet(isAdmin: boolean, client = newClient()) {
  render(
    <QueryClientProvider client={client}>
      <RequestDetailSheet
        open
        onClose={vi.fn()}
        communityId={42}
        requestId={7}
        communityTimezone="America/New_York"
        isAdmin={isAdmin}
        userId={isAdmin ? 'manager-1' : 'resident-1'}
      />
    </QueryClientProvider>,
  );
  return client;
}

describe('RequestDetailSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRequestMock.mockResolvedValue({ data: REQUEST });
  });

  it('reads the request for this community', async () => {
    renderSheet(false);
    expect(await screen.findByRole('heading', { name: 'Leaky faucet' })).toBeInTheDocument();
    expect(getRequestMock).toHaveBeenCalledWith(7, 42);
  });

  it('gives a resident the comment box but no status control', async () => {
    renderSheet(false);
    await screen.findByRole('heading', { name: 'Leaky faucet' });
    expect(screen.getByLabelText('Add a comment')).toBeInTheDocument();
    expect(screen.queryByLabelText('Change status')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Update status' })).not.toBeInTheDocument();
  });

  it('gives a manager the status control as well as the comment box', async () => {
    renderSheet(true);
    expect(await screen.findByLabelText('Change status')).toBeInTheDocument();
    expect(screen.getByLabelText('Add a comment')).toBeInTheDocument();
  });

  it("shows the API's refusal when the request cannot be read", async () => {
    getRequestMock.mockRejectedValue(new Error('You can only view your own maintenance requests'));
    renderSheet(false);
    expect(await screen.findByText('You can only view your own maintenance requests')).toBeInTheDocument();
    expect(screen.queryByLabelText('Add a comment')).not.toBeInTheDocument();
  });

  it('a status change refetches the request and the lists', async () => {
    updateRequestStatusMock.mockResolvedValue({ data: { id: 7, status: 'acknowledged' } });
    const client = renderSheet(true);
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    fireEvent.click(await screen.findByRole('button', { name: 'Update status' }));

    await waitFor(() => expect(updateRequestStatusMock).toHaveBeenCalledWith(7, 42, { status: 'acknowledged' }));
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: MAINTENANCE_REQUEST_KEYS.all });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: OPERATIONS_KEYS.listRoot(42) });
    });
    // The detail key sits under `all`, so this one invalidation refetches the panel.
    expect(MAINTENANCE_REQUEST_KEYS.detail(42, 7).slice(0, 1)).toEqual([...MAINTENANCE_REQUEST_KEYS.all]);
  });
});

describe('StatusUpdateForm', () => {
  function renderForm(request: MaintenanceRequestItem) {
    render(
      <QueryClientProvider client={newClient()}>
        <StatusUpdateForm request={request} communityId={42} />
      </QueryClientProvider>,
    );
  }

  const options = () =>
    within(screen.getByLabelText('Change status')).getAllByRole('option').map((o) => (o as HTMLOptionElement).value);

  it('offers only the moves the server accepts from the current status', () => {
    renderForm({ ...REQUEST, status: 'in_progress' });
    expect(options()).toEqual(['submitted', 'resolved']);
  });

  it('treats the legacy "open" name as submitted', () => {
    renderForm({ ...REQUEST, status: 'open' });
    expect(options()).toEqual(['acknowledged', 'in_progress']);
  });

  it('labels each status the way the badges do', () => {
    renderForm({ ...REQUEST, status: 'submitted' });
    expect(screen.getByRole('option', { name: 'In Progress' })).toBeInTheDocument();
  });

  it('offers no control once a request is closed', () => {
    renderForm({ ...REQUEST, status: 'closed' });
    expect(screen.queryByLabelText('Change status')).not.toBeInTheDocument();
    expect(screen.getByText(/can no longer change/)).toBeInTheDocument();
  });

  it('asks for the resolution when resolving, and sends it with a date-time', async () => {
    updateRequestStatusMock.mockResolvedValue({ data: { id: 7, status: 'resolved' } });
    renderForm({ ...REQUEST, status: 'in_progress' });
    fireEvent.change(screen.getByLabelText('Change status'), { target: { value: 'resolved' } });
    fireEvent.change(screen.getByLabelText('Resolution description'), { target: { value: 'Washer replaced' } });
    fireEvent.change(screen.getByLabelText('Resolution date'), { target: { value: '2026-01-05' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update status' }));

    await waitFor(() =>
      expect(updateRequestStatusMock).toHaveBeenCalledWith(7, 42, {
        status: 'resolved',
        resolutionDescription: 'Washer replaced',
        resolutionDate: '2026-01-05T00:00:00Z',
      }),
    );
  });

  it("shows the server's message when the update is refused", async () => {
    updateRequestStatusMock.mockRejectedValue(new Error("Invalid status transition: 'resolved' → 'in_progress'"));
    renderForm({ ...REQUEST, status: 'submitted' });
    fireEvent.click(screen.getByRole('button', { name: 'Update status' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid status transition');
  });
});
