import { beforeEach, describe, expect, it, vi } from 'vitest';

// The script writes legal gates (fines, payments, SMS, notice PDFs) onto the
// rows it selects, and `.env.local` points at production. This pins that the
// selection requires `is_demo`, not merely a demo slug.
const { whereMock, updateWhereMock, communitiesTable } = vi.hoisted(() => ({
  whereMock: vi.fn(),
  updateWhereMock: vi.fn(),
  communitiesTable: {
    id: Symbol('communities.id'),
    slug: Symbol('communities.slug'),
    name: Symbol('communities.name'),
    isDemo: Symbol('communities.is_demo'),
    communitySettings: Symbol('communities.community_settings'),
  },
}));

vi.mock('@propertypro/db', () => ({ communities: communitiesTable }));
vi.mock('@propertypro/db/filters', () => ({
  and: (...clauses: unknown[]) => ({ and: clauses }),
  eq: (column: unknown, value: unknown) => ({ eq: [column, value] }),
  inArray: (column: unknown, values: unknown) => ({ inArray: [column, values] }),
  sql: () => ({ sql: true }),
}));
vi.mock('@propertypro/db/unsafe', () => ({
  closeUnscopedClient: vi.fn(),
  createUnscopedClient: () => ({
    select: () => ({ from: () => ({ where: whereMock }) }),
    update: () => ({ set: () => ({ where: updateWhereMock }) }),
  }),
}));
vi.mock('../lib/seed-safety', () => ({ assertSeedEnvironment: vi.fn() }));

import { runDemoEnableGates } from '../demo-enable-gates';

describe('runDemoEnableGates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    whereMock.mockResolvedValue([{ id: 7, slug: 'sunset-condos', name: 'Sunset Condos' }]);
  });

  it('selects only communities flagged is_demo, not every row holding a demo slug', async () => {
    await runDemoEnableGates(true);

    const where = whereMock.mock.calls[0]?.[0] as { and?: unknown[] };
    expect(where.and).toContainEqual({ eq: [communitiesTable.isDemo, true] });
    expect(where.and).toContainEqual({
      inArray: [communitiesTable.slug, expect.arrayContaining(['sunset-condos'])],
    });
    // Control: the update touches exactly the ids that selection returned.
    expect(updateWhereMock).toHaveBeenCalledWith({ inArray: [communitiesTable.id, [7]] });
  });
});
