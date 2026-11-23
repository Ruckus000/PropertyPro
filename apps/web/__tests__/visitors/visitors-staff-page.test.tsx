import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';

const { useVisitorsMock, searchParamsRef, checkinMutate, fetchMatches, mutation } = vi.hoisted(() => ({
  mutation: () => ({ mutateAsync: () => Promise.resolve(), isPending: false }),
  useVisitorsMock: vi.fn(),
  searchParamsRef: { current: new URLSearchParams() },
  checkinMutate: vi.fn(),
  fetchMatches: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsRef.current,
  usePathname: () => '/dashboard/visitors',
}));

vi.mock('@/hooks/use-visitors', () => ({
  useVisitors: useVisitorsMock,
  useCheckinVisitor: () => ({ mutateAsync: checkinMutate, isPending: false }),
  useCheckoutVisitor: mutation,
  useRevokeVisitor: mutation,
  useCreateVisitor: mutation,
}));
vi.mock('@/hooks/use-denied-visitors', () => ({
  useDeniedVisitors: () => ({
    data: [
      {
        id: 1,
        fullName: 'Chris Vaughn',
        reason: 'Trespass notice',
        vehiclePlate: null,
        deniedByUserId: 'user-1',
        createdAt: '2026-03-01T00:00:00.000Z',
        isActive: true,
      },
    ],
    isLoading: false,
  }),
  useUpdateDeniedVisitor: mutation,
  useDeleteDeniedVisitor: mutation,
  useCreateDeniedVisitor: mutation,
  fetchDeniedMatches: fetchMatches,
}));

import { VisitorsStaffPage } from '@/components/visitors/visitors-staff-page';
import type { VisitorListItem } from '@/hooks/use-visitors';

function visitor(id: number, over: Partial<VisitorListItem> = {}): VisitorListItem {
  return {
    id,
    communityId: 1,
    visitorName: `Guest ${id}`,
    purpose: 'Dinner',
    hostUnitId: id,
    hostUnitLabel: `${id}A`,
    hostUserId: null,
    expectedArrival: new Date().toISOString(),
    checkedInAt: null,
    checkedOutAt: null,
    passCode: 'AB12',
    staffUserId: null,
    notes: null,
    guestType: 'one_time',
    validFrom: null,
    validUntil: null,
    recurrenceRule: null,
    expectedDurationMinutes: 60,
    vehicleMake: null,
    vehicleModel: null,
    vehicleColor: null,
    vehiclePlate: null,
    revokedByUserId: null,
    revokedAt: null,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    ...over,
  };
}

const refetch = vi.fn();
function result(over: Record<string, unknown>) {
  return { data: undefined, isLoading: false, isError: false, error: null, refetch, ...over };
}
const ABOUT = 'Managers can add and change these.' as never;
const mount = () => render(<VisitorsStaffPage communityId={1} about={ABOUT} />);

/** Revoke sits in the row's "More actions" menu. */
async function openRevoke(user: ReturnType<typeof userEvent.setup>, name = 'Guest 1') {
  await user.click(screen.getByRole('button', { name: `More actions for ${name}` }));
  await user.click(await screen.findByRole('menuitem', { name: 'Revoke pass' }));
}

