/**
 * Unit tests for AssignmentModal (B5 drain #19).
 *
 * Post-drain: the modal sources its assignable-staff list from the
 * `useResidents` hook instead of a direct `fetch('/api/v1/residents')`.
 * These tests mock `useResidents` (the data boundary) and
 * `assignRequest` (the already-extracted service helper).
 *
 * Covers: loading text, load-error literal, populated select options,
 * assign success (onAssigned/onClose), and assign failure surfacing.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { MaintenanceRequestItem } from '../../src/lib/api/maintenance-requests';

const useResidentsMock = vi.fn();
const assignRequestMock = vi.fn();

vi.mock('@/hooks/use-residents', () => ({
  ADMIN_ROLES_PARAM:
    'board_member,board_president,cam,site_manager,property_manager_admin',
  useResidents: (communityId: number, roles: string) =>
    useResidentsMock(communityId, roles),
}));

vi.mock('@/lib/api/admin-maintenance', () => ({
  assignRequest: (...args: unknown[]) => assignRequestMock(...args),
}));

import { AssignmentModal } from '../../src/components/maintenance/AssignmentModal';

const request = {
  id: 99,
  title: 'Leaky faucet in 3B',
  assignedToId: null,
} as unknown as MaintenanceRequestItem;

interface ResidentsState {
  data?: { userId: string; fullName: string; role: string }[];
  isLoading: boolean;
  isError: boolean;
}

function setResidents(state: ResidentsState) {
  useResidentsMock.mockReturnValue(state);
}

function renderModal(overrides?: {
  onClose?: () => void;
  onAssigned?: (u: MaintenanceRequestItem) => void;
}) {
  const onClose = overrides?.onClose ?? vi.fn();
  const onAssigned = overrides?.onAssigned ?? vi.fn();
  render(
    <AssignmentModal
      request={request}
      communityId={42}
      onClose={onClose}
      onAssigned={onAssigned}
    />,
  );
  return { onClose, onAssigned };
}

describe('AssignmentModal', () => {
  beforeEach(() => {
    useResidentsMock.mockReset();
    assignRequestMock.mockReset();
  });

  it('shows the loading text while residents load', () => {
    setResidents({ isLoading: true, isError: false });
    renderModal();
    expect(screen.getByText('Loading staff members...')).toBeDefined();
  });

  it('shows the load-error literal when the residents query errors', () => {
    setResidents({ isLoading: false, isError: true });
    renderModal();
    expect(screen.getByText('Failed to load assignable users')).toBeDefined();
    // form still renders with an empty (Unassigned-only) select
    expect(screen.getByText('Unassigned')).toBeDefined();
  });

  it('renders an option per resident with role label', () => {
    setResidents({
      isLoading: false,
      isError: false,
      data: [
        { userId: 'u1', fullName: 'Alice Owner', role: 'cam' },
        { userId: 'u2', fullName: 'Bob Board', role: 'board_member' },
      ],
    });
    renderModal();
    expect(screen.getByText('Alice Owner (cam)')).toBeDefined();
    expect(screen.getByText('Bob Board (board member)')).toBeDefined();
  });

  it('assigns the selected user and calls onAssigned + onClose on success', async () => {
    const updated = { id: 99, assignedToId: 'u1' } as MaintenanceRequestItem;
    assignRequestMock.mockResolvedValueOnce({ data: updated });
    setResidents({
      isLoading: false,
      isError: false,
      data: [{ userId: 'u1', fullName: 'Alice Owner', role: 'cam' }],
    });
    const { onClose, onAssigned } = renderModal();

    fireEvent.change(screen.getByLabelText('Assign to'), {
      target: { value: 'u1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Assignment' }));

    await waitFor(() => expect(onAssigned).toHaveBeenCalledWith(updated));
    expect(assignRequestMock).toHaveBeenCalledWith(99, 42, 'u1');
    expect(onClose).toHaveBeenCalled();
  });

  it('surfaces an assign failure in the error slot', async () => {
    assignRequestMock.mockRejectedValueOnce(new Error('Assign blew up'));
    setResidents({
      isLoading: false,
      isError: false,
      data: [{ userId: 'u1', fullName: 'Alice Owner', role: 'cam' }],
    });
    const { onClose } = renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Save Assignment' }));

    await waitFor(() =>
      expect(screen.getByText('Assign blew up')).toBeDefined(),
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});
