import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { axe } from 'vitest-axe';
import type { RosterLease, RosterUnit } from '@/lib/leases/roster-model';

const { rosterMock, refetch } = vi.hoisted(() => ({ rosterMock: vi.fn(), refetch: vi.fn() }));

vi.mock('next/link', () => ({ default: ({ children, ...p }: { children: React.ReactNode }) => <a {...p}>{children}</a> }));
vi.mock('@/hooks/use-lease-roster', () => ({
  useLeaseRosterData: rosterMock,
  useLeaseActions: () => ({}),
}));
vi.mock('@/hooks/use-occupants', () => ({ useOccupants: () => ({ data: [] }) }));
// The record view and the dialogs are not this page's subject: stand-ins that
// say what the page asked them to show.
vi.mock('../UnitPanel', () => ({
  UnitPanel: ({ model }: { model: { unit: { unitNumber: string } } | null }) =>
    model ? <div data-testid="unit-panel">{model.unit.unitNumber}</div> : null,
}));
vi.mock('../dialogs', () => ({
  RosterDialogHost: ({ dialog }: { dialog: { kind: string; mode?: string } | null }) =>
    dialog ? <div data-testid="dialog">{`${dialog.kind}:${dialog.mode ?? ''}`}</div> : null,
}));
vi.mock('../AlertWindowsMenu', () => ({
  AlertWindowsMenu: ({ canEdit, windows }: { canEdit: boolean; windows: number[] }) => (
    <div data-testid="alert-windows" data-can-edit={String(canEdit)}>{windows.join(',')}</div>
  ),
}));

import { LeaseRosterPage } from '../LeaseRosterPage';

const TODAY = '2026-09-28';
const units: RosterUnit[] = [
  { id: 1, unitNumber: '101', building: null, floor: 1, rentAmount: '1500.00' },
  { id: 2, unitNumber: '102', building: null, floor: 1, rentAmount: '1500.00' },
  { id: 3, unitNumber: '201', building: null, floor: 2, rentAmount: '1700.00' },
  { id: 4, unitNumber: '202', building: null, floor: 2, rentAmount: '1700.00' },
];
const lease = (id: number, unitId: number, extra: Partial<RosterLease> = {}): RosterLease => ({
  id, unitId, status: 'active', startDate: '2026-01-01', endDate: '2027-06-30', previousLeaseId: null,
  moveOutOn: null, endVia: null, residentId: `u${id}`, rentAmount: '1500.00', notes: null, ...extra,
});
// 101 leased · 102 ends inside the 90-day window · 201 month-to-month ·
// 202 vacant, with one lease that ended in June.
const leases: RosterLease[] = [
  lease(1, 1),
  lease(2, 2, { endDate: '2026-11-15' }),
  lease(3, 3, { endDate: null }),
  lease(4, 4, { startDate: '2025-07-01', endDate: '2026-06-30', moveOutOn: '2026-06-30', endVia: 'notice' }),
];
const directory = {
  users: new Map([
    ['u1', { name: 'Ana Beltrán', email: 'ana@x.test' }],
    ['u2', { name: 'Ben Cho', email: 'ben@x.test' }],
    ['u3', { name: 'Cy Diaz', email: 'cy@x.test' }],
    ['u4', { name: 'Dee Eng', email: 'dee@x.test' }],
  ]),
};

function data(over: Record<string, unknown> = {}) {
  return {
    leases,
    units,
    offers: [],
    residents: [],
    directory,
    settings: { alertWindows: [30, 60, 90], allowResidentsWithoutEmail: false },
    isLoading: false,
    isError: false,
    hasPartialError: false,
    refetch,
    ...over,
  };
}

function mount(isRootManager = false) {
  return render(<LeaseRosterPage communityId={3} today={TODAY} isRootManager={isRootManager} />);
}

const openButtons = () =>
  screen.queryAllByRole('button', { name: /^Open Unit / }).map((b) => b.getAttribute('aria-label'));
const filter = (name: RegExp) => screen.getByRole('button', { name });

