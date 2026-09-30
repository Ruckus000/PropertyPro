/**
 * paginateStormDamageReports: the reporter narrowing is a SQL predicate
 * handed to paginate(), because RLS cannot do it on the scoped client's
 * connection (its own-rows branch keys on auth.uid(), never set there).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { paginateMock } = vi.hoisted(() => ({ paginateMock: vi.fn() }));

vi.mock('@propertypro/db', () => ({
  paginate: paginateMock,
  documents: { __table: 'documents' },
  stormDamageReports: { __table: 'storm_damage_reports', reportedBy: { __col: 'reportedBy' } },
}));
vi.mock('@propertypro/db/filters', () => ({
  eq: (col: unknown, val: unknown) => ({ eq: { col, val } }),
}));

import { paginateStormDamageReports } from '../../src/lib/services/storm-damage-service';

describe('paginateStormDamageReports', () => {
  beforeEach(() => {
    paginateMock.mockReset();
    paginateMock.mockResolvedValue({ data: [], pagination: { nextCursor: null, hasMore: false, pageSize: 50 } });
  });

  it('passes a reported_by predicate when reportedBy is given', async () => {
    await paginateStormDamageReports({} as never, { pageSize: 10, reportedBy: 'u-1' });
    expect(paginateMock).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ __table: 'storm_damage_reports' }),
      { cursor: undefined, pageSize: 10 },
      { where: { eq: { col: { __col: 'reportedBy' }, val: 'u-1' } } },
    );
  });

  it('passes no predicate for an unnarrowed (admin) page', async () => {
    await paginateStormDamageReports({} as never, { cursor: 'c' });
    expect(paginateMock.mock.calls[0]![3]).toBeUndefined();
  });
});
