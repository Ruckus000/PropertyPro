/**
 * Leases v3: for apartments, occupancy comes from leases. The unit form must
 * neither offer it nor send it — the API refuses any occupancy for apartments.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Unit } from '../../src/hooks/use-units';

const { createMock, updateMock } = vi.hoisted(() => ({ createMock: vi.fn(), updateMock: vi.fn() }));
vi.mock('@/hooks/use-units', () => ({
  useCreateUnit: () => ({ mutateAsync: createMock, isPending: false, error: null, reset: vi.fn() }),
  useUpdateUnit: () => ({ mutateAsync: updateMock, isPending: false, error: null, reset: vi.fn() }),
}));

import { UnitFormDialog } from '../../src/components/directory/unit-form-dialog';

const unit: Unit = {
  id: 7, communityId: 42, unitNumber: '4B', building: null, floor: 4, bedrooms: 2, bathrooms: 1, sqft: null,
  rentAmount: null, ownerUserId: null, occupancy: 'rented', occupancyConfirmed: true, occupancySource: 'leases',
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-10-01T09:00:00.000Z',
};

function renderDialog(occupancyFromLeases: boolean, editing: Unit | null) {
  render(
    <UnitFormDialog
      open
      unit={editing}
      onOpenChange={vi.fn()}
      communityId={42}
      hasOwnerRole={false}
      showRent
      occupancyFromLeases={occupancyFromLeases}
      onSaved={vi.fn()}
    />,
  );
}

describe('UnitFormDialog occupancy', () => {
  beforeEach(() => {
    createMock.mockReset().mockResolvedValue({ id: 8 });
    updateMock.mockReset().mockResolvedValue({ id: 7 });
  });

  it('apartments: no occupancy choice, a pointer to Leases, and nothing sent on save', async () => {
    renderDialog(true, unit);
    expect(screen.queryByRole('group', { name: 'Occupancy' })).toBeNull();
    expect(screen.getByText(/Occupancy comes from leases/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0]![0]).not.toHaveProperty('occupancy');
  });

  it('apartments: a new unit is created without occupancy', async () => {
    renderDialog(true, null);
    await userEvent.type(screen.getByLabelText(/unit number/i), '9C');
    await userEvent.click(screen.getByRole('button', { name: /add|save/i }));
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0]![0]).not.toHaveProperty('occupancy');
  });

  it('condos and HOAs keep the manual choice and send it', async () => {
    renderDialog(false, { ...unit, occupancySource: 'manual' });
    expect(screen.getByRole('group', { name: 'Occupancy' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(updateMock.mock.calls[0]![0]).toHaveProperty('occupancy', 'rented');
  });
});