describe('LeaseRosterPage', () => {
  beforeEach(() => {
    refetch.mockReset();
    rosterMock.mockReset();
    rosterMock.mockReturnValue(data());
  });

  it('paints the title and description, with New lease as the header action', () => {
    const { container } = mount();
    expect(screen.getByRole('heading', { level: 1, name: 'Leases' })).toBeVisible();
    expect(container.querySelector('[data-page-template="list"]')).not.toBeNull();
    const header = container.querySelector<HTMLElement>('[data-page-header]')!;
    expect(within(header).getByText(/Every unit and its lease/)).toBeVisible();
    fireEvent.click(within(header).getByRole('button', { name: 'New lease' }));
    expect(screen.getByTestId('dialog').textContent).toBe('lease:new');
    // One "New lease" on the page: the toolbar no longer carries its own.
    expect(screen.getAllByRole('button', { name: 'New lease' })).toHaveLength(1);
  });

  it('each former tile is a toolbar filter that keeps its count', () => {
    mount();
    expect(filter(/^All units\s*4$/).getAttribute('aria-pressed')).toBe('true');
    expect(filter(/^Renewals due\s*1$/).getAttribute('aria-pressed')).toBe('false');
    expect(filter(/^Vacant\s*1$/)).toBeDefined();
    expect(filter(/^Month-to-month\s*1$/)).toBeDefined();
  });

  it('each filter shows the rows its tile did, and All units resets', () => {
    mount();
    expect(openButtons()).toEqual(['Open Unit 101', 'Open Unit 102', 'Open Unit 201', 'Open Unit 202']);

    fireEvent.click(filter(/^Renewals due/));
    expect(openButtons()).toEqual(['Open Unit 102']);
    expect(filter(/^Renewals due/).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(filter(/^Vacant/));
    expect(openButtons()).toEqual(['Open Unit 202']);

    fireEvent.click(filter(/^Month-to-month/));
    expect(openButtons()).toEqual(['Open Unit 201']);

    fireEvent.click(filter(/^All units/));
    expect(openButtons()).toHaveLength(4);
  });

  it('pressing the selected filter again returns to all units, as the tile did', () => {
    mount();
    fireEvent.click(filter(/^Month-to-month/));
    fireEvent.click(filter(/^Month-to-month/));
    expect(filter(/^All units/).getAttribute('aria-pressed')).toBe('true');
    expect(openButtons()).toHaveLength(4);
  });

  it('search narrows the roster and offers a way back when nothing matches', () => {
    mount();
    const search = screen.getByRole('searchbox', { name: 'Search units, residents or emails' });
    fireEvent.change(search, { target: { value: 'ben' } });
    expect(openButtons()).toEqual(['Open Unit 102']);
    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(openButtons()).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(openButtons()).toHaveLength(4);
  });

  it('sorting by lease end drops the floor groups', () => {
    mount();
    expect(screen.getByRole('button', { name: /Floor 1/ })).toBeDefined();
    const byEnd = within(screen.getByRole('group', { name: 'Sort' })).getByRole('button', { name: 'Lease end' });
    fireEvent.click(byEnd);
    expect(byEnd.getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('button', { name: /Floor 1/ })).toBeNull();
  });

  it('the past-leases view lists ended leases and opens the unit', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Past leases (1)' }));
    expect(openButtons()).toEqual([]);
    const row = screen.getByRole('button', { name: /Unit 202.*Dee Eng/ });
    expect(screen.getByText(/Ended.*Jun 30, 2026/)).toBeVisible();
    fireEvent.click(row);
    expect(screen.getByTestId('unit-panel').textContent).toBe('202');
    fireEvent.click(screen.getByRole('button', { name: 'Back to all units' }));
    expect(openButtons()).toHaveLength(4);
  });

  it('opening a row shows the unit panel', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Open Unit 101' }));
    expect(screen.getByTestId('unit-panel').textContent).toBe('101');
  });

  it('shows occupancy at a glance', () => {
    const { container } = mount();
    const glance = container.querySelector<HTMLElement>('[data-source="useLeaseRosterData"]')!;
    expect(within(glance).getByText('75.0%')).toBeVisible();
    expect(within(glance).getByText('3 of 4 units')).toBeVisible();
  });

  it('loading: the header and filters stay, counts and rows wait', () => {
    rosterMock.mockReturnValue(data({ leases: [], units: [], isLoading: true }));
    const { container } = mount();
    expect(screen.getByRole('heading', { level: 1, name: 'Leases' })).toBeVisible();
    expect(container.querySelector('section[aria-busy="true"]')).not.toBeNull();
    expect(filter(/^All units$/)).toBeDefined();
    expect(screen.queryByRole('table')).toBeNull();
    // Not yet known to be empty: neither empty message may show.
    expect(screen.queryByText('No leases yet')).toBeNull();
    expect(screen.queryByText(/there are none yet/)).toBeNull();
  });

  it('error: says what failed and retries, without drawing an empty roster', () => {
    rosterMock.mockReturnValue(data({ leases: [], units: [], isError: true }));
    mount();
    expect(screen.getByRole('alert').textContent).toContain("We couldn't load leases.");
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByText('No leases yet')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('partial error: warns that names or offers may be missing and still shows the roster', () => {
    rosterMock.mockReturnValue(data({ hasPartialError: true }));
    mount();
    expect(screen.getByText('Some lease details are unavailable.')).toBeVisible();
    expect(openButtons()).toHaveLength(4);
  });

  it('first run: offers the first lease in the section, not the header, above the vacant units', () => {
    rosterMock.mockReturnValue(data({ leases: [] }));
    const { container } = mount();
    expect(screen.getByRole('heading', { level: 2, name: 'No leases yet' })).toBeVisible();
    const header = container.querySelector<HTMLElement>('[data-page-header]')!;
    expect(within(header).queryByRole('button', { name: 'New lease' })).toBeNull();
    expect(openButtons()).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'Add the first lease' }));
    expect(screen.getByTestId('dialog').textContent).toBe('lease:new');
  });

  it('no units yet: points at the Directory', () => {
    rosterMock.mockReturnValue(data({ leases: [], units: [] }));
    mount();
    expect(screen.getByText('Leases hang off units, and there are none yet.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Add units in the Directory' }).getAttribute('href')).toBe(
      '/dashboard/directory?communityId=3',
    );
    expect(screen.queryByText('No leases yet')).toBeNull();
  });

  it('only the root manager can edit the expiry alert windows', () => {
    const first = mount(false);
    expect(screen.getByTestId('alert-windows').getAttribute('data-can-edit')).toBe('false');
    first.unmount();
    mount(true);
    expect(screen.getByTestId('alert-windows').getAttribute('data-can-edit')).toBe('true');
  });

  it('has no axe violations', async () => {
    const { container } = mount();
    expect(await axe(container)).toHaveNoViolations();
  });
});
