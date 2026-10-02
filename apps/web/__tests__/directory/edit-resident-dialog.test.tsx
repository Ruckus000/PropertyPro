/**
 * The edit dialog sends only what changed, with the version token, so the
 * server audits real changes and refuses a save over someone else's.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DirectoryResidentRow } from '../../src/components/directory/directory-model';

const { mutateAsyncMock } = vi.hoisted(() => ({ mutateAsyncMock: vi.fn() }));
vi.mock('@/hooks/use-residents-management', () => ({
  useUpdateResident: () => ({ mutateAsync: mutateAsyncMock, isPending: false, error: null, reset: vi.fn() }),
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

function renderDialog(onSaved = vi.fn()) {
  render(
    <EditResidentDialog
      open
      onOpenChange={vi.fn()}
      communityId={42}
      resident={resident}
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
  beforeEach(() => mutateAsyncMock.mockReset().mockResolvedValue({}));

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
});
