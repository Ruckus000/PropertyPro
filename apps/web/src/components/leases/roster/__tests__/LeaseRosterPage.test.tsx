import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { buildRoster, buildTiles, type RosterLease, type RosterUnit } from '@/lib/leases/roster-model';

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

// One of each state the vacant filter gathers: 102 moving out, 201 vacant,
// 202 offline, 301 vacant but pre-leased. Plus 101 leased, 302 month-to-month
// and 303 inside the renewal window.
const mixedUnits: RosterUnit[] = [
  { id: 1, unitNumber: '101', building: null, floor: 1, rentAmount: '1500.00' },
  { id: 2, unitNumber: '102', building: null, floor: 1, rentAmount: '1500.00' },
  { id: 3, unitNumber: '201', building: null, floor: 2, rentAmount: '1700.00' },
  { id: 4, unitNumber: '202', building: null, floor: 2, rentAmount: '1700.00', offlineReason: 'renovation', offlineSince: '2026-09-01', offlineUntil: '2026-12-01' },
  { id: 5, unitNumber: '301', building: null, floor: 3, rentAmount: '1900.00' },
  { id: 6, unitNumber: '302', building: null, floor: 3, rentAmount: '1900.00' },
  { id: 7, unitNumber: '303', building: null, floor: 3, rentAmount: '1900.00' },
];
const mixedLeases: RosterLease[] = [
  lease(1, 1),
  lease(2, 2, { moveOutOn: '2026-10-31', endVia: 'notice' }),
  lease(3, 3, { startDate: '2025-09-01', endDate: '2026-09-01', moveOutOn: '2026-09-01', endVia: 'notice' }),
  lease(5, 5, { startDate: '2026-11-01', endDate: '2027-10-31' }),
  lease(6, 6, { endDate: null }),
  lease(7, 7, { endDate: '2026-11-15' }),
];

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
    expect(filter(/^Renewals due within 90 days\s*1$/).getAttribute('aria-pressed')).toBe('false');
    expect(filter(/^Vacant and moving out\s*1$/)).toBeDefined();
    expect(filter(/^Month-to-month\s*1$/)).toBeDefined();
    expect(within(screen.getByRole('group', { name: 'Filter units' })).getAllByRole('button')).toHaveLength(4);
  });

  it('every filter count equals the rows it lists, with moving-out and offline units present', () => {
    rosterMock.mockReturnValue(data({ units: mixedUnits, leases: mixedLeases }));
    mount();
    const seen: Record<string, number> = {};
    for (const name of [/^All units/, /^Renewals due/, /^Vacant and moving out/, /^Month-to-month/]) {
      const chip = filter(name);
      const n = Number(/(\d+)$/.exec(chip.textContent ?? '')?.[1]);
      fireEvent.click(chip);
      expect(chip.getAttribute('aria-pressed')).toBe('true');
      expect(openButtons()).toHaveLength(n);
      seen[String(name)] = n;
    }
    // Vacant lists 201 (vacant), 301 (pre-leased), 102 (moving out) and 202 (offline).
    expect(Object.values(seen)).toEqual([7, 1, 4, 1]);
  });

  it('keeps everything the tiles said: vacancy, pre-leased, offline, days empty and the renewal window', () => {
    rosterMock.mockReturnValue(data({ units: mixedUnits, leases: mixedLeases }));
    const { container } = mount();
    const t = buildTiles(
      buildRoster({ units: mixedUnits, leases: mixedLeases, offers: [], directory, today: TODAY, alertWindows: [30, 60, 90] }),
      TODAY,
      [30, 60, 90],
    );
    // The fixture must exercise every figure, or equal zeros prove nothing.
    expect([t.vacant.count, t.vacant.avgDaysEmpty, t.vacant.preLeased, t.vacant.movingOut, t.all.offline]).toEqual([2, 26, 1, 1, 1]);
    // One wrapping row in the section, not stacked panel lines: stacked, they
    // pushed the table below the fold.
    const row = container.querySelector<HTMLElement>('dl[aria-label="Unit figures"]')!;
    expect(row.className).toContain('flex-wrap');
    expect(row.children).toHaveLength(6);
    const value = (label: string) => within(row).getByText(label).nextElementSibling?.textContent;
    expect(value('Vacant')).toBe(String(t.vacant.count));
    expect(value('Average days empty')).toBe(String(t.vacant.avgDaysEmpty));
    expect(value('Pre-leased')).toBe(String(t.vacant.preLeased));
    expect(value('Moving out')).toBe(String(t.vacant.movingOut));
    expect(value('Offline')).toBe(String(t.all.offline));
    expect(value('Renewals with no offer')).toBe(String(t.renewalsDue.withoutOffer));
    expect(filter(new RegExp(`^Renewals due within ${t.renewalsDue.window} days`))).toBeDefined();
  });

  it('the renewal window on the filter follows the alert setting', () => {
    rosterMock.mockReturnValue(data({ settings: { alertWindows: [30, 60], allowResidentsWithoutEmail: false } }));
    mount();
    expect(filter(/^Renewals due within 60 days/)).toBeDefined();
  });

  it('a flat list over fifty rows says how many are showing', () => {
    const many: RosterUnit[] = Array.from({ length: 60 }, (_, i) => ({
      id: i + 1, unitNumber: String(100 + i), building: null, floor: 1, rentAmount: null,
    }));
    rosterMock.mockReturnValue(data({ units: many, leases: [lease(1, 1)] }));
    mount();
    fireEvent.click(within(screen.getByRole('group', { name: 'Sort' })).getByRole('button', { name: 'Lease end' }));
    expect(screen.getByText('Showing 50 of 60 units')).toBeVisible();
    expect(openButtons()).toHaveLength(50);
    fireEvent.click(screen.getByRole('button', { name: 'Show 10 more of 10' }));
    expect(screen.getByText('60 units')).toBeVisible();
    expect(openButtons()).toHaveLength(60);
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
    expect(screen.getByRole('heading', { level: 2, name: 'Past leases' })).toBeVisible();
    // The whole row is the button: its name carries the outcome line too.
    const row = screen.getByRole('button', { name: /Unit 202.*Dee Eng.*Ended Jun 30, 2026/ });
    expect(screen.getByText(/Ended.*Jun 30, 2026/)).toBeVisible();
    fireEvent.click(row);
    expect(screen.getByTestId('unit-panel').textContent).toBe('202');
    fireEvent.click(screen.getByRole('button', { name: 'Back to all units' }));
    expect(openButtons()).toHaveLength(4);
  });

  it('opening a row shows the unit panel', () => {
    mount();
    expect(screen.getByText('Ana Beltrán').getAttribute('title')).toBe('Ana Beltrán');
    fireEvent.click(screen.getByRole('button', { name: 'Open Unit 101' }));
    expect(screen.getByTestId('unit-panel').textContent).toBe('101');
  });

  it('shows occupancy at a glance', () => {
    const { container } = mount();
    const glance = container.querySelector<HTMLElement>('[data-source="useLeaseRosterData"]')!;
    expect(within(glance).getByText('75.0%')).toBeVisible();
    expect(within(glance).getByText('3 of 4 units')).toBeVisible();
    // The strip above the table stays short: a headline and one line.
    expect(glance.querySelectorAll('dt')).toHaveLength(1);
  });

  it('needs attention appears only when a lease is past its end date', () => {
    const first = mount();
    expect(screen.queryByRole('heading', { name: 'Needs attention' })).toBeNull();
    first.unmount();
    rosterMock.mockReturnValue(data({ leases: [lease(1, 1), lease(2, 2, { endDate: '2026-09-15' })] }));
    mount();
    expect(screen.getByRole('heading', { name: 'Needs attention' })).toBeVisible();
    expect(screen.getByText(/1 lease has run past the end date/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Show renewals due' }));
    expect(openButtons()).toEqual(['Open Unit 102']);
  });

  it('the search field is wide enough for its placeholder', () => {
    mount();
    expect(screen.getByRole('searchbox').className).toContain('md:w-80');
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
    // The expiry-alerts control stays reachable, as it always was.
    expect(screen.getByTestId('alert-windows')).toBeVisible();
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
    expect(screen.getByTestId('alert-windows')).toBeVisible();
  });

  it('only the root manager can edit the expiry alert windows', () => {
    const first = mount(false);
    expect(screen.getByTestId('alert-windows').getAttribute('data-can-edit')).toBe('false');
    first.unmount();
    mount(true);
    expect(screen.getByTestId('alert-windows').getAttribute('data-can-edit')).toBe('true');
  });

  // Covers this page's own markup and the real RosterTable. UnitPanel, the
  // dialogs and AlertWindowsMenu are mocked above, so this says nothing about them.
  // Probe (2026-11-24): the footer's aria-live="polite" changed to "loud" turns
  // this case red (aria-valid-attr-value) and no other.
  it('has no axe violations', async () => {
    const { container } = mount();
    expect(await axe(container)).toHaveNoViolations();
  });
});
