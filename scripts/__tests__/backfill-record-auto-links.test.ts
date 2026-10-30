import { beforeEach, describe, expect, it, vi } from 'vitest';

// The script is a data repair that a person later points at production. These
// tests pin its contract at the module boundary: the service and the database
// client are mocked, and what is asserted is what the script asks of them.
const m = vi.hoisted(() => {
  const communitiesTable = {
    id: Symbol('communities.id'),
    slug: Symbol('communities.slug'),
    name: Symbol('communities.name'),
    communityType: Symbol('communities.community_type'),
    deletedAt: Symbol('communities.deleted_at'),
  };
  const documentsTable = { id: Symbol('documents.id'), title: Symbol('documents.title') };
  return {
    communitiesTable,
    documentsTable,
    // Every write path of both database clients; a dry run must never touch one.
    writes: {
      unscopedUpdate: vi.fn(),
      unscopedInsert: vi.fn(),
      unscopedDelete: vi.fn(),
      scopedUpdate: vi.fn(),
      scopedInsert: vi.fn(),
      scopedDelete: vi.fn(),
    },
    communityRows: { current: [] as Array<Record<string, unknown>> },
    communityWhere: vi.fn(),
    selectFrom: vi.fn(),
    logAuditEvent: vi.fn(),
    planCommunityRecordLinks: vi.fn(),
    applyRecordLinks: vi.fn(),
  };
});

vi.mock('@propertypro/db', () => ({
  communities: m.communitiesTable,
  documents: m.documentsTable,
  createScopedClient: () => ({
    selectFrom: m.selectFrom,
    update: m.writes.scopedUpdate,
    insert: m.writes.scopedInsert,
    delete: m.writes.scopedDelete,
  }),
  logAuditEvent: m.logAuditEvent,
}));
vi.mock('@propertypro/db/filters', () => ({
  and: (...clauses: unknown[]) => ({ and: clauses }),
  inArray: (column: unknown, values: unknown) => ({ inArray: [column, values] }),
  isNull: (column: unknown) => ({ isNull: column }),
}));
vi.mock('@propertypro/db/unsafe', () => ({
  closeUnscopedClient: vi.fn(),
  createUnscopedClient: () => ({
    select: () => ({
      from: () => ({
        where: (clause: unknown) => {
          m.communityWhere(clause);
          return { orderBy: async () => m.communityRows.current };
        },
      }),
    }),
    update: m.writes.unscopedUpdate,
    insert: m.writes.unscopedInsert,
    delete: m.writes.unscopedDelete,
  }),
}));
vi.mock('../../apps/web/src/lib/services/record-auto-link-service', () => ({
  planCommunityRecordLinks: m.planCommunityRecordLinks,
  applyRecordLinks: m.applyRecordLinks,
}));

import { parseArgs, runBackfill } from '../backfill-record-auto-links';

const condo = { id: 1, slug: 'sunset-condos', name: 'Sunset Condos', communityType: 'condo_718' };
const hoa = { id: 2, slug: 'palm-shores-hoa', name: 'Palm Shores HOA', communityType: 'hoa_720' };
const apartment = { id: 3, slug: 'sunset-ridge', name: 'Sunset Ridge Apartments', communityType: 'apartment' };

let out: string;
let err: string;

function printed(): string {
  return out;
}

function expectNoWrites(): void {
  for (const write of Object.values(m.writes)) expect(write).not.toHaveBeenCalled();
  expect(m.applyRecordLinks).not.toHaveBeenCalled();
  expect(m.logAuditEvent).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  out = '';
  err = '';
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
    out += `${a.join(' ')}\n`;
  });
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    err += `${a.join(' ')}\n`;
  });
  m.communityRows.current = [condo, hoa];
  m.planCommunityRecordLinks.mockResolvedValue({ links: [], ambiguous: [] });
  m.applyRecordLinks.mockImplementation(async (_id: number, links: unknown[]) => links.length);
  m.selectFrom.mockResolvedValue([]);
});

