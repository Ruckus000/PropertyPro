import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const {
  createUnscopedClientMock,
  logAuditEventMock,
  addProjectDomainMock,
  getDomainStatusMock,
  removeProjectDomainMock,
  selectRowsQueue,
  updateCalls,
} = vi.hoisted(() => ({
  createUnscopedClientMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  addProjectDomainMock: vi.fn(),
  getDomainStatusMock: vi.fn(),
  removeProjectDomainMock: vi.fn(),
  selectRowsQueue: [] as unknown[][],
  updateCalls: [] as Array<{ set: Record<string, unknown>; where: unknown }>,
}));

// The provisioning error classes must be REAL classes so `instanceof` works in
// the service's translateProviderError. We re-export the real ones and add spies
// for the call functions.
vi.mock('@/lib/domains/vercel-domains-client', async () => {
  return {
    DomainProvisioningUnavailableError: class DomainProvisioningUnavailableError extends Error {},
    DomainProviderError: class DomainProviderError extends Error {
      providerCode?: string;
      constructor(message: string, providerCode?: string) {
        super(message);
        this.providerCode = providerCode;
      }
    },
    addProjectDomain: addProjectDomainMock,
    getDomainStatus: getDomainStatusMock,
    removeProjectDomain: removeProjectDomainMock,
  };
});

vi.mock('@propertypro/db', () => ({
  logAuditEvent: logAuditEventMock,
  communities: {
    id: 'communities.id',
    customDomain: 'communities.custom_domain',
    customDomainStatus: 'communities.custom_domain_status',
    customDomainVerifiedAt: 'communities.custom_domain_verified_at',
  },
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: createUnscopedClientMock,
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
}));

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------
import {
  getDomain,
  setDomain,
  verifyDomain,
  removeDomain,
} from '@/lib/services/custom-domain-service';
import {
  DomainProvisioningUnavailableError,
  DomainProviderError,
} from '@/lib/domains/vercel-domains-client';
import { ConflictError, ValidationError, AppError } from '@/lib/api/errors';

// ---------------------------------------------------------------------------
// Unscoped-client mock chain
// ---------------------------------------------------------------------------
// Each `.select().from().where().limit()` chain resolves to the next queued
// rows array. Each `.update().set().where()` records the set/where and resolves.
function makeDb() {
  return {
    select: () => {
      const chain: Record<string, unknown> = {};
      chain.from = () => chain;
      chain.where = () => chain;
      chain.limit = () => Promise.resolve(selectRowsQueue.shift() ?? []);
      return chain;
    },
    update: () => {
      const call: { set: Record<string, unknown>; where: unknown } = { set: {}, where: undefined };
      const chain: Record<string, unknown> = {};
      chain.set = (s: Record<string, unknown>) => {
        call.set = s;
        return chain;
      };
      chain.where = (w: unknown) => {
        call.where = w;
        updateCalls.push(call);
        return Promise.resolve(undefined);
      };
      return chain;
    },
  };
}

const ROOT = 'getpropertypro.com';

