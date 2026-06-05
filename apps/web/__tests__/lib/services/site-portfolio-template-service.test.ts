import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const {
  createUnscopedClientMock,
  logAuditEventMock,
  deleteStorageObjectMock,
  copyStorageObjectMock,
  getBrandingForCommunityMock,
  // shared state driving the chainable-db mock
  resultQueue,
  insertValues,
  setArgs,
} = vi.hoisted(() => ({
  createUnscopedClientMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  deleteStorageObjectMock: vi.fn(),
  copyStorageObjectMock: vi.fn(),
  getBrandingForCommunityMock: vi.fn(),
  resultQueue: [] as unknown[][],
  insertValues: [] as Record<string, unknown>[],
  setArgs: [] as Record<string, unknown>[],
}));

vi.mock('@propertypro/db', () => ({
  logAuditEvent: logAuditEventMock,
  deleteStorageObject: deleteStorageObjectMock,
  // table + column references — opaque sentinels (the chain mock ignores them)
  sitePortfolioTemplates: {
    id: 'spt.id',
    name: 'spt.name',
    siteLogoPath: 'spt.site_logo_path',
    branding: 'spt.branding',
    ownerUserId: 'spt.owner_user_id',
    createdAt: 'spt.created_at',
    updatedAt: 'spt.updated_at',
    deletedAt: 'spt.deleted_at',
  },
  communities: { id: 'c.id', communityType: 'c.community_type', subscriptionPlan: 'c.subscription_plan', deletedAt: 'c.deleted_at' },
  userRoles: { userId: 'ur.user_id', role: 'ur.role', communityId: 'ur.community_id' },
}));

vi.mock('@propertypro/db/unsafe', () => ({ createUnscopedClient: createUnscopedClientMock }));

vi.mock('@propertypro/db/filters', () => ({
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
  and: (...c: unknown[]) => ({ __and: c }),
  isNull: (col: unknown) => ({ __isNull: col }),
  desc: (col: unknown) => ({ __desc: col }),
}));

vi.mock('@/lib/site-assets/copy-object', () => ({ copyStorageObject: copyStorageObjectMock }));
vi.mock('@/lib/api/branding', () => ({ getBrandingForCommunity: getBrandingForCommunityMock }));

// ---------------------------------------------------------------------------
// Chainable-db mock: every builder method returns a thenable chain; awaiting it
// (at any terminal: where/limit/orderBy/returning) shifts the next queued rows.
// `values`/`set` record their argument for assertions.
// ---------------------------------------------------------------------------
function makeChain() {
  const chain: Record<string, unknown> = {};
  const passthrough = ['select', 'from', 'where', 'innerJoin', 'orderBy', 'limit', 'returning', 'update', 'insert'];
  for (const m of passthrough) chain[m] = () => chain;
  chain.values = (v: Record<string, unknown>) => {
    insertValues.push(v);
    return chain;
  };
  chain.set = (s: Record<string, unknown>) => {
    setArgs.push(s);
    return chain;
  };
  chain.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(resultQueue.shift() ?? []).then(res, rej);
  return chain;
}

// Imports under test (after mocks)
import {
  listTemplates,
  renameTemplate,
  createFromCommunity,
  deleteTemplate,
  userHasPortfolioTemplatesAccess,
} from '@/lib/services/site-portfolio-template-service';
import { NotFoundError } from '@/lib/api/errors';

beforeEach(() => {
  vi.clearAllMocks();
  resultQueue.length = 0;
  insertValues.length = 0;
  setArgs.length = 0;
  createUnscopedClientMock.mockImplementation(() => makeChain());
  logAuditEventMock.mockResolvedValue(undefined);
  deleteStorageObjectMock.mockResolvedValue(undefined);
  copyStorageObjectMock.mockResolvedValue(1234);
});

const NOW = new Date('2026-02-03T04:05:06.000Z');
function templateRow(over: Record<string, unknown> = {}) {
  return {
    id: 11,
    name: 'Coastal',
    siteLogoPath: null,
    branding: { primaryColor: '#111' },
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

describe('listTemplates', () => {
  it("returns the owner's templates as summaries", async () => {
    resultQueue.push([templateRow(), templateRow({ id: 12, name: 'Urban' })]);
    const out = await listTemplates('user-1');
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: 11, name: 'Coastal', branding: { primaryColor: '#111' } });
    expect(out[0]!.createdAt).toBe(NOW.toISOString());
  });
});