describe('VisitorsStaffPage', () => {
  let replaceState: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    searchParamsRef.current = new URLSearchParams('communityId=1');
    useVisitorsMock.mockReset();
    useVisitorsMock.mockReturnValue(result({ data: [visitor(1), visitor(2)] }));
    checkinMutate.mockReset();
    checkinMutate.mockResolvedValue(undefined);
    fetchMatches.mockReset();
    fetchMatches.mockResolvedValue([]);
    replaceState = vi.spyOn(window.history, 'replaceState');
  });
  afterEach(() => replaceState.mockRestore());

  it('shows the title, two tabs and the Register Visitor primary', () => {
    mount();
    expect(screen.getByRole('heading', { level: 1, name: 'Visitors' })).toBeVisible();
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Register Visitor' })).toHaveLength(1);
    expect(screen.getByText('Guest 1')).toBeVisible();
  });

  it('marks the selected tab in ink, never in the interactive colour', () => {
    mount();
    const selected = screen.getAllByRole('tab').filter((t) => t.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveTextContent('Visitors');
    expect(selected[0]!.className).not.toContain('interactive');
    expect(selected[0]!.className).toContain('border-content');
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

  it('draws the tabs as a plain left-aligned row, not a centred pill bar', () => {
    mount();
    const list = screen.getByRole('tablist');
    expect(list).toHaveClass('justify-start', 'bg-transparent', 'border-b');
    expect(list.className).not.toContain('bg-surface-muted');
    expect(list.className).not.toContain('justify-center');
    expect(list.className).not.toContain('rounded-lg');
    const selected = screen.getByRole('tab', { name: 'Visitors' });
    expect(selected).toHaveAttribute('aria-selected', 'true');
    expect(selected.className).not.toContain('interactive');
    expect(selected.className).not.toContain('bg-surface-card');
    expect(selected.className.split(/\s+/)).not.toContain('data-[state=active]:shadow');
    expect(selected).toHaveClass('min-h-11');
  });

  it('starts on the denied list for ?tab=denied and shows its own add action', () => {
    searchParamsRef.current = new URLSearchParams('communityId=1&tab=denied');
    mount();
    expect(screen.getByText('Chris Vaughn')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add to Denied List' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Register Visitor' })).toBeNull();
  });

  it('falls back to the visitors tab for an unknown ?tab value', () => {
    searchParamsRef.current = new URLSearchParams('communityId=1&tab=x');
    mount();
    expect(screen.getByRole('tab', { name: 'Visitors' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Guest 1')).toBeVisible();
  });

  it('draws the denied tab bare, so its own table is not boxed twice', async () => {
    const user = userEvent.setup();
    const { container } = mount();
    expect(container.querySelector('[data-testid="visitors-section"]')!.className).toContain('border');
    await user.click(screen.getByRole('tab', { name: 'Denied list' }));
    const denied = container.querySelector('[data-testid="denied-section"]')!;
    expect(denied.className.split(/\s+/)).not.toContain('border');
  });

  it('stacks the filters below md and lets the guest-type select fill the row', () => {
    const { container } = mount();
    const group = container.querySelector('[data-filters] > div')!;
    expect(group.className).toContain('flex-col');
    expect(group.className).toContain('md:flex-row');
    expect(screen.getByRole('combobox').className).toContain('w-full');
    expect(screen.getByRole('combobox').className).toContain('md:w-44');
  });

  it('draws Expired with a different mark from Expected', async () => {
    const user = userEvent.setup();
    useVisitorsMock.mockReturnValue(
      result({
        data: [
          visitor(1),
          visitor(2, { expectedArrival: new Date(Date.now() - 3 * 86400000).toISOString(), validUntil: new Date(Date.now() - 86400000).toISOString() }),
        ],
      }),
    );
    const { container } = mount();
    await user.click(screen.getByRole('button', { name: 'All' }));
    const mark = (word: string) => {
      const label = Array.from(container.querySelectorAll('tbody td span')).find(
        (c) => c.textContent?.trim() === word && c.querySelector('svg'),
      );
      return label?.querySelector('svg')?.outerHTML;
    };
    expect(mark('Expected')).toBeDefined();
    expect(mark('Expired')).toBeDefined();
    expect(mark('Expired')).not.toEqual(mark('Expected'));
  });

  it('records the tab in the URL without navigating, keeping other params', async () => {
    const user = userEvent.setup();
    searchParamsRef.current = new URLSearchParams('communityId=1&tab=denied');
    mount();
    await user.click(screen.getByRole('tab', { name: 'Visitors' }));
    const url = String(replaceState.mock.calls.at(-1)?.[2]);
    expect(url).toContain('tab=visitors');
    expect(url).toContain('communityId=1');
  });

  it('opens the registration form from the primary', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: 'Register Visitor' }));
    expect(await screen.findByRole('dialog')).toBeVisible();
  });

  it('shows five columns: visitor, host, status, passcode and the actions', () => {
    mount();
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Visitor',
      'Host',
      'Status',
      'Passcode',
      'Actions',
    ]);
  });

  it('puts guest type, purpose and the vehicle under the name', () => {
    useVisitorsMock.mockReturnValue(
      result({
        data: [
          visitor(1, {
            guestType: 'vendor',
            purpose: 'AC repair',
            vehicleColor: 'White',
            vehicleMake: 'Ford',
            vehicleModel: 'Transit',
            vehiclePlate: 'HVAC118',
          }),
          visitor(2),
        ],
      }),
    );
    mount();
    const first = screen.getByText('Guest 1').closest('td')!;
    expect(first).toHaveTextContent('Vendor · AC repair');
    expect(first).toHaveTextContent('White Ford Transit · HVAC118');
    // No vehicle on the pass: no third line and no placeholder dash.
    const second = screen.getByText('Guest 2').closest('td')!;
    expect(second.textContent).toBe('Guest 2One-Time · Dinner');
  });

  it('keeps the passcode and its QR button on the row', () => {
    mount();
    const cell = screen.getAllByText('AB12')[0]!.closest('td')!;
    expect(within(cell).getByRole('button', { name: 'Open QR code' })).toBeVisible();
  });

  it('puts the time that matters under the status', () => {
    const at = new Date();
    at.setHours(9, 5, 0, 0);
    useVisitorsMock.mockReturnValue(
      result({ data: [visitor(1, { checkedInAt: at.toISOString(), expectedDurationMinutes: 90 })] }),
    );
    mount();
    const cell = screen.getByText('Checked In', { selector: 'tbody *' }).closest('td')!;
    expect(cell).toHaveTextContent('Since 9:05 AM · 1h 30m stay');
  });

  it('offers no Revoke where the pass is already over', async () => {
    const user = userEvent.setup();
    const past = new Date(Date.now() - 3_600_000).toISOString();
    useVisitorsMock.mockReturnValue(
      result({ data: [visitor(1, { checkedInAt: past, checkedOutAt: past }), visitor(2)] }),
    );
    mount();
    await user.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.queryByRole('button', { name: 'More actions for Guest 1' })).toBeNull();
    expect(screen.getByRole('button', { name: 'More actions for Guest 2' })).toBeVisible();
  });

  it('checks a visitor in', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getAllByRole('button', { name: 'Check In' })[0]!);
    await vi.waitFor(() => expect(checkinMutate).toHaveBeenCalledWith(1));
  });

  it('warns before checking in a visitor who matches the denied list', async () => {
    const user = userEvent.setup();
    fetchMatches.mockResolvedValue([{ id: 9, fullName: 'Guest 1', reason: 'x', vehiclePlate: null, isActive: true }]);
    mount();
    await user.click(screen.getAllByRole('button', { name: 'Check In' })[0]!);
    expect(await screen.findByRole('dialog')).toHaveTextContent('Denied-list match found');
    expect(checkinMutate).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Check In Anyway' }));
    await vi.waitFor(() => expect(checkinMutate).toHaveBeenCalledWith(1));
  });

  it('asks for a reason before revoking', async () => {
    const user = userEvent.setup();
    mount();
    await openRevoke(user);
    expect(await screen.findByRole('dialog')).toHaveTextContent('Revoke Visitor Pass');
  });

  it('keeps Revoke Pass disabled until a reason is typed', async () => {
    const user = userEvent.setup();
    mount();
    await openRevoke(user);
    const dialog = await screen.findByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Revoke Pass' });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByPlaceholderText('Required reason'), 'Left a door open');
    expect(confirm).toBeEnabled();
  });

  it('keeps the guest-type filter and the quick filters', async () => {
    const user = userEvent.setup();
    mount();
    expect(screen.getByRole('combobox')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Checked In' }));
    expect(screen.getByText('No visitors found.')).toBeVisible();
  });

  it('shows status as a glyph and its word, with no interactive colour', () => {
    const { container } = mount();
    const cell = Array.from(container.querySelectorAll('tbody td')).find(
      (td) => td.textContent?.includes('Expected') && td.querySelector('svg'),
    ) as HTMLElement;
    expect(cell).toBeDefined();
    for (const el of [cell, ...Array.from(cell.querySelectorAll('*'))]) {
      const cls = el.getAttribute('class') ?? '';
      expect(cls).not.toContain('content-link');
      expect(cls).not.toContain('interactive');
    }
  });

  it('pins the action buttons to the right edge, so a wide table never hides them', () => {
    mount();
    const cell = screen.getAllByRole('button', { name: 'Check In' })[0]!.closest('td')!;
    expect(cell.className.split(/\s+/)).toEqual(expect.arrayContaining(['sticky', 'right-0']));
    // The other columns scroll: only the action column is pinned.
    const row = cell.closest('tr')!;
    expect(row.querySelectorAll('td.sticky')).toHaveLength(1);
    expect(screen.getByRole('columnheader', { name: 'Actions' }).className).toContain('sticky');
  });

  it('says so when the list cannot load, with a retry', async () => {
    const user = userEvent.setup();
    useVisitorsMock.mockReturnValue(result({ data: undefined, isError: true }));
    mount();
    expect(screen.getByRole('alert')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('states no figure it does not compute and has no Needs attention position', () => {
    const { container } = mount();
    expect(screen.queryByRole('heading', { name: 'Needs attention' })).toBeNull();
    expect(container.querySelector('[data-source]')).toBeNull();
    expect(within(container).getByText(/Managers can add and change these/)).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = mount();
    expect(container.querySelectorAll('tbody tr').length).toBeGreaterThan(0);
    expect(await axe(container)).toHaveNoViolations();
  });
});
