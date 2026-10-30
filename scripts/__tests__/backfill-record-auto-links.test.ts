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
    ensureChecklist: vi.fn(),
    communityListError: { current: null as Error | null },
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
          return {
            orderBy: async () => {
              if (m.communityListError.current) throw m.communityListError.current;
              return m.communityRows.current;
            },
          };
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
// Creating a missing checklist is a write: only --apply may call it.
vi.mock('../../apps/web/src/lib/services/transparency-service', () => ({
  ensureTransparencyChecklistInitialized: m.ensureChecklist,
}));

import { describeTarget, parseArgs, runBackfill } from '../backfill-record-auto-links';

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
  expect(m.ensureChecklist).not.toHaveBeenCalled();
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
  m.communityListError.current = null;
  m.planCommunityRecordLinks.mockResolvedValue({ links: [], ambiguous: [], notCreated: 0 });
  m.ensureChecklist.mockResolvedValue([]);
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

describe('backfill-record-auto-links: communities whose checklist was never created', () => {
  it('a dry run plans the missing records in memory, says so, and writes nothing', async () => {
    m.communityRows.current = [condo];
    m.planCommunityRecordLinks.mockResolvedValue({
      // In-memory items carry negative ids; the dry run only prints them.
      links: [{ itemId: -1, templateKey: '718_budget', documentId: 100 }],
      ambiguous: [],
      notCreated: 16,
    });
    m.selectFrom.mockResolvedValue([{ id: 100, title: '2026 Annual Budget' }]);

    const code = await runBackfill([]);

    expect(code).toBe(0);
    expect(m.planCommunityRecordLinks).toHaveBeenCalledWith(1, { includeMissingTemplateItems: true });
    expect(printed()).toContain('checklist not created yet: 16 records would be checked');
    expect(printed()).toContain('Annual Budget [718_budget]  <-  document #100 "2026 Annual Budget"');
    expectNoWrites();
  });

  it('--apply creates the checklist first, then plans against the rows it wrote', async () => {
    m.communityRows.current = [condo];
    m.planCommunityRecordLinks.mockResolvedValue({
      links: [{ itemId: 10, templateKey: '718_budget', documentId: 100 }],
      ambiguous: [],
      notCreated: 0,
    });

    const code = await runBackfill(['--apply', '--operator', 'Jane Doe']);

    expect(code).toBe(0);
    expect(m.ensureChecklist).toHaveBeenCalledWith(1, 'condo_718');
    expect(m.planCommunityRecordLinks).toHaveBeenCalledWith(1, { includeMissingTemplateItems: false });
    const [initOrder] = m.ensureChecklist.mock.invocationCallOrder;
    const [planOrder] = m.planCommunityRecordLinks.mock.invocationCallOrder;
    expect(initOrder).toBeLessThan(planOrder as number);
    expect(m.applyRecordLinks).toHaveBeenCalledTimes(1);
  });
});

describe('backfill-record-auto-links: what an operator reads', () => {
  it('names the host, port and database, and nothing else from the URL', async () => {
    const target = describeTarget('postgresql://admin:s3cret-pw@db.example.com:6543/postgres?sslmode=require&password=leak');

    expect(target).toBe('host db.example.com · port 6543 · database postgres');
    expect(target).not.toContain('admin');
    expect(target).not.toContain('s3cret');
    expect(target).not.toContain('sslmode');
    expect(target).not.toContain('leak');
  });

  it('reports how many of the planned links were written', async () => {
    m.communityRows.current = [condo];
    m.planCommunityRecordLinks.mockResolvedValue({
      links: [
        { itemId: 10, templateKey: '718_budget', documentId: 100 },
        { itemId: 11, templateKey: '718_bylaws', documentId: 101 },
      ],
      ambiguous: [],
      notCreated: 0,
    });
    // One item was linked by someone else between the plan and the write.
    m.applyRecordLinks.mockResolvedValue(1);

    const code = await runBackfill(['--apply', '--operator', 'Jane Doe']);

    expect(code).toBe(0);
    expect(printed()).toContain('Applied: 1 of 2 planned link(s) written');
    expect(printed()).toContain('Links written: 1');
  });

  it('a failure mid-apply says links may already be written and to re-run the dry run, and exits 1', async () => {
    m.planCommunityRecordLinks.mockResolvedValue({
      links: [{ itemId: 10, templateKey: '718_budget', documentId: 100 }],
      ambiguous: [],
      notCreated: 0,
    });
    m.applyRecordLinks.mockImplementation(async (communityId: number) => {
      if (communityId === 1) throw new Error('connection reset');
      return 1;
    });

    const code = await runBackfill(['--apply', '--operator', 'Jane Doe']);

    expect(code).toBe(1);
    expect(err).toContain('Community 1 (sunset-condos) failed: connection reset');
    expect(err).toContain('may already have been written');
    expect(err).toContain('Re-run the dry run');
    // The other community still ran.
    expect(m.applyRecordLinks.mock.calls.map((c) => c[0])).toEqual([1, 2]);
  });

  it('an exception during a dry run exits 1 and writes nothing', async () => {
    m.planCommunityRecordLinks.mockRejectedValue(new Error('statement timeout'));

    const code = await runBackfill([]);

    expect(code).toBe(1);
    expect(err).toContain('failed: statement timeout');
    // A dry run has written nothing, so it does not warn that links may exist.
    expect(err).not.toContain('may already have been written');
    expectNoWrites();
  });

  it('exits 2 when the communities cannot be listed', async () => {
    m.communityListError.current = new Error('could not connect');

    const code = await runBackfill([]);

    expect(code).toBe(2);
    expect(err).toContain('Could not list the communities: could not connect');
    expect(m.planCommunityRecordLinks).not.toHaveBeenCalled();
    expectNoWrites();
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
