import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { useVendorsMock, useCreateWorkOrderMock } = vi.hoisted(() => ({
  useVendorsMock: vi.fn(),
  useCreateWorkOrderMock: vi.fn(),
}));

vi.mock('@/hooks/use-operations', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/use-operations')>('@/hooks/use-operations');
  return { ...actual, useVendors: useVendorsMock, useCreateWorkOrder: useCreateWorkOrderMock };
});

import { WorkOrderCreateSheet } from '../WorkOrderCreateSheet';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const mutateAsync = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  useVendorsMock.mockReturnValue({
    data: [{ id: 1, name: 'Acme', company: null, phone: null, email: null, specialties: null, isActive: true }],
    isLoading: false,
  });
  useCreateWorkOrderMock.mockReturnValue({ mutateAsync, isPending: false });
  mutateAsync.mockResolvedValue({ data: { id: 1 } });
});

describe('<WorkOrderCreateSheet>', () => {
  it('renders the Dispatch Work Order drawer with vendor picker options', () => {
    render(wrap(
      <WorkOrderCreateSheet open={true} onClose={vi.fn()} communityId={42} />,
    ));
    expect(screen.getByRole('heading', { name: /dispatch work order/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/vendor/i)).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /acme/i })).toBeInTheDocument();
  });

  it('submits a minimal payload with vendor', async () => {
    const onClose = vi.fn();
    render(wrap(
      <WorkOrderCreateSheet open={true} onClose={onClose} communityId={42} />,
    ));

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Fix pump' } });
    fireEvent.change(screen.getByLabelText(/vendor/i), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /dispatch/i }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Fix pump',
      vendorId: 1,
      priority: 'medium',
    }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('allows "assign later" when vendor is left empty', async () => {
    render(wrap(<WorkOrderCreateSheet open={true} onClose={vi.fn()} communityId={42} />));
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Fix' } });
    fireEvent.click(screen.getByRole('button', { name: /dispatch/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync.mock.calls[0]![0]).toMatchObject({ vendorId: null });
  });
});
