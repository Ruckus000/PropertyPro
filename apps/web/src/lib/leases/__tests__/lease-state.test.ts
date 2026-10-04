import { describe, expect, it } from 'vitest';
import {
  deriveUnitState,
  depositDispositionDeadlines,
  depositNoticeDue,
  depositNoticeLate,
  leasePhase,
  monthToMonthNoticeShort,
  nonRenewalNoticeDeadline,
  occupancyFromLeases,
  termEndDate,
  termMonthsFor,
  type LeaseStateInput,
} from '../lease-state';

const TODAY = '2026-09-28';
const ONLINE = { offlineSince: null };

function lease(overrides: Partial<LeaseStateInput> & { id: number }): LeaseStateInput {
  return {
    unitId: 1,
    status: 'active',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    previousLeaseId: null,
    moveOutOn: null,
    endVia: null,
    ...overrides,
  };
}

describe('termEndDate', () => {
  it('ends the day before the same date n months later', () => {
    expect(termEndDate('2026-01-01', 12)).toBe('2026-12-31');
    expect(termEndDate('2026-03-15', 6)).toBe('2026-09-14');
  });

  it('clamps to month end when the target day does not exist (Aug 31 + 6 → Feb 28, not Mar 2)', () => {
    expect(termEndDate('2026-08-31', 6)).toBe('2027-02-28');
    expect(termEndDate('2027-08-31', 6)).toBe('2028-02-29');
  });

  it('round-trips through termMonthsFor and reports custom ends as null', () => {
    expect(termMonthsFor('2026-01-01', '2026-12-31')).toBe(12);
    expect(termMonthsFor('2026-01-01', '2026-12-15')).toBeNull();
    expect(termMonthsFor('2026-01-01', null)).toBeNull();
  });
});

describe('leasePhase', () => {
  it('a lease starting in the future is upcoming, not current (audit P0-3)', () => {
    const l = lease({ id: 1, startDate: '2026-10-01', endDate: '2027-09-30' });
    expect(leasePhase(l, [l], TODAY)).toBe('upcoming');
  });

  it('an early end scheduled for later stays current until the move-out day (audit P0-1)', () => {
    const l = lease({ id: 1, moveOutOn: '2026-10-31', endVia: 'early' });
    expect(leasePhase(l, [l], TODAY)).toBe('current');
    expect(leasePhase(l, [l], '2026-10-31')).toBe('current');
    expect(leasePhase(l, [l], '2026-11-01')).toBe('ended');
  });

  it('a signed renewal does not replace the current lease before its start date (audit P0-2)', () => {
    const cur = lease({ id: 1, endDate: '2026-12-31' });
    const renewal = lease({ id: 2, startDate: '2027-01-01', endDate: '2027-12-31', previousLeaseId: 1 });
    const all = [cur, renewal];
    expect(leasePhase(cur, all, TODAY)).toBe('current');
    expect(leasePhase(renewal, all, TODAY)).toBe('upcoming');
    expect(leasePhase(cur, all, '2027-01-01')).toBe('ended');
    expect(leasePhase(renewal, all, '2027-01-01')).toBe('current');
  });

  it('cancelled and closed statuses are not current', () => {
    expect(leasePhase(lease({ id: 1, status: 'cancelled' }), [], TODAY)).toBe('cancelled');
    expect(leasePhase(lease({ id: 1, status: 'terminated' }), [], TODAY)).toBe('ended');
  });
});

