import { describe, expect, it } from 'vitest';
import {
  buildRoster,
  buildTiles,
  defaultStartFor,
  filterAndGroup,
  liveLeaseIds,
  matchesSearch,
  pastLeases,
  type RosterLease,
  type RosterOffer,
  type RosterUnit,
} from '../roster-model';

const TODAY = '2026-09-28';
const W = [30, 60, 90];

const unit = (id: number, floor = 1, extra: Partial<RosterUnit> = {}): RosterUnit => ({
  id, unitNumber: String(100 * floor + id), building: null, floor, rentAmount: '1500.00', ...extra,
});
const lease = (id: number, unitId: number, extra: Partial<RosterLease> = {}): RosterLease => ({
  id, unitId, status: 'active', startDate: '2026-01-01', endDate: '2027-06-30', previousLeaseId: null,
  moveOutOn: null, endVia: null, residentId: `u${id}`, rentAmount: '1500.00', notes: null, ...extra,
});
const dir = {
  users: new Map([
    ['u1', { name: 'Ana Beltrán', email: 'ana@example.test' }],
    ['u2', { name: 'Ben Cho', email: 'ben@example.test' }],
    ['u3', { name: 'Cy Dee', email: 'cy@example.test' }],
    ['u4', { name: 'Di Eve', email: 'di@example.test' }],
  ]),
};

function roster(leases: RosterLease[], units: RosterUnit[], offers: RosterOffer[] = []) {
  return buildRoster({ units, leases, offers, directory: dir, today: TODAY, alertWindows: W });
}

describe('buildRoster: stage and next step per row', () => {
  const units = [unit(1), unit(2), unit(3), unit(4), unit(5), unit(6, 2, { offlineSince: '2026-09-01', offlineReason: 'renovation' })];
  const models = roster(
    [
      lease(1, 1), // leased, far out
      lease(2, 2, { endDate: '2026-11-15' }), // expiring, no offer
      lease(3, 3, { endDate: '2026-09-20' }), // holdover
      lease(4, 4, { endDate: '2026-11-30', moveOutOn: '2026-11-30', endVia: 'notice' }), // moving out
    ],
    units,
  );
  const by = (id: number) => models.find((m) => m.unit.id === id)!;

  it('maps each unit to a status and one next step', () => {
    expect([by(1).status, by(1).action]).toEqual(['Leased', null]);
    expect([by(2).status, by(2).stage, by(2).action]).toEqual(['Expiring', 'not_started', 'send_offer']);
    expect([by(3).status, by(3).action]).toEqual(['Holdover', 'resolve_holdover']);
    expect([by(4).stage, by(4).action]).toEqual(['notice', 'pre_lease']);
    expect([by(5).status, by(5).action]).toEqual(['Vacant', 'new_lease']);
    expect([by(6).status, by(6).action]).toEqual(['Offline', null]);
  });

  it('an expired offer asks to resend; an accepted one asks to record the renewal', () => {
    const offer = (stage: RosterOffer['stage'], expiresOn: string): RosterOffer => ({
      id: 9, leaseId: 2, stage, offerRent: '1600.00', termMonths: 12, customEndDate: null, startDate: '2026-11-16',
      depositAmount: null, sentOn: '2026-09-01', expiresOn, respondedOn: null, renewalLeaseId: null,
    });
    const u = [unit(2)];
    const l = [lease(2, 2, { endDate: '2026-11-15' })];
    expect(roster(l, u, [offer('offer_sent', '2026-09-20')])[0]!.action).toBe('resend_offer');
    expect(roster(l, u, [offer('offer_sent', '2026-10-20')])[0]!.action).toBe('record_response');
    expect(roster(l, u, [offer('accepted', '2026-10-20')])[0]!.action).toBe('record_renewal');
  });
});

