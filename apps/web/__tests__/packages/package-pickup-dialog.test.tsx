import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { mutateAsync } = vi.hoisted(() => ({ mutateAsync: vi.fn() }));

vi.mock('@/hooks/use-packages', () => ({
  usePickupPackage: () => ({ mutateAsync, isPending: false }),
}));

import { PackagePickupDialog } from '@/components/packages/PackagePickupDialog';
import type { PackageListItem } from '@/hooks/use-packages';

const pkg = {
  id: 7,
  communityId: 1,
  unitId: 12,
  unitLabel: 'Unit 4C',
  recipientName: 'Ada Fisher',
  carrier: 'UPS',
  trackingNumber: null,
  status: 'received',
  receivedByStaffId: null,
  pickedUpAt: null,
  pickedUpByName: null,
  notes: null,
  createdAt: '2026-03-01T00:00:00.000Z',
  updatedAt: '2026-03-01T00:00:00.000Z',
} as PackageListItem;

describe('PackagePickupDialog', () => {
  beforeEach(() => mutateAsync.mockReset().mockResolvedValue(undefined));

  it('names the recipient and carrier', () => {
    render(<PackagePickupDialog communityId={1} pkg={pkg} onClose={() => {}} />);
    expect(screen.getByText(/Ada Fisher.s\s+UPS package/)).toBeInTheDocument();
  });

  it('disables Confirm Pickup until a name is typed', async () => {
    const user = userEvent.setup();
    render(<PackagePickupDialog communityId={1} pkg={pkg} onClose={() => {}} />);
    const confirm = screen.getByRole('button', { name: 'Confirm Pickup' });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText('Picked Up By'), 'Sam');
    expect(confirm).toBeEnabled();
  });

  it('confirms with the trimmed name, then closes', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<PackagePickupDialog communityId={1} pkg={pkg} onClose={onClose} />);
    await user.type(screen.getByLabelText('Picked Up By'), '  Sam Okafor  ');
    await user.click(screen.getByRole('button', { name: 'Confirm Pickup' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({ packageId: 7, pickedUpByName: 'Sam Okafor' });
  });

  it('renders no dialog without a package', () => {
    render(<PackagePickupDialog communityId={1} pkg={null} onClose={() => {}} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
