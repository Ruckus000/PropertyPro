/**
 * The edit dialog sends only what changed, with the version token, so the
 * server audits real changes and refuses a save over someone else's.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DirectoryResidentRow } from '../../src/components/directory/directory-model';

const { mutateAsyncMock, updateOccupantMock } = vi.hoisted(() => ({
  mutateAsyncMock: vi.fn(),
  updateOccupantMock: vi.fn(),
}));
vi.mock('@/hooks/use-residents-management', () => ({
  useUpdateResident: () => ({ mutateAsync: mutateAsyncMock, isPending: false, error: null, reset: vi.fn() }),
}));

vi.mock('@/hooks/use-occupants', () => ({
  useUpdateOccupant: () => ({ mutateAsync: updateOccupantMock, isPending: false, error: null, reset: vi.fn() }),
}));

import { EditResidentDialog } from '../../src/components/directory/edit-resident-dialog';

const resident = {
  userId: 'u-1',
  fullName: 'Ana Ruiz',
  email: 'ana@x.test',
  role: 'resident',
  unitId: 4,
  phone: '555-0100',
  isUnitOwner: true,
  designation: null,
  portalStatus: 'active',
  lastSignInAt: null,
  lastInvitedAt: null,
  updatedAt: '2026-10-01T09:00:00.456Z',
  displayName: 'Ana Ruiz',
  initials: 'AR',
  unit: null,
} as DirectoryResidentRow;

function renderDialog(onSaved = vi.fn(), row: DirectoryResidentRow = resident) {
  render(
    <EditResidentDialog
      open
      onOpenChange={vi.fn()}
      communityId={42}
      resident={row}
      hasOwnerRole
      unitOptions={[
        { id: 4, label: 'Unit 4' },
        { id: 9, label: 'Unit 9' },
      ]}
      onSaved={onSaved}
    />,
  );
  return onSaved;
}

describe('EditResidentDialog', () => {
  beforeEach(() => {
    mutateAsyncMock.mockReset().mockResolvedValue({});
    updateOccupantMock.mockReset().mockResolvedValue({});
  });

  it('sends only the changed field, with the version token — an unchanged unit is not a move', async () => {
    const user = userEvent.setup();
    const onSaved = renderDialog();
    const phone = screen.getByLabelText('Phone');
    await user.clear(phone);
    await user.type(phone, '555-0199');
    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(mutateAsyncMock).toHaveBeenCalledWith({
      userId: 'u-1',
      expectedUpdatedAt: '2026-10-01T09:00:00.456Z',
      phone: '555-0199',
    });
    expect(onSaved).toHaveBeenCalledWith(false);
  });

  it('saving with nothing changed sends nothing', async () => {
    const user = userEvent.setup();
    const onSaved = renderDialog();
    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(mutateAsyncMock).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledWith(false);
  });

  it('a household member saves through occupants, and their contact email is editable', async () => {
    const user = userEvent.setup();
    renderDialog(vi.fn(), {
      ...resident,
      userId: 'occupant:5',
      occupantId: 5,
      ownerHousehold: true,
      isUnitOwner: false,
      email: null,
      portalStatus: 'no_login',
    });
    expect(screen.getByRole('radio', { name: "Owner's household" })).toBeChecked();
    await user.type(screen.getByLabelText('Email'), 'kid@x.test');
    await user.click(screen.getByRole('radio', { name: "Tenant's household" }));
    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(updateOccupantMock).toHaveBeenCalledWith({
      id: 5,
      expectedUpdatedAt: '2026-10-01T09:00:00.456Z',
      email: 'kid@x.test',
      isOwnerHousehold: false,
    });
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it("a member's sign-in email is read-only", () => {
    renderDialog();
    expect(screen.getByLabelText('Email')).toBeDisabled();
  });
});
