/// <reference types="@testing-library/jest-dom" />
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LeaseActions } from '@/hooks/use-lease-roster';
import { ApiRequestError } from '@/lib/api/request-json';
import { buildRoster, type RosterLease, type RosterUnit, type UnitModel } from '@/lib/leases/roster-model';
import type { RosterDialogProps } from '../../types';
import { CancelLeaseDialog } from '../CancelLeaseDialog';
import { LeaseFormDialog } from '../LeaseFormDialog';
import { MoveOutDialog } from '../MoveOutDialog';
import { TransferDialog } from '../TransferDialog';
import { RosterDialogHost } from '../index';
import { parseMoney } from '../form-kit';

// Radix Switch measures itself with ResizeObserver, which jsdom doesn't provide.
globalThis.ResizeObserver ??= class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const TODAY = '2026-09-29';

function lease(partial: Partial<RosterLease> & Pick<RosterLease, 'id' | 'unitId' | 'startDate' | 'endDate'>): RosterLease {
  return {
    status: 'active',
    previousLeaseId: null,
    moveOutOn: null,
    endVia: null,
    residentId: null,
    rentAmount: '1500.00',
    notes: null,
    version: 3,
    residents: [
      { userId: 'u-1', occupantId: null, isPrimary: true, removedOn: null, occupant: null },
    ],
    deposits: [],
    ...partial,
  };
}

const units: RosterUnit[] = [
  { id: 101, unitNumber: '101', building: null, floor: 1, rentAmount: '1400.00' },
  { id: 102, unitNumber: '102', building: null, floor: 1, rentAmount: '1500.00' },
  { id: 103, unitNumber: '103', building: null, floor: 1, rentAmount: '1500.00', offlineSince: '2026-09-01', offlineReason: 'renovation' },
  { id: 104, unitNumber: '104', building: null, floor: 1, rentAmount: '1300.00' },
  { id: 105, unitNumber: '105', building: null, floor: 1, rentAmount: '1600.00' },
  { id: 106, unitNumber: '106', building: null, floor: 1, rentAmount: '1700.00' },
];

const leases: RosterLease[] = [
  // 102: current fixed-term lease
  lease({ id: 1, unitId: 102, startDate: '2026-01-01', endDate: '2026-12-31' }),
  // 104: month-to-month
  lease({ id: 2, unitId: 104, startDate: '2025-01-01', endDate: null }),
  // 105: pre-leased (upcoming), with a deposit
  lease({
    id: 3,
    unitId: 105,
    startDate: '2026-11-01',
    endDate: '2027-10-31',
    deposits: [
      {
        id: 30,
        amount: '1600.00',
        heldMethod: 'separate_noninterest',
        depository: 'First Bank, Miami FL',
        receivedOn: '2026-09-15',
        noticeSentOn: '2026-09-16',
        disposition: null,
        dispositionOn: null,
        claimedAmount: null,
      },
    ],
  }),
  // 106: current, moving out Oct 31 — can be pre-leased
  lease({ id: 4, unitId: 106, startDate: '2026-01-01', endDate: '2026-12-31', moveOutOn: '2026-10-31', endVia: 'notice' }),
];

const directory = { users: new Map([['u-1', { name: 'Sofia Alvarez', email: 'sofia@example.com' }]]) };

const models: UnitModel[] = buildRoster({ units, leases, offers: [], directory, today: TODAY, alertWindows: [30, 60, 90] });
const byUnit = (id: number) => models.find((m) => m.unit.id === id)!;

function mutation() {
  return { mutateAsync: vi.fn().mockResolvedValue({ id: 999 }), isPending: false };
}

function makeActions() {
  return {
    createLease: mutation(),
    updateLease: mutation(),
    deleteLease: mutation(),
    sendOffer: mutation(),
    respondToOffer: mutation(),
    recordDeposit: mutation(),
    updateDeposit: mutation(),
    transfer: mutation(),
    setUnitOffline: mutation(),
    updateSettings: mutation(),
  };
}

