import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';

const { usePackagesMock, refetch } = vi.hoisted(() => ({
  usePackagesMock: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock('@/hooks/use-packages', () => ({
  usePackages: usePackagesMock,
  usePickupPackage: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreatePackage: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { PackagesStaffPage } from '@/components/packages/packages-staff-page';
import type { PackageListItem } from '@/hooks/use-packages';

function pkg(id: number, status: PackageListItem['status'], name = `Resident ${id}`): PackageListItem {
  return {
    id,
    communityId: 1,
    unitId: id,
    unitLabel: `Unit ${id}A`,
    recipientName: name,
    carrier: 'UPS',
    trackingNumber: null,
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

const ABOUT = 'Managers can add and change these.' as never;

function mount() {
  return render(<PackagesStaffPage communityId={1} about={ABOUT} />);
}

const three = [pkg(1, 'received'), pkg(2, 'received'), pkg(3, 'picked_up')];

describe('PackagesStaffPage', () => {
  beforeEach(() => {
    refetch.mockReset();
    usePackagesMock.mockReset();
    usePackagesMock.mockReturnValue(result({ data: three }));
  });

  it('shows the title, the glance figure and the counts', () => {
    const { container } = mount();
    expect(screen.getByRole('heading', { level: 1, name: 'Packages' })).toBeVisible();
    const glance = container.querySelector('[data-source="usePackages"]') as HTMLElement;
    expect(glance).not.toBeNull();
    expect(within(glance).getByText('2')).toBeInTheDocument();
    expect(within(glance).getByText('awaiting pickup')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Awaiting pickup/ })).toHaveTextContent('2');
    expect(screen.getByText('Showing 3')).toBeInTheDocument();
  });

  it('marks the active filter in ink, never in the interactive colour', () => {
    mount();
    const active = screen
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-pressed') === 'true');
    expect(active).toHaveLength(1);
    expect(active[0]!.className).not.toContain('interactive');
    expect(active[0]!.className).toContain('bg-surface-muted');
  });

  it('keeps the figure and the table in agreement', () => {
    usePackagesMock.mockReturnValue(
      result({ data: [1, 2, 3, 4].map((i) => pkg(i, 'received')) }),
    );
    const { container } = mount();
    const glance = container.querySelector('[data-source="usePackages"]') as HTMLElement;
    expect(within(glance).getByText('4')).toBeInTheDocument();
    expect(container.querySelectorAll('tbody tr')).toHaveLength(4);
  });

  it('opens the pickup dialog for the row clicked', async () => {
    const user = userEvent.setup();
    mount();
    const buttons = screen.getAllByRole('button', { name: /mark picked up/i });
    await user.click(buttons[0]!);
    expect(await screen.findByRole('dialog')).toHaveTextContent("Resident 1's UPS package");
  });

  it('filters to picked up and offers Show all when nothing matches', async () => {
    const user = userEvent.setup();
    usePackagesMock.mockReturnValue(result({ data: [pkg(1, 'received')] }));
    mount();
    await user.click(screen.getByRole('button', { name: /^Picked up/ }));
    expect(screen.getByText('Nothing matches this filter')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show all' }));
    expect(screen.getByText('Showing 1')).toBeInTheDocument();
  });

  it('explains the empty state with one Log a package button', () => {
    usePackagesMock.mockReturnValue(result({ data: [] }));
    const { container } = mount();
    expect(screen.getByRole('heading', { name: 'No packages logged yet' })).toBeVisible();
    expect(screen.getByText('Example of a logged package')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'At a glance' })).toBeNull();
    expect(container.querySelector('[data-source="usePackages"]')).toBeNull();
    expect(screen.getByText(ABOUT)).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Log a package' })).toHaveLength(1);
  });

  it('marks the section busy while loading, with the title already painted', () => {
    usePackagesMock.mockReturnValue(result({ data: undefined, isLoading: true }));
    const { container } = mount();
    expect(screen.getByRole('heading', { level: 1, name: 'Packages' })).toBeVisible();
    expect(container.querySelector('section[aria-busy="true"]')).not.toBeNull();
  });

  it('shows an alert with a retry on error', async () => {
    const user = userEvent.setup();
    usePackagesMock.mockReturnValue(
      result({ data: undefined, isError: true, error: new Error('boom') }),
    );
    mount();
    expect(screen.getByRole('alert')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('has no Needs attention position', () => {
    mount();
    expect(screen.queryByRole('heading', { name: 'Needs attention' })).toBeNull();
  });

  it('has no axe violations', async () => {
    const { container } = mount();
    expect(container.querySelectorAll('tbody tr').length).toBeGreaterThan(0);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows the status as a glyph and its word, with no link or interactive colour', () => {
    usePackagesMock.mockReturnValue(result({ data: [pkg(1, 'received')] }));
    const { container } = mount();
    const cell = Array.from(container.querySelectorAll('tbody td')).find((td) =>
      td.textContent?.includes('Received') && td.querySelector('svg'),
    ) as HTMLElement;
    expect(cell).toBeDefined();
    expect(cell).toHaveTextContent('Received');
    const all = [cell, ...Array.from(cell.querySelectorAll('*'))];
    for (const el of all) {
      const cls = el.getAttribute('class') ?? '';
      expect(cls).not.toContain('content-link');
      expect(cls).not.toContain('interactive');
    }
  });
});