beforeEach(() => {
  vi.clearAllMocks();
  selectRowsQueue.length = 0;
  updateCalls.length = 0;
  process.env.NEXT_PUBLIC_ROOT_DOMAIN = ROOT;
  createUnscopedClientMock.mockImplementation(() => makeDb());
  logAuditEventMock.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// getDomain
// ---------------------------------------------------------------------------
describe('getDomain', () => {
  it('returns the persisted state without calling Vercel', async () => {
    const verifiedAt = new Date('2026-01-02T03:04:05.000Z');
    selectRowsQueue.push([
      {
        customDomain: 'www.example.com',
        customDomainStatus: 'active',
        customDomainVerifiedAt: verifiedAt,
      },
    ]);

    const state = await getDomain(7);

    expect(state).toEqual({
      domain: 'www.example.com',
      status: 'active',
      verifiedAt: verifiedAt.toISOString(),
      records: [],
      reason: null,
    });
    expect(getDomainStatusMock).not.toHaveBeenCalled();
    expect(addProjectDomainMock).not.toHaveBeenCalled();
  });

  it('returns nulls when no domain is configured', async () => {
    selectRowsQueue.push([
      { customDomain: null, customDomainStatus: null, customDomainVerifiedAt: null },
    ]);
    const state = await getDomain(7);
    expect(state).toEqual({
      domain: null,
      status: null,
      verifiedAt: null,
      records: [],
      reason: null,
    });
  });
});

// ---------------------------------------------------------------------------
// setDomain
// ---------------------------------------------------------------------------
describe('setDomain', () => {
  it('rejects with ConflictError when a domain is already configured', async () => {
    selectRowsQueue.push([{ customDomain: 'old.example.com', customDomainStatus: 'active', customDomainVerifiedAt: null }]);

    await expect(setDomain(7, 'user-1', 'new.example.com')).rejects.toBeInstanceOf(ConflictError);
    expect(addProjectDomainMock).not.toHaveBeenCalled();
  });

  it('rejects with ValidationError for an invalid / own domain', async () => {
    selectRowsQueue.push([{ customDomain: null, customDomainStatus: null, customDomainVerifiedAt: null }]);

    await expect(setDomain(7, 'user-1', 'foo.getpropertypro.com')).rejects.toBeInstanceOf(ValidationError);
    expect(addProjectDomainMock).not.toHaveBeenCalled();
  });

  it('happy path: writes pending, audits, returns records', async () => {
    selectRowsQueue.push([{ customDomain: null, customDomainStatus: null, customDomainVerifiedAt: null }]);
    addProjectDomainMock.mockResolvedValue({
      status: 'pending',
      records: [{ type: 'CNAME', name: 'www.example.com', value: 'cname.vercel-dns.com' }],
    });

    const state = await setDomain(7, 'user-1', 'www.example.com');

    expect(addProjectDomainMock).toHaveBeenCalledWith('www.example.com');
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].set).toMatchObject({
      customDomain: 'www.example.com',
      customDomainStatus: 'pending',
    });
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        action: 'custom_domain_set',
        resourceType: 'community',
        resourceId: '7',
        communityId: 7,
        newValues: { customDomain: 'www.example.com' },
      }),
    );
    expect(state).toEqual({
      domain: 'www.example.com',
      status: 'pending',
      verifiedAt: null,
      records: [{ type: 'CNAME', name: 'www.example.com', value: 'cname.vercel-dns.com' }],
      reason: null,
    });
  });

  it('translates a pg unique-violation (23505) write to ConflictError', async () => {
    selectRowsQueue.push([{ customDomain: null, customDomainStatus: null, customDomainVerifiedAt: null }]);
    addProjectDomainMock.mockResolvedValue({ status: 'pending', records: [] });
    // First createUnscopedClient() call is readRow (default makeDb, returns the
    // queued empty-domain row). Second call is the update — override it to throw
    // a postgres unique-violation.
    createUnscopedClientMock
      .mockImplementationOnce(() => makeDb())
      .mockImplementationOnce(() => ({
        update: () => {
          const chain: Record<string, unknown> = {};
          chain.set = () => chain;
          chain.where = () => {
            const e = new Error('duplicate key value violates unique constraint') as Error & {
              code?: string;
            };
            e.code = '23505';
            return Promise.reject(e);
          };
          return chain;
        },
      }));

    await expect(setDomain(7, 'user-1', 'www.example.com')).rejects.toBeInstanceOf(ConflictError);
  });

  it('translates provisioning-unconfigured to AppError 503', async () => {
    selectRowsQueue.push([{ customDomain: null, customDomainStatus: null, customDomainVerifiedAt: null }]);
    addProjectDomainMock.mockRejectedValue(new DomainProvisioningUnavailableError('not configured'));

    await expect(setDomain(7, 'user-1', 'www.example.com')).rejects.toMatchObject({
      statusCode: 503,
      code: 'DOMAIN_PROVISIONING_UNAVAILABLE',
    });
  });

  it('translates a provider error to AppError 502', async () => {
    selectRowsQueue.push([{ customDomain: null, customDomainStatus: null, customDomainVerifiedAt: null }]);
    addProjectDomainMock.mockRejectedValue(new DomainProviderError('vercel said no'));

    const err = await setDomain(7, 'user-1', 'www.example.com').catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(502);
    expect(err.code).toBe('DOMAIN_PROVIDER_ERROR');
  });
});

