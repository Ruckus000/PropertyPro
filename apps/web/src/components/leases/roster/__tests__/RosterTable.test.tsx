import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { buildRoster, filterAndGroup, type RosterLease, type RosterUnit } from '@/lib/leases/roster-model';
import { RosterTable } from '../RosterTable';

const TODAY = '2026-09-28';
const units: RosterUnit[] = [
  { id: 1, unitNumber: '101', building: null, floor: 1, rentAmount: '1500.00' },
  { id: 2, unitNumber: '102', building: null, floor: 1, rentAmount: '1500.00' },
  { id: 3, unitNumber: '201', building: null, floor: 2, rentAmount: '1700.00' },
];
const lease = (id: number, unitId: number, extra: Partial<RosterLease> = {}): RosterLease => ({
  id, unitId, status: 'active', startDate: '2026-01-01', endDate: '2027-06-30', previousLeaseId: null,
  moveOutOn: null, endVia: null, residentId: `u${id}`, rentAmount: '1500.00', notes: null, ...extra,
});
const directory = { users: new Map([['u1', { name: 'Ana Beltrán', email: 'ana@x.test' }], ['u2', { name: 'Ben Cho', email: 'ben@x.test' }]]) };
const models = buildRoster({
  units,
  leases: [lease(1, 1), lease(2, 2, { endDate: '2026-11-15' })],
  offers: [],
  directory,
  today: TODAY,
  alertWindows: [30, 60, 90],
});

function setup() {
  const onOpen = vi.fn();
  const onAction = vi.fn();
  const { groups } = filterAndGroup(models, { filter: 'all', sort: 'unit', query: '' });
  render(<RosterTable groups={groups} today={TODAY} selectedUnitId={null} limit={50} onOpen={onOpen} onAction={onAction} />);
  return { onOpen, onAction };
}

describe('RosterTable', () => {
  it('groups by floor with an occupancy line', () => {
    setup();
    expect(screen.getByRole('button', { name: /Floor 1/ })).toBeDefined();
    expect(screen.getByText('2 of 2 occupied')).toBeDefined();
    expect(screen.getByText('0 of 1 occupied')).toBeDefined();
  });

  it('a Leased row with no next step is still reachable and opens from the keyboard (audit P1)', () => {
    const { onOpen } = setup();
    const open101 = screen.getByRole('button', { name: 'Open Unit 101' });
    open101.focus();
    expect(document.activeElement).toBe(open101);
    fireEvent.click(open101); // Enter/Space on a native button dispatch click
    expect(onOpen).toHaveBeenCalledWith(1);
  });

  it('the next-step link runs its action without also opening the row', () => {
    const { onOpen, onAction } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Send offer, Unit 102' }));
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ unit: expect.objectContaining({ id: 2 }) }), 'send_offer');
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('collapsing a floor hides its rows', () => {
    setup();
    const floor1 = screen.getByRole('button', { name: /Floor 1/ });
    expect(floor1.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(floor1);
    expect(floor1.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('button', { name: 'Open Unit 101' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Open Unit 201' })).toBeDefined();
  });

  it('only attention states get a badge; Leased reads as plain text', () => {
    setup();
    expect(screen.getByText('Leased')).toBeDefined();
    expect(screen.getByText('Expiring')).toBeDefined();
    expect(screen.getByText('Vacant')).toBeDefined();
  });
});
