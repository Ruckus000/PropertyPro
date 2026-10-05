import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { buildRoster, type RosterLease, type RosterOffer } from '@/lib/leases/roster-model';
import { UnitPanel } from '../UnitPanel';

vi.mock('next/link', () => ({ default: ({ children, ...p }: { children: React.ReactNode }) => <a {...p}>{children}</a> }));

const TODAY = '2026-09-28';
const unit = { id: 1, unitNumber: '101', building: null, floor: 1, rentAmount: '1500.00' };
const directory = { users: new Map([['u1', { name: 'Ana Beltrán', email: 'ana@x.test' }]]) };
const base = (extra: Partial<RosterLease>): RosterLease => ({
  id: 1, unitId: 1, status: 'active', startDate: '2026-01-01', endDate: '2027-06-30', previousLeaseId: null,
  moveOutOn: null, endVia: null, residentId: 'u1', rentAmount: '1500.00', notes: null, version: 2, ...extra,
});

function panel(leases: RosterLease[], offers: RosterOffer[] = []) {
  const [model] = buildRoster({ units: [unit], leases, offers, directory, today: TODAY, alertWindows: [30, 60, 90] });
  const onDialog = vi.fn();
  const onQuickAction = vi.fn();
  render(<UnitPanel model={model!} communityId={3} today={TODAY} directory={directory} onClose={() => {}} onDialog={onDialog} onQuickAction={onQuickAction} />);
  return { onDialog, onQuickAction };
}
const buttons = () => screen.getAllByRole('button').map((b) => b.textContent);

describe('UnitPanel actions — every state has a way forward', () => {
  it('holdover: convert or record a move-out; never an offer (its term would start in the past)', () => {
    const { onQuickAction } = panel([base({ endDate: '2026-09-15' })]);
    expect(buttons()).toEqual(expect.arrayContaining(['Convert to month-to-month', 'Record move-out']));
    expect(buttons()).not.toContain('Send offer');
    fireEvent.click(screen.getByRole('button', { name: 'Convert to month-to-month' }));
    expect(onQuickAction).toHaveBeenCalledWith(expect.objectContaining({ kind: 'convert-m2m' }));
  });

  it('month-to-month: can be offered a fixed term', () => {
    const { onDialog } = panel([base({ endDate: null })]);
    fireEvent.click(screen.getByRole('button', { name: 'Offer a fixed term' }));
    expect(onDialog).toHaveBeenCalledWith({ kind: 'offer', unitId: 1 });
  });

  it('moving out: the move-out can be cancelled after the toast is gone', () => {
    const { onQuickAction } = panel([base({ moveOutOn: '2027-06-30', endVia: 'notice' })]);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel move-out' }));
    expect(onQuickAction).toHaveBeenCalledWith(expect.objectContaining({ kind: 'cancel-move-out' }));
  });

  it('ending early says Cancel early end', () => {
    panel([base({ moveOutOn: '2026-10-31', endVia: 'early' })]);
    expect(buttons()).toContain('Cancel early end');
  });

  it('an accepted offer can still be changed before it is signed', () => {
    const offer: RosterOffer = { id: 9, leaseId: 1, stage: 'accepted', offerRent: '1600.00', termMonths: 12, customEndDate: null, startDate: '2026-12-01', depositAmount: null, sentOn: '2026-09-01', expiresOn: '2026-11-15', respondedOn: '2026-09-10', renewalLeaseId: null };
    const { onDialog } = panel([base({ endDate: '2026-11-30' })], [offer]);
    expect(buttons()).toContain('Record renewal');
    fireEvent.click(screen.getByRole('button', { name: 'Change response' }));
    expect(onDialog).toHaveBeenCalledWith({ kind: 'offer-response', unitId: 1 });
  });

  it('a renewal shows the deposit carried from the lease it renews', () => {
    panel([
      base({ id: 1, status: 'active', startDate: '2025-01-01', endDate: '2025-12-31', deposits: [{ id: 5, amount: '1500.00', heldMethod: 'surety_bond', depository: null, receivedOn: '2025-01-01', noticeSentOn: '2025-01-10', disposition: null, dispositionOn: null, claimedAmount: null }] }),
      base({ id: 2, startDate: '2026-01-01', endDate: '2026-12-31', previousLeaseId: 1 }),
    ]);
    expect(screen.queryByText('Deposit not recorded.')).toBeNull();
    expect(screen.getByText('Surety bond')).toBeDefined();
  });

  it('past leases have a Deposit button for refunds and claims after move-out', () => {
    const { onDialog } = panel([base({ id: 7, status: 'expired', startDate: '2025-01-01', endDate: '2025-12-31' })]);
    fireEvent.click(screen.getByRole('button', { name: 'Deposit' }));
    expect(onDialog).toHaveBeenCalledWith({ kind: 'deposit', unitId: 1, leaseId: 7 });
  });
});