describe('createFromCommunity', () => {
  it('snapshots branding, copies the source logo, sets site_logo_path, audits', async () => {
    getBrandingForCommunityMock.mockResolvedValue({
      primaryColor: '#abc',
      siteLogoPath: 'communities/7/branding/site-logo.webp',
      logoPath: 'communities/7/branding/logo.webp',
      assetsBytesUsed: 999,
    });
    resultQueue.push([templateRow({ id: 50, siteLogoPath: null })]); // insert ... returning
    resultQueue.push([]); // update site_logo_path

    const out = await createFromCommunity('user-1', 7, 'Coastal');

    // branding captured WITHOUT logoPath/assetsBytesUsed
    expect(insertValues[0]).toMatchObject({ ownerUserId: 'user-1', name: 'Coastal', siteLogoPath: null });
    expect(insertValues[0]!.branding).toMatchObject({ primaryColor: '#abc' });
    expect((insertValues[0]!.branding as Record<string, unknown>).logoPath).toBeUndefined();
    // logo copied into the template namespace
    expect(copyStorageObjectMock).toHaveBeenCalledWith(
      'documents',
      'communities/7/branding/site-logo.webp',
      'portfolio-templates/50/site-logo.webp',
    );
    expect(setArgs[0]).toEqual({ siteLogoPath: 'portfolio-templates/50/site-logo.webp' });
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'portfolio_template_created', resourceType: 'portfolio_template', communityId: 7 }),
    );
    expect(out.siteLogoPath).toBe('portfolio-templates/50/site-logo.webp');
  });

  it('skips the logo copy when the source community has no wordmark', async () => {
    getBrandingForCommunityMock.mockResolvedValue({ primaryColor: '#abc' });
    resultQueue.push([templateRow({ id: 51, siteLogoPath: null })]);

    const out = await createFromCommunity('user-1', 7, 'NoLogo');

    expect(copyStorageObjectMock).not.toHaveBeenCalled();
    expect(out.siteLogoPath).toBeNull();
  });

  it('keeps the template logo-less (no throw, no orphan) when the logo copy fails', async () => {
    getBrandingForCommunityMock.mockResolvedValue({
      primaryColor: '#abc',
      siteLogoPath: 'communities/7/branding/site-logo.webp',
    });
    resultQueue.push([templateRow({ id: 52, siteLogoPath: null })]); // insert ... returning
    copyStorageObjectMock.mockRejectedValueOnce(new Error('storage down'));

    const out = await createFromCommunity('user-1', 7, 'CopyFails');

    expect(out.siteLogoPath).toBeNull();
    // the row was created + audited despite the logo failure
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'portfolio_template_created' }),
    );
    // no site_logo_path update was attempted
    expect(setArgs).toHaveLength(0);
  });
});

describe('renameTemplate', () => {
  it('throws NotFoundError when no live row matches', async () => {
    resultQueue.push([]); // update ... returning → empty
    await expect(renameTemplate('user-1', 11, 'X')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('returns the renamed summary', async () => {
    resultQueue.push([templateRow({ name: 'Renamed' })]);
    const out = await renameTemplate('user-1', 11, 'Renamed');
    expect(out.name).toBe('Renamed');
  });
});

describe('deleteTemplate', () => {
  it('purges the logo asset then soft-deletes', async () => {
    resultQueue.push([{ id: 11, siteLogoPath: 'portfolio-templates/11/site-logo.webp' }]); // select limit
    resultQueue.push([]); // soft-delete update
    await deleteTemplate('user-1', 11);
    expect(deleteStorageObjectMock).toHaveBeenCalledWith('documents', 'portfolio-templates/11/site-logo.webp');
    expect(setArgs[0]).toHaveProperty('deletedAt');
  });

  it('tolerates a storage-delete failure and still soft-deletes', async () => {
    resultQueue.push([{ id: 11, siteLogoPath: 'portfolio-templates/11/site-logo.webp' }]);
    resultQueue.push([]);
    deleteStorageObjectMock.mockRejectedValue(new Error('gone'));
    await expect(deleteTemplate('user-1', 11)).resolves.toBeUndefined();
    expect(setArgs[0]).toHaveProperty('deletedAt');
  });

  it('throws NotFoundError when the template is absent', async () => {
    resultQueue.push([]); // select limit → empty
    await expect(deleteTemplate('user-1', 99)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('userHasPortfolioTemplatesAccess', () => {
  it('is true when a managed community is on operations_plus', async () => {
    resultQueue.push([{ communityType: 'condo_718', subscriptionPlan: 'operations_plus' }]);
    expect(await userHasPortfolioTemplatesAccess('user-1')).toBe(true);
  });

  it('is false when no managed community has the feature', async () => {
    resultQueue.push([
      { communityType: 'condo_718', subscriptionPlan: 'professional' },
      { communityType: 'hoa_720', subscriptionPlan: 'essentials' },
    ]);
    expect(await userHasPortfolioTemplatesAccess('user-1')).toBe(false);
  });
});