describe('deriveUnitState', () => {
  it('vacant with no leases; offline when taken out of service', () => {
    expect(deriveUnitState(1, [], ONLINE, TODAY, 90).kind).toBe('vacant');
    const off = deriveUnitState(1, [], { offlineSince: '2026-09-01' }, TODAY, 90);
    expect(off.kind).toBe('offline');
    expect(off.canLease).toBe(false);
  });

  it('pre-leased: no current lease, an upcoming one — not occupied', () => {
    const s = deriveUnitState(1, [lease({ id: 1, startDate: '2026-10-01', endDate: '2027-09-30' })], ONLINE, TODAY, 90);
    expect(s.kind).toBe('vacant');
    expect(s.preLeased).toBe(true);
    expect(s.current).toBeNull();
    expect(s.canLease).toBe(false);
  });

  it('classifies by the widest alert window', () => {
    expect(deriveUnitState(1, [lease({ id: 1, endDate: '2027-06-30' })], ONLINE, TODAY, 90).kind).toBe('leased');
    const exp = deriveUnitState(1, [lease({ id: 1, endDate: '2026-11-15' })], ONLINE, TODAY, 90);
    expect(exp.kind).toBe('expiring');
    expect(exp.daysUntil).toBe(48);
    expect(exp.tier).toBe('calm');
  });

  it('holdover: past the end date with no renewal', () => {
    const s = deriveUnitState(1, [lease({ id: 1, endDate: '2026-09-20' })], ONLINE, TODAY, 90);
    expect(s.kind).toBe('holdover');
    expect(s.tier).toBe('critical');
  });

  it('month-to-month when there is no end date', () => {
    expect(deriveUnitState(1, [lease({ id: 1, endDate: null })], ONLINE, TODAY, 90).kind).toBe('month_to_month');
  });

  it('ending early keeps the unit occupied and allows pre-leasing from the day after', () => {
    const s = deriveUnitState(
      1,
      [lease({ id: 1, moveOutOn: '2026-10-15', endVia: 'early' })],
      ONLINE,
      TODAY,
      90,
    );
    expect(s.kind).toBe('ending');
    expect(s.current?.id).toBe(1);
    expect(s.movingOut).toBe(true);
    expect(s.canLease).toBe(true);
    expect(s.availableFrom).toBe('2026-10-16');
  });

  it('a signed renewal shows the unit leased and blocks another pre-lease', () => {
    const s = deriveUnitState(
      1,
      [
        lease({ id: 1, endDate: '2026-10-31' }),
        lease({ id: 2, startDate: '2026-11-01', endDate: '2027-10-31', previousLeaseId: 1 }),
      ],
      ONLINE,
      TODAY,
      90,
    );
    expect(s.kind).toBe('leased');
    expect(s.renewalSigned).toBe(true);
    expect(s.canLease).toBe(false);
  });

  it('vacant since the day after the last real lease; a cancelled pre-lease does not count', () => {
    const s = deriveUnitState(
      1,
      [
        lease({ id: 1, status: 'expired', startDate: '2025-06-01', endDate: '2026-05-31' }),
        lease({ id: 2, status: 'cancelled', startDate: '2026-07-01', endDate: '2027-06-30' }),
      ],
      ONLINE,
      TODAY,
      90,
    );
    expect(s.kind).toBe('vacant');
    expect(s.vacantSince).toBe('2026-06-01');
    expect(s.availableFrom).toBe('2026-06-01');
  });
});

describe('Florida notice dates', () => {
  it('§83.575 notice deadline is end date minus notice days', () => {
    expect(nonRenewalNoticeDeadline('2026-12-31', 60)).toBe('2026-11-01');
    expect(nonRenewalNoticeDeadline(null, 60)).toBeNull();
    expect(nonRenewalNoticeDeadline('2026-12-31', null)).toBeNull();
  });

  it('§83.49(2) deposit notice is due 30 days after receipt and flagged when late', () => {
    expect(depositNoticeDue('2026-09-01')).toBe('2026-10-01');
    expect(depositNoticeLate('2026-09-01', '2026-10-01')).toBe(false);
    expect(depositNoticeLate('2026-09-01', '2026-10-02')).toBe(true);
    expect(depositNoticeLate('2026-09-01', null)).toBe(false);
  });

  it('§83.49(3)(a) refund in 15 days, claim in 30', () => {
    expect(depositDispositionDeadlines('2026-10-31')).toEqual({ refundBy: '2026-11-15', claimBy: '2026-11-30' });
  });

  it('§83.57 month-to-month notice under 30 days is short', () => {
    expect(monthToMonthNoticeShort('2026-09-28', '2026-10-15')).toBe(true);
    expect(monthToMonthNoticeShort('2026-09-28', '2026-10-31')).toBe(false);
  });
});

describe('occupancyFromLeases (apartments: leases decide)', () => {
  it('a current lease → rented, including a holdover past its end date', () => {
    expect(occupancyFromLeases([lease({ id: 1 })], ONLINE, TODAY)).toBe('rented');
    expect(occupancyFromLeases([lease({ id: 1, endDate: '2026-08-31' })], ONLINE, TODAY)).toBe('rented');
  });

  it('no current lease → vacant: nothing on file, a future lease, or a move-out already past', () => {
    expect(occupancyFromLeases([], ONLINE, TODAY)).toBe('vacant');
    expect(occupancyFromLeases([lease({ id: 1, startDate: '2026-10-01' })], ONLINE, TODAY)).toBe('vacant');
    expect(occupancyFromLeases([lease({ id: 1, moveOutOn: '2026-09-15', endVia: 'notice' })], ONLINE, TODAY)).toBe('vacant');
    expect(occupancyFromLeases([lease({ id: 1, status: 'cancelled' })], ONLINE, TODAY)).toBe('vacant');
  });

  it('an offline unit with no current lease is neither (null), so it stays out of vacancy counts', () => {
    expect(occupancyFromLeases([], { offlineSince: '2026-09-01' }, TODAY)).toBeNull();
  });
});