function baseProps(actions: ReturnType<typeof makeActions>, overrides: Partial<RosterDialogProps> = {}): RosterDialogProps {
  return {
    communityId: 7,
    model: null,
    models,
    lease: null,
    today: TODAY,
    settings: { alertWindows: [30, 60, 90], allowResidentsWithoutEmail: false },
    actions: actions as unknown as LeaseActions,
    directory,
    occupants: [],
    residents: [
      { id: '11111111-1111-4111-8111-111111111111', name: 'Ana Beltrán', email: 'ana@example.com' },
      { id: '22222222-2222-4222-8222-222222222222', name: 'Marcus Lee', email: 'marcus@example.com' },
    ],
    onDone: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

function pickResident(query: string, name: RegExp) {
  const box = screen.getByRole('combobox', { name: 'Residents' });
  fireEvent.focus(box);
  fireEvent.change(box, { target: { value: query } });
  fireEvent.click(screen.getByRole('option', { name }));
}

describe('parseMoney', () => {
  it('accepts plain, comma and dollar forms and sends two decimals', () => {
    expect(parseMoney('1500').value).toBe('1500.00');
    expect(parseMoney('1,500').value).toBe('1500.00');
    expect(parseMoney('$1,500.00').value).toBe('1500.00');
    expect(parseMoney('1500.5').value).toBe('1500.50');
    expect(parseMoney('0').value).toBe('0.00');
  });
  it('rejects negatives and junk', () => {
    expect(parseMoney('-5').value).toBeNull();
    expect(parseMoney('-5').negative).toBe(true);
    expect(parseMoney('12abc').value).toBeNull();
    expect(parseMoney('1.234').value).toBeNull();
  });
});

describe('LeaseFormDialog (new)', () => {
  it('blocks submit when $0 rent has no reason, then submits once a reason is chosen', async () => {
    const actions = makeActions();
    const props = baseProps(actions, { model: byUnit(101) });
    render(<LeaseFormDialog {...props} mode="new" />);

    pickResident('ana', /Ana Beltrán/);
    fireEvent.change(screen.getByLabelText('Monthly rent'), { target: { value: '0' } });
    // Errors only appear after a submit attempt.
    expect(screen.queryByText('Choose why there is no rent.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Create lease' }));
    expect(await screen.findByText('Choose why there is no rent.')).toBeInTheDocument();
    expect(actions.createLease.mutateAsync).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Why is there no rent?'), { target: { value: 'staff' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create lease' }));
    await waitFor(() => expect(actions.createLease.mutateAsync).toHaveBeenCalledTimes(1));
    expect(actions.createLease.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ unitId: 101, rentAmount: '0.00', zeroRentReason: 'staff' }),
    );
  });

  it('blocks a start date that is not the 1st of a month', async () => {
    const actions = makeActions();
    const props = baseProps(actions, { model: byUnit(101) });
    render(<LeaseFormDialog {...props} mode="new" />);

    // Defaults to the 1st of next month.
    expect(screen.getByLabelText('Start date')).toHaveValue('2026-10-01');

    pickResident('marcus', /Marcus Lee/);
    fireEvent.change(screen.getByLabelText('Monthly rent'), { target: { value: '$1,500' } });
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-10-15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create lease' }));

    expect(await screen.findByText('Leases start on the 1st of a month.')).toBeInTheDocument();
    expect(actions.createLease.mutateAsync).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-11-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create lease' }));
    await waitFor(() => expect(actions.createLease.mutateAsync).toHaveBeenCalledTimes(1));
    const body = actions.createLease.mutateAsync.mock.calls[0]![0];
    expect(body).toMatchObject({
      unitId: 101,
      startDate: '2026-11-01',
      endDate: '2027-10-31',
      rentAmount: '1500.00',
      noticeDays: 60,
      residents: [{ userId: '22222222-2222-4222-8222-222222222222', isPrimary: true }],
    });
    expect(typeof body.idempotencyKey).toBe('string');
  });

  it('lists only units that can take a lease', () => {
    render(<LeaseFormDialog {...baseProps(makeActions(), { model: byUnit(101) })} mode="new" />);
    const labels = within(screen.getByLabelText('Unit'))
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(labels.some((l) => l?.startsWith('Unit 101'))).toBe(true);
    expect(labels.some((l) => l?.startsWith('Unit 106'))).toBe(true);
    expect(labels.some((l) => l?.startsWith('Unit 103'))).toBe(false);
  });
});

describe('LeaseFormDialog (edit)', () => {
  it('sends the version and offers Reload on a 409', async () => {
    const actions = makeActions();
    actions.updateLease.mutateAsync.mockRejectedValueOnce(
      new ApiRequestError('This lease changed since you opened it. Reload to see the latest version.', { status: 409 }),
    );
    const props = baseProps(actions, { model: byUnit(102), lease: byUnit(102).current });
    render(<LeaseFormDialog {...props} mode="edit" />);

    fireEvent.change(screen.getByLabelText('Monthly rent'), { target: { value: '1,550' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(actions.updateLease.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, version: 3, rentAmount: '1550.00' }),
      ),
    );
    expect(await screen.findByText('This lease changed since you opened it.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(props.onClose).toHaveBeenCalled();
  });
});

describe('MoveOutDialog', () => {
  it('warns about short month-to-month notice (§83.57) but still submits, with an undo', async () => {
    const actions = makeActions();
    const props = baseProps(actions, { model: byUnit(104) });
    render(<MoveOutDialog {...props} mode="notice" />);

    fireEvent.change(screen.getByLabelText('Move-out date'), { target: { value: '2026-10-10' } });
    expect(screen.getByText(/at least 30 days’ written notice/)).toBeInTheDocument();
    expect(screen.getByText(/§83\.57/, { selector: 'div' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Record move-out' }));
    await waitFor(() => expect(actions.updateLease.mutateAsync).toHaveBeenCalledTimes(1));
    expect(actions.updateLease.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 2,
        version: 3,
        moveOutOn: '2026-10-10',
        endVia: 'notice',
        noticeReceivedOn: TODAY,
      }),
    );

    await waitFor(() => expect(props.onDone).toHaveBeenCalled());
    const undo = (props.onDone as ReturnType<typeof vi.fn>).mock.calls[0]![1] as () => Promise<unknown>;
    await undo();
    expect(actions.updateLease.mutateAsync).toHaveBeenLastCalledWith({ id: 2, moveOutOn: null });
  });

  it('requires a reason to end early', async () => {
    const actions = makeActions();
    render(<MoveOutDialog {...baseProps(actions, { model: byUnit(102) })} mode="early" />);
    fireEvent.change(screen.getByLabelText('Last day'), { target: { value: '2026-11-15' } });
    fireEvent.click(screen.getByRole('button', { name: 'End lease early' }));
    expect(await screen.findByText('Choose a reason. It is saved with the lease record.')).toBeInTheDocument();
    expect(actions.updateLease.mutateAsync).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('Buyout'));
    fireEvent.click(screen.getByRole('button', { name: 'End lease early' }));
    await waitFor(() =>
      expect(actions.updateLease.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, moveOutOn: '2026-11-15', endVia: 'early', endReason: 'Buyout' }),
      ),
    );
  });
});

