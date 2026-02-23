import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TenantContextMissing } from '../src/errors/TenantContextMissing';

/**
 * Unit tests for the scoped query builder.
 *
 * These tests mock the database layer and verify that:
 * 1. TenantContextMissing is thrown for invalid communityId
 * 2. community_id filters are injected for tenant-scoped tables
 * 3. deleted_at IS NULL is injected for soft-deletable tables
 * 4. Audit log tables are exempt from soft-delete filtering
 * 5. Insert auto-injects communityId, overriding caller values
 */

// ---------------------------------------------------------------------------
// Mock the drizzle module to avoid needing DATABASE_URL.
// vi.hoisted ensures mock definitions are available when vi.mock is hoisted.
// ---------------------------------------------------------------------------

const {
  mockReturning,
  mockWhereOnDelete,
  mockDeleteFrom,
  mockWhereOnUpdate,
  mockSet,
  mockValues,
  mockInsertInto,
  mockWhereOnSelect,
  mockFrom,
  mockSelect,
  mockDb,
} = vi.hoisted(() => {
  const mockReturning = vi.fn().mockResolvedValue([]);
  const mockWhereOnDelete = vi.fn().mockReturnValue({ returning: mockReturning });
  const mockDeleteFrom = vi.fn().mockReturnValue({ where: mockWhereOnDelete, returning: mockReturning });

  const mockWhereOnUpdate = vi.fn().mockReturnValue({ returning: mockReturning });
  const mockSet = vi.fn().mockReturnValue({ where: mockWhereOnUpdate, returning: mockReturning });

  const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
  const mockInsertInto = vi.fn().mockReturnValue({ values: mockValues });

  const mockWhereOnSelect = vi.fn().mockReturnThis();
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhereOnSelect });
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

  // transaction executes its callback immediately with the same mock db,
  // so update/softDelete/insert transaction wrappers work without a real connection.
  const mockDb = {
    select: mockSelect,
    insert: mockInsertInto,
    update: vi.fn().mockReturnValue({ set: mockSet }),
    delete: mockDeleteFrom,
    execute: vi.fn().mockResolvedValue([]),
    transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockDb)),
  };

  return {
    mockReturning,
    mockWhereOnDelete,
    mockDeleteFrom,
    mockWhereOnUpdate,
    mockSet,
    mockValues,
    mockInsertInto,
    mockWhereOnSelect,
    mockFrom,
    mockSelect,
    mockDb,
  };
});

vi.mock('../src/drizzle', () => ({
  db: mockDb,
}));

// Now import createScopedClient AFTER the mock is set up
const { createScopedClient, isSoftDeleteExempt } = await import('../src/scoped-client');

// Import schema tables for testing
const { units } = await import('../src/schema/units');
const { userRoles } = await import('../src/schema/user-roles');
const { communities } = await import('../src/schema/communities');