describe('buildTiles', () => {
  const units = [unit(1), unit(2), unit(3), unit(4, 1, { offlineSince: '2026-09-01', offlineReason: 'other' })];
  const models = roster(
    [
      lease(1, 1),
      lease(2, 2, { endDate: '2026-10-31', moveOutOn: '2026-10-31', endVia: 'notice' }),
      lease(9, 3, { status: 'expired', startDate: '2025-01-01', endDate: '2026-08-31' }),
    ],
    units,
  );
  const tiles = buildTiles(models, TODAY, W);

  it('occupancy leaves offline units out of the denominator', () => {
    expect(tiles.all).toMatchObject({ units: 4, occupied: 2, offline: 1 });
    expect(tiles.all.occupancyPct).toBeCloseTo((2 / 3) * 100);
  });

  it('the Vacant tile counts what the Vacant list shows (audit: counts disagreed)', () => {
    const { groups } = filterAndGroup(models, { filter: 'vacant', sort: 'unit', query: '' });
    const vacantGroup = groups.find((g) => g.key === 'vacant')!;
    expect(tiles.vacant.count).toBe(vacantGroup.rows.length);
    expect(tiles.vacant).toMatchObject({ empty: 1, movingOut: 1, offline: 1 });
    expect(tiles.vacant.avgDaysEmpty).toBe(27); // vacant since Sep 1 → 27 days by Sep 28
  });
});

describe('filterAndGroup', () => {
  const units = [unit(1, 1), unit(2, 1), unit(3, 2)];
  const models = roster([lease(1, 1), lease(3, 3, { endDate: '2026-10-15' })], units);

  it('groups by floor with occupancy when sorted by unit and unfiltered', () => {
    const { groups } = filterAndGroup(models, { filter: 'all', sort: 'unit', query: '' });
    expect(groups.map((g) => [g.title, g.meta])).toEqual([
      ['Floor 1', '1 of 2 occupied'],
      ['Floor 2', '1 of 1 occupied'],
    ]);
  });

  it('sorting by lease end flattens and puts the soonest first', () => {
    const { groups } = filterAndGroup(models, { filter: 'all', sort: 'end', query: '' });
    expect(groups).toHaveLength(1);
    expect(groups[0]!.rows.map((m) => m.unit.id)).toEqual([3, 1, 2]);
  });
});

describe('search', () => {
  const [m] = roster([lease(1, 1)], [unit(1)]);
  it('ignores accents and matches email and unit number', () => {
    expect(matchesSearch(m!, 'beltran')).toBe(true);
    expect(matchesSearch(m!, 'ANA@EXAMPLE')).toBe(true);
    expect(matchesSearch(m!, '101')).toBe(true);
    expect(matchesSearch(m!, 'zzz')).toBe(false);
  });
});

describe('pastLeases and defaults', () => {
  it('lists cancelled pre-leases by their start date', () => {
    const models = roster([lease(5, 1, { status: 'cancelled', startDate: '2026-08-01', endDate: '2027-07-31' })], [unit(1)]);
    const past = pastLeases(models, { sort: 'end', query: '' }, dir);
    expect(past).toHaveLength(1);
    expect(past[0]!.lastDay).toBe('2026-08-01');
  });

  it('a new lease defaults to the first of the month after the unit frees up', () => {
    const models = roster([lease(1, 1, { moveOutOn: '2026-10-15', endVia: 'early' })], [unit(1)]);
    expect(defaultStartFor(models[0]!, TODAY)).toBe('2026-11-01');
    const vacant = roster([], [unit(2)]);
    expect(defaultStartFor(vacant[0]!, TODAY)).toBe('2026-10-01');
  });
});

describe('liveLeaseIds (which leases the roster asks offers for)', () => {
  it('keeps current and upcoming leases; drops a renewed-and-replaced, a moved-out and a cancelled one', () => {
    const ids = liveLeaseIds(
      [
        lease(1, 1, { startDate: '2025-09-01', endDate: '2026-08-31' }),
        lease(2, 1, { startDate: '2026-09-01', endDate: '2027-08-31', previousLeaseId: 1 }),
        lease(3, 2, { moveOutOn: '2026-09-15', endVia: 'early' }),
        lease(4, 3),
        lease(5, 3, { startDate: '2027-07-01', endDate: '2028-06-30', previousLeaseId: 4 }),
        lease(6, 4, { status: 'cancelled' }),
      ],
      TODAY,
    );
    expect(ids).toEqual([2, 4, 5]);
  });
});