describe('CancelLeaseDialog', () => {
  const upcoming = () => byUnit(105).next;

  it('routes "Entered by mistake" to deleteLease', async () => {
    const actions = makeActions();
    render(<CancelLeaseDialog {...baseProps(actions, { model: byUnit(105), lease: upcoming() })} />);
    fireEvent.click(screen.getByLabelText('Entered by mistake'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete lease' }));
    await waitFor(() => expect(actions.deleteLease.mutateAsync).toHaveBeenCalledWith({ id: '3' }));
    expect(actions.updateLease.mutateAsync).not.toHaveBeenCalled();
  });

  it('routes other reasons to updateLease with status cancelled', async () => {
    const actions = makeActions();
    render(<CancelLeaseDialog {...baseProps(actions, { model: byUnit(105), lease: upcoming() })} />);
    // A deposit was collected: the §83.49 refund deadline is 15 days from today.
    expect(screen.getByText(/Refund it in full by Oct 14, 2026/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Failed screening'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel lease' }));
    await waitFor(() =>
      expect(actions.updateLease.mutateAsync).toHaveBeenCalledWith({
        id: 3,
        version: 3,
        status: 'cancelled',
        cancelledReason: 'Failed screening',
      }),
    );
    expect(actions.deleteLease.mutateAsync).not.toHaveBeenCalled();
  });

  it('shows the server message and the unpaid count on a 409 (D9)', async () => {
    const actions = makeActions();
    actions.updateLease.mutateAsync.mockRejectedValueOnce(
      new ApiRequestError('This lease has 2 unpaid rent charges. Settle or waive them before you cancel this lease.', {
        status: 409,
        details: { unpaidObligations: [{ id: 1 }, { id: 2 }] },
      }),
    );
    render(<CancelLeaseDialog {...baseProps(actions, { model: byUnit(105), lease: upcoming() })} />);
    fireEvent.click(screen.getByLabelText('Unit not ready'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel lease' }));
    expect(
      await screen.findByText('This lease has 2 unpaid rent charges. Settle or waive them before you cancel this lease.'),
    ).toBeInTheDocument();
    expect(screen.getByText('2 unpaid rent charges are open on this lease.')).toBeInTheDocument();
  });
});

describe('TransferDialog', () => {
  it('lists only units that can be leased, excluding the current one', () => {
    render(<TransferDialog {...baseProps(makeActions(), { model: byUnit(102) })} />);
    const labels = within(screen.getByLabelText('New unit'))
      .getAllByRole('option')
      .map((o) => o.textContent ?? '');
    expect(labels.map((l) => l.split(' · ')[0])).toEqual(['Unit 101', 'Unit 106']);
  });

  it('defaults the new start to the 1st after the last day and sends the transfer', async () => {
    const actions = makeActions();
    render(<TransferDialog {...baseProps(actions, { model: byUnit(102) })} />);
    fireEvent.change(screen.getByLabelText('New unit'), { target: { value: '106' } });
    // 106 is occupied through Oct 31, so the earliest start is Nov 1.
    expect(screen.getByLabelText('New lease starts')).toHaveValue('2026-11-01');
    fireEvent.click(screen.getByRole('button', { name: 'Record transfer' }));
    await waitFor(() =>
      expect(actions.transfer.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          fromLeaseId: 1,
          toUnitId: 106,
          moveOutOn: '2026-09-30',
          startDate: '2026-11-01',
          rentAmount: '1700.00',
          carryDeposit: false,
        }),
      ),
    );
  });
});

describe('RosterDialogHost', () => {
  it('resolves the lease by id and renders the matching dialog', () => {
    const actions = makeActions();
    const { dialog: _d, model: _m, lease: _l, ...rest } = { dialog: null, ...baseProps(actions) };
    render(<RosterDialogHost {...rest} dialog={{ kind: 'cancel-lease', unitId: 105, leaseId: 3 }} />);
    expect(screen.getByRole('heading', { name: 'Cancel upcoming lease · Unit 105' })).toBeInTheDocument();
  });

  it('renders nothing without a dialog', () => {
    const { model: _m, lease: _l, ...rest } = baseProps(makeActions());
    const { container } = render(<RosterDialogHost {...rest} dialog={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
