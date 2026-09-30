import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mutateMock } = vi.hoisted(() => ({ mutateMock: vi.fn() }));

vi.mock('@/hooks/use-access-requests', () => ({
  useApproveAccessRequest: () => ({ mutate: mutateMock, isPending: false, isError: false, reset: vi.fn() }),
}));

import { ApproveDialog } from '../../src/components/access-requests/approve-dialog';

const UNITS = [
  { id: 7, label: '101 · Building A' },
  { id: 8, label: '101 · Building B' },
];

async function openDialog(props: Partial<Parameters<typeof ApproveDialog>[0]> = {}) {
  const user = userEvent.setup();
  render(<ApproveDialog requestId={5} requestName="Ada Lovelace" onSuccess={vi.fn()} {...props} />);
  await user.click(screen.getByRole('button', { name: 'Approve' }));
  return user;
}

describe('ApproveDialog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('legacy mode (no unit options): unit is optional and typed as an id', async () => {
    const user = await openDialog();
    expect(screen.getByPlaceholderText('Enter unit ID')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Approve Request' }));
    expect(mutateMock).toHaveBeenCalledWith({ requestId: 5, unitId: undefined }, expect.anything());
  });

  it('with unit options: a unit is required before approving', async () => {
    const user = await openDialog({ unitOptions: UNITS });
    const approve = screen.getByRole('button', { name: 'Approve Request' });
    expect(approve).toBeDisabled();

    await user.selectOptions(screen.getByRole('combobox', { name: /unit/i }), '8');
    expect(approve).toBeEnabled();
    await user.click(approve);
    expect(mutateMock).toHaveBeenCalledWith({ requestId: 5, unitId: 8 }, expect.anything());
  });

  it('pre-selects the claimed unit when it exists', async () => {
    await openDialog({ unitOptions: UNITS, claimedUnitId: 7, claimedUnitIdentifier: '101' });
    expect(screen.getByRole('combobox', { name: /unit/i })).toHaveValue('7');
    expect(screen.queryByText(/does not exist/i)).not.toBeInTheDocument();
  });

  it('warns when the claimed unit does not exist', async () => {
    await openDialog({ unitOptions: UNITS, claimedUnitId: null, claimedUnitIdentifier: 'PH-9' });
    expect(screen.getByRole('combobox', { name: /unit/i })).toHaveValue('');
    expect(screen.getByText(/claimed unit “PH-9”, which does not exist/)).toBeInTheDocument();
  });
});