describe('backfill-record-auto-links', () => {
  it('a dry run writes nothing and prints planned links', async () => {
    m.planCommunityRecordLinks.mockImplementation(async (communityId: number) =>
      communityId === 1
        ? {
            links: [{ itemId: 10, templateKey: '718_budget', documentId: 100 }],
            ambiguous: [{ itemId: 11, templateKey: '718_bylaws', documentIds: [101, 102] }],
          }
        : { links: [], ambiguous: [] },
    );
    m.selectFrom.mockResolvedValue([
      { id: 100, title: '2026 Annual Budget' },
      { id: 101, title: 'Bylaws 2019' },
      { id: 102, title: 'Bylaws Amended' },
    ]);

    const code = await runBackfill([]);

    expect(code).toBe(0);
    // The community block: id, slug and name.
    expect(printed()).toContain('Community 1 · sunset-condos · Sunset Condos');
    expect(printed()).toContain('Community 2 · palm-shores-hoa · Palm Shores HOA');
    // The planned link: the item's title, the document id and the document title.
    expect(printed()).toContain('Annual Budget [718_budget]  <-  document #100 "2026 Annual Budget"');
    // The ambiguous item with every candidate id.
    expect(printed()).toMatch(/Bylaws & Amendments \[718_bylaws\]\s+candidates: #101 "Bylaws 2019", #102 "Bylaws Amended"/);
    // Totals, and the dry-run notice.
    expect(printed()).toContain('Links planned: 1');
    expect(printed()).toContain('Ambiguous, left to a person: 1');
    expect(printed()).toContain('Dry run: nothing was written');
    // Nothing was written: not through the service, not by a direct UPDATE/INSERT/DELETE.
    expectNoWrites();
  });

  it('--apply without --operator exits 2', async () => {
    const code = await runBackfill(['--apply']);

    expect(code).toBe(2);
    expect(err).toContain('--apply needs --operator');
    // Before touching the database: no community was even listed.
    expect(m.communityWhere).not.toHaveBeenCalled();
    expect(m.planCommunityRecordLinks).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it('--operator reaches the audit metadata of every link it applies', async () => {
    m.planCommunityRecordLinks.mockResolvedValue({
      links: [{ itemId: 10, templateKey: '718_budget', documentId: 100 }],
      ambiguous: [],
    });

    const code = await runBackfill(['--apply', '--operator', 'Jane Doe']);

    expect(code).toBe(0);
    expect(m.applyRecordLinks).toHaveBeenCalledTimes(2);
    expect(m.applyRecordLinks).toHaveBeenCalledWith(
      1,
      [{ itemId: 10, templateKey: '718_budget', documentId: 100 }],
      // A system actor: no user id.
      null,
      { operator: 'Jane Doe', source: 'backfill' },
    );
    expect(printed()).toContain('Links written: 2');
  });

  it('--community narrows the set, and reports and skips an apartment and an unknown id', async () => {
    // The mock answers like the database would for ids 1, 3 and 99: two rows, no row for 99.
    m.communityRows.current = [condo, apartment];
    m.planCommunityRecordLinks.mockResolvedValue({
      links: [{ itemId: 10, templateKey: '718_budget', documentId: 100 }],
      ambiguous: [],
    });

    const code = await runBackfill(['--apply', '--operator', 'Jane Doe', '--community', '1', '--community', '3', '--community', '99']);

    expect(code).toBe(0);
    expect(m.communityWhere).toHaveBeenCalledWith({
      and: [{ isNull: m.communitiesTable.deletedAt }, { inArray: [m.communitiesTable.id, [1, 3, 99]] }],
    });
    // Only the condominium was planned and written.
    expect(m.planCommunityRecordLinks.mock.calls.map((c) => c[0])).toEqual([1]);
    expect(m.applyRecordLinks.mock.calls.map((c) => c[0])).toEqual([1]);
    expect(printed()).toContain('community 3 (sunset-ridge): apartment is not a condominium or HOA; skipped');
    expect(printed()).toContain('community 99: not found (or deleted); skipped');
  });

  it('never visits an apartment even when the query returns one', async () => {
    m.communityRows.current = [condo, apartment];

    await runBackfill([]);

    // Default set: the query itself is limited to condominiums and HOAs ...
    expect(m.communityWhere).toHaveBeenCalledWith({
      and: [
        { isNull: m.communitiesTable.deletedAt },
        { inArray: [m.communitiesTable.communityType, ['condo_718', 'hoa_720']] },
      ],
    });
    // ... and the script does not rely on that alone.
    expect(m.planCommunityRecordLinks.mock.calls.map((c) => c[0])).toEqual([1]);
  });

  it('exits 2 when no community is left to examine', async () => {
    m.communityRows.current = [apartment];

    const code = await runBackfill(['--community', '3']);

    expect(code).toBe(2);
    expect(err).toContain('nothing was checked');
    expect(m.planCommunityRecordLinks).not.toHaveBeenCalled();
  });

  it('keeps going when one community fails, and exits 1', async () => {
    m.planCommunityRecordLinks.mockImplementation(async (communityId: number) => {
      if (communityId === 1) throw new Error('boom');
      return { links: [], ambiguous: [] };
    });

    const code = await runBackfill([]);

    expect(code).toBe(1);
    expect(err).toContain('Community 1 (sunset-condos) failed: boom');
    expect(m.planCommunityRecordLinks.mock.calls.map((c) => c[0])).toEqual([1, 2]);
  });
});

describe('parseArgs', () => {
  it.each([
    [['--bogus']],
    [['--community']],
    [['--community', 'abc']],
    [['--community', '0']],
    [['--community', '--apply']],
    [['--operator']],
    [['--operator', '  ']],
    [['--apply', '--operator']],
  ])('rejects %j', (argv) => {
    expect(() => parseArgs(argv)).toThrow();
  });

  it('exits 2 for a bad flag before touching the database', async () => {
    await expect(runBackfill(['--bogus'])).resolves.toBe(2);
    expect(m.communityWhere).not.toHaveBeenCalled();
  });

  it('accepts the documented flags, including --flag=value and a repeated community', () => {
    expect(parseArgs([])).toEqual({ apply: false, communityIds: [], operator: null });
    expect(parseArgs(['--apply', '--operator=Jane Doe', '--community', '4', '--community=5', '--community', '4'])).toEqual({
      apply: true,
      communityIds: [4, 5],
      operator: 'Jane Doe',
    });
  });
});
