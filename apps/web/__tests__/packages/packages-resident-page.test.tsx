import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';

const { useMyPackagesMock, refetch } = vi.hoisted(() => ({
  useMyPackagesMock: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock('@/hooks/use-packages', () => ({
  useMyPackages: useMyPackagesMock,
}));

import { PackagesResidentPage } from '@/components/packages/packages-resident-page';
import type { PackageListItem } from '@/hooks/use-packages';

function pkg(id: number, status: PackageListItem['status']): PackageListItem {
  return {
    id,
    communityId: 1,
    unitId: 1,
    unitLabel: 'Unit 1A',
    recipientName: `Resident ${id}`,
    carrier: id === 1 ? 'UPS' : 'FedEx',
    trackingNumber: id === 1 ? '1Z999' : null,
    status,
    receivedByStaffId: null,
    pickedUpAt: status === 'picked_up' ? '2026-03-02T10:00:00.000Z' : null,
    pickedUpByName: null,
    notes: null,
    createdAt: '2026-03-01T10:00:00.000Z',
    updatedAt: '2026-03-01T10:00:00.000Z',
  };
}

function result(over: Record<string, unknown>) {
  return { data: undefined, isLoading: false, isError: false, error: null, refetch, ...over };
}

const two = [pkg(1, 'received'), pkg(2, 'picked_up')];

describe('PackagesResidentPage', () => {
  beforeEach(() => {
    refetch.mockReset();
    useMyPackagesMock.mockReset();
    useMyPackagesMock.mockReturnValue(result({ data: two }));
  });

  it('draws no panel and no management figures', () => {
    const { container } = render(<PackagesResidentPage communityId={1} />);
    expect(screen.getByRole('heading', { level: 1, name: 'My packages' })).toBeVisible();
    expect(container.querySelector('aside')).toBeNull();
    expect(screen.queryByText(/awaiting pickup/i)).toBeNull();
  });

  it('says Ready to collect for a received package and Picked up for a collected one', () => {
    render(<PackagesResidentPage communityId={1} />);
    const [first, second] = screen.getAllByRole('listitem');
    expect(first).toHaveTextContent(/Ready to collect · Received Mar 1, 2026/);
    expect(second).toHaveTextContent(/Picked up · Received Mar 1, 2026/);
    expect(screen.getByText('UPS')).toBeInTheDocument();
    expect(screen.getByText('1Z999')).toBeInTheDocument();
  });

  it('shows the first-run heading and no button when there are no packages', () => {
    useMyPackagesMock.mockReturnValue(result({ data: [] }));
    render(<PackagesResidentPage communityId={1} />);
    expect(screen.getByRole('heading', { name: 'No packages for you yet' })).toBeVisible();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('marks the section busy while loading, with the title painted', () => {
    useMyPackagesMock.mockReturnValue(result({ isLoading: true }));
    const { container } = render(<PackagesResidentPage communityId={1} />);
    expect(screen.getByRole('heading', { level: 1, name: 'My packages' })).toBeVisible();
    expect(container.querySelector('section[aria-busy="true"]')).not.toBeNull();
  });

  it('shows an alert with a retry on error', async () => {
    const user = userEvent.setup();
    useMyPackagesMock.mockReturnValue(result({ isError: true, error: new Error('boom') }));
    render(<PackagesResidentPage communityId={1} />);
    expect(screen.getByRole('alert')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('has no axe violations', async () => {
    const { container } = render(<PackagesResidentPage communityId={1} />);
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(await axe(container)).toHaveNoViolations();
  });
});