// ---------------------------------------------------------------------------
// verifyDomain
// ---------------------------------------------------------------------------
describe('verifyDomain', () => {
  it('rejects with ValidationError when no domain is configured', async () => {
    selectRowsQueue.push([{ customDomain: null, customDomainStatus: null, customDomainVerifiedAt: null }]);

    await expect(verifyDomain(7, 'user-1')).rejects.toBeInstanceOf(ValidationError);
    expect(getDomainStatusMock).not.toHaveBeenCalled();
  });

  it('pending → active flips status, stamps verifiedAt, audits', async () => {
    selectRowsQueue.push([
      { customDomain: 'www.example.com', customDomainStatus: 'pending', customDomainVerifiedAt: null },
    ]);
    getDomainStatusMock.mockResolvedValue({
      status: 'active',
      records: [{ type: 'A', name: 'www.example.com', value: '76.76.21.21' }],
    });

    const state = await verifyDomain(7, 'user-1');

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].set).toMatchObject({ customDomainStatus: 'active' });
    expect(updateCalls[0].set.customDomainVerifiedAt).toBeInstanceOf(Date);
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        action: 'custom_domain_verified',
        resourceType: 'community',
        resourceId: '7',
        communityId: 7,
      }),
    );
    expect(state.status).toBe('active');
    expect(state.domain).toBe('www.example.com');
    expect(state.verifiedAt).not.toBeNull();
    expect(state.records).toHaveLength(1);
  });

  it('still-pending keeps verifiedAt as-is and does not emit a verified audit', async () => {
    const existing = new Date('2026-01-01T00:00:00.000Z');
    selectRowsQueue.push([
      { customDomain: 'www.example.com', customDomainStatus: 'pending', customDomainVerifiedAt: existing },
    ]);
    getDomainStatusMock.mockResolvedValue({ status: 'pending', records: [] });

    const state = await verifyDomain(7, 'user-1');

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].set).toMatchObject({ customDomainStatus: 'pending' });
    expect('customDomainVerifiedAt' in updateCalls[0].set).toBe(false);
    expect(logAuditEventMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'custom_domain_verified' }),
    );
    expect(state.status).toBe('pending');
    expect(state.verifiedAt).toBe(existing.toISOString());
  });

  it('translates provisioning-unconfigured to AppError 503', async () => {
    selectRowsQueue.push([
      { customDomain: 'www.example.com', customDomainStatus: 'pending', customDomainVerifiedAt: null },
    ]);
    getDomainStatusMock.mockRejectedValue(new DomainProvisioningUnavailableError('not configured'));

    await expect(verifyDomain(7, 'user-1')).rejects.toMatchObject({
      statusCode: 503,
      code: 'DOMAIN_PROVISIONING_UNAVAILABLE',
    });
    expect(updateCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// removeDomain
// ---------------------------------------------------------------------------
describe('removeDomain', () => {
  it('releases the domain at the provider, nulls columns, audits', async () => {
    selectRowsQueue.push([
      { customDomain: 'www.example.com', customDomainStatus: 'active', customDomainVerifiedAt: new Date() },
    ]);
    removeProjectDomainMock.mockResolvedValue(undefined);

    await removeDomain(7, 'user-1');

    expect(removeProjectDomainMock).toHaveBeenCalledWith('www.example.com');
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].set).toMatchObject({
      customDomain: null,
      customDomainStatus: null,
      customDomainVerifiedAt: null,
    });
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        action: 'custom_domain_removed',
        resourceType: 'community',
        resourceId: '7',
        communityId: 7,
        oldValues: { customDomain: 'www.example.com' },
      }),
    );
  });

  it('nulls columns even when nothing was configured (no provider call)', async () => {
    selectRowsQueue.push([{ customDomain: null, customDomainStatus: null, customDomainVerifiedAt: null }]);

    await removeDomain(7, 'user-1');

    expect(removeProjectDomainMock).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].set).toMatchObject({ customDomain: null });
  });
});