beforeEach(() => {
  vi.clearAllMocks();
  // Re-setup the mock chain after clearing
  mockFrom.mockReturnValue({ where: mockWhereOnSelect });
  mockSelect.mockReturnValue({ from: mockFrom });
  mockInsertInto.mockReturnValue({ values: mockValues });
  mockValues.mockReturnValue({ returning: mockReturning });
  mockReturning.mockResolvedValue([]);
  mockDb.update.mockReturnValue({ set: mockSet });
  mockSet.mockReturnValue({ where: mockWhereOnUpdate, returning: mockReturning });
  mockWhereOnUpdate.mockReturnValue({ returning: mockReturning });
  mockDeleteFrom.mockReturnValue({ where: mockWhereOnDelete, returning: mockReturning });
  mockWhereOnDelete.mockReturnValue({ returning: mockReturning });
  mockDb.execute.mockResolvedValue([]);
  mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockDb));
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createScopedClient', () => {
  describe('context validation', () => {
    it('throws TenantContextMissing when communityId is undefined', () => {
      expect(() => createScopedClient(undefined)).toThrow(TenantContextMissing);
    });

    it('throws TenantContextMissing when communityId is null', () => {
      expect(() => createScopedClient(null)).toThrow(TenantContextMissing);
    });

    it('throws TenantContextMissing when communityId is NaN', () => {
      expect(() => createScopedClient(NaN)).toThrow(TenantContextMissing);
    });

    it('does not throw for a valid communityId', () => {
      expect(() => createScopedClient(1)).not.toThrow();
    });

    it('exposes the communityId on the client', () => {
      const client = createScopedClient(42);
      expect(client.communityId).toBe(42);
    });
  });

  describe('query (SELECT)', () => {
    it('calls db.select().from(table) for any table', () => {
      const client = createScopedClient(1);
      client.query(units);

      expect(mockSelect).toHaveBeenCalled();
      expect(mockFrom).toHaveBeenCalledWith(units);
    });

    it('applies WHERE filter for tables with communityId and deletedAt', () => {
      const client = createScopedClient(1);
      client.query(units);

      // units has communityId AND deletedAt — WHERE should be called
      expect(mockWhereOnSelect).toHaveBeenCalled();
    });

    it('applies WHERE filter for tables with communityId but no deletedAt', () => {
      const client = createScopedClient(1);
      client.query(userRoles);

      // userRoles has communityId but no deletedAt
      expect(mockWhereOnSelect).toHaveBeenCalled();
    });

    it('applies WHERE filter for tables with only deletedAt (no communityId)', () => {
      const client = createScopedClient(1);
      client.query(communities);

      // communities has deletedAt but no communityId
      expect(mockWhereOnSelect).toHaveBeenCalled();
    });
  });

  describe('insert', () => {
    it('calls db.insert with communityId injected', async () => {
      const client = createScopedClient(42);
      await client.insert(units, {
        unitNumber: '101',
      });

      expect(mockInsertInto).toHaveBeenCalledWith(units);
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({ communityId: 42, unitNumber: '101' }),
      );
    });

    it('overrides caller-supplied communityId with scoped value', async () => {
      const client = createScopedClient(42);
      await client.insert(units, {
        communityId: 999,
        unitNumber: '101',
      });

      // The scoped client should override 999 with 42
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({ communityId: 42 }),
      );
    });

    it('does not inject communityId for tables without the column', async () => {
      const client = createScopedClient(42);
      await client.insert(communities, {
        name: 'Test Community',
        slug: 'test',
        communityType: 'condo_718',
      });

      // communities table does NOT have communityId column
      const calledData = mockValues.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
      expect(calledData).toBeDefined();
      expect(calledData).not.toHaveProperty('communityId');
    });
  });

  describe('update', () => {
    it('strips communityId from SET data', async () => {
      const client = createScopedClient(42);
      await client.update(units, {
        communityId: 999,
        unitNumber: '202',
      });

      const setData = mockSet.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
      expect(setData).toBeDefined();
      expect(setData).not.toHaveProperty('communityId');
      expect(setData).toHaveProperty('unitNumber', '202');
    });

    it('auto-sets updatedAt on update', async () => {
      const client = createScopedClient(42);
      await client.update(units, { unitNumber: '202' });

      const setData = mockSet.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
      expect(setData).toBeDefined();
      expect(setData?.['updatedAt']).toBeInstanceOf(Date);
    });
  });

  describe('softDelete', () => {
    it('sets deletedAt to a Date', async () => {
      const client = createScopedClient(42);
      await client.softDelete(units);

      const setData = mockSet.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
      expect(setData).toBeDefined();
      expect(setData?.['deletedAt']).toBeInstanceOf(Date);
    });

    it('throws for tables without deletedAt column', async () => {
      const client = createScopedClient(42);
      await expect(client.softDelete(userRoles)).rejects.toThrow(
        /does not support soft delete/,
      );
    });
  });

  describe('hardDelete', () => {
    it('calls db.delete with WHERE filter', async () => {
      const client = createScopedClient(42);
      await client.hardDelete(units);

      expect(mockDeleteFrom).toHaveBeenCalledWith(units);
      expect(mockWhereOnDelete).toHaveBeenCalled();
    });
  });

  describe('communities table — root tenant isolation', () => {
    it('query on communities applies a WHERE filter (id = communityId)', async () => {
      const client = createScopedClient(42);
      await client.query(communities);

      expect(mockWhereOnSelect).toHaveBeenCalled();
      const whereArg = mockWhereOnSelect.mock.calls[0]?.[0];
      expect(whereArg).toBeDefined();
    });

    it('query on communities produces different WHERE args for different communityIds', async () => {
      const clientA = createScopedClient(42);
      await clientA.query(communities);
      const whereArgA = mockWhereOnSelect.mock.calls[0]?.[0];

      vi.clearAllMocks();
      mockFrom.mockReturnValue({ where: mockWhereOnSelect });
      mockSelect.mockReturnValue({ from: mockFrom });

      const clientB = createScopedClient(99);
      await clientB.query(communities);
      const whereArgB = mockWhereOnSelect.mock.calls[0]?.[0];

      expect(whereArgA).toBeDefined();
      expect(whereArgB).toBeDefined();
      // Different community IDs produce distinct SQL expression objects
      expect(whereArgA).not.toBe(whereArgB);
    });

    it('update on communities applies WHERE using id = communityId', async () => {
      const client = createScopedClient(42);
      await client.update(communities, { name: 'Updated Name' });

      expect(mockWhereOnUpdate).toHaveBeenCalled();
      const whereArg = mockWhereOnUpdate.mock.calls[0]?.[0];
      expect(whereArg).toBeDefined();
    });

    it('softDelete on communities applies WHERE using id = communityId', async () => {
      const client = createScopedClient(42);
      await client.softDelete(communities);

      expect(mockWhereOnUpdate).toHaveBeenCalled();
      const whereArg = mockWhereOnUpdate.mock.calls[0]?.[0];
      expect(whereArg).toBeDefined();
    });

    it('hardDelete on communities applies WHERE using id = communityId', async () => {
      const client = createScopedClient(42);
      await client.hardDelete(communities);

      expect(mockDeleteFrom).toHaveBeenCalledWith(communities);
      expect(mockWhereOnDelete).toHaveBeenCalled();
      const whereArg = mockWhereOnDelete.mock.calls[0]?.[0];
      expect(whereArg).toBeDefined();
    });
  });
});

describe('isSoftDeleteExempt', () => {
  it('returns true for compliance_audit_log', () => {
    expect(isSoftDeleteExempt('compliance_audit_log')).toBe(true);
  });

  it('returns false for regular tables', () => {
    expect(isSoftDeleteExempt('units')).toBe(false);
    expect(isSoftDeleteExempt('documents')).toBe(false);
    expect(isSoftDeleteExempt('communities')).toBe(false);
  });
});
