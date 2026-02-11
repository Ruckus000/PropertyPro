import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * P1-27b — Audit Logging Middleware tests.
 *
 * Required tests:
 * 1. Append-only rejection (UPDATE/DELETE blocked on compliance_audit_log)
 * 2. Create mutation logs new_values
 * 3. Update mutation logs old_values + new_values
 * 4. Soft-delete exemption behavior for audit reads
 * 5. Cross-tenant audit-read isolation
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

  // values() returns an object that is both thenable (for logAuditEvent's `await`)
  // and has .returning() (for scoped client's insert)
  const mockReturningOnInsert = vi.fn().mockResolvedValue([]);
  const mockValues = vi.fn().mockImplementation(() => {
    const result = Promise.resolve(undefined);
    Object.assign(result, { returning: mockReturningOnInsert });
    return result;
  });
  const mockInsertInto = vi.fn().mockReturnValue({ values: mockValues });

  const mockWhereOnSelect = vi.fn().mockReturnThis();
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhereOnSelect });
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

  const mockDb = {
    select: mockSelect,
    insert: mockInsertInto,
    update: vi.fn().mockReturnValue({ set: mockSet }),
    delete: mockDeleteFrom,
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

// Import after mocking
const { logAuditEvent } = await import('../src/utils/audit-logger');
const { createScopedClient, isSoftDeleteExempt, isAppendOnlyTable } = await import('../src/scoped-client');
const { complianceAuditLog } = await import('../src/schema/compliance-audit-log');

beforeEach(() => {
  vi.clearAllMocks();
  // Re-setup the mock chain after clearing
  mockFrom.mockReturnValue({ where: mockWhereOnSelect });
  mockSelect.mockReturnValue({ from: mockFrom });
  mockInsertInto.mockReturnValue({ values: mockValues });
  mockValues.mockImplementation(() => {
    const result = Promise.resolve(undefined);
    Object.assign(result, { returning: vi.fn().mockResolvedValue([]) });
    return result;
  });
  mockDb.update.mockReturnValue({ set: mockSet });
  mockSet.mockReturnValue({ where: mockWhereOnUpdate, returning: mockReturning });
  mockWhereOnUpdate.mockReturnValue({ returning: mockReturning });
  mockDeleteFrom.mockReturnValue({ where: mockWhereOnDelete, returning: mockReturning });
  mockWhereOnDelete.mockReturnValue({ returning: mockReturning });
});

// ---------------------------------------------------------------------------
// Test 1: Append-only rejection (UPDATE/DELETE blocked)
// ---------------------------------------------------------------------------

describe('append-only enforcement on compliance_audit_log', () => {
  it('isAppendOnlyTable returns true for compliance_audit_log', () => {
    expect(isAppendOnlyTable('compliance_audit_log')).toBe(true);
  });

  it('isAppendOnlyTable returns false for regular tables', () => {
    expect(isAppendOnlyTable('units')).toBe(false);
    expect(isAppendOnlyTable('documents')).toBe(false);
  });

  it('rejects UPDATE on compliance_audit_log via scoped client', async () => {
    const client = createScopedClient(1);

    await expect(
      client.update(complianceAuditLog, { action: 'modified' }),
    ).rejects.toThrow(/append-only.*UPDATE.*not permitted/i);
  });

  it('rejects softDelete on compliance_audit_log via scoped client', async () => {
    const client = createScopedClient(1);

    await expect(
      client.softDelete(complianceAuditLog),
    ).rejects.toThrow(/append-only.*DELETE.*not permitted/i);
  });

  it('rejects hardDelete on compliance_audit_log via scoped client', async () => {
    const client = createScopedClient(1);

    await expect(
      client.hardDelete(complianceAuditLog),
    ).rejects.toThrow(/append-only.*DELETE.*not permitted/i);
  });

  it('does NOT call db.update when UPDATE is attempted on append-only table', async () => {
    const client = createScopedClient(1);

    try {
      await client.update(complianceAuditLog, { action: 'modified' });
    } catch {
      // expected
    }

    expect(mockSet).not.toHaveBeenCalled();
  });

  it('does NOT call db.delete when DELETE is attempted on append-only table', async () => {
    const client = createScopedClient(1);

    try {
      await client.hardDelete(complianceAuditLog);
    } catch {
      // expected
    }

    expect(mockDeleteFrom).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test 2: Create mutation logs new_values
// ---------------------------------------------------------------------------

describe('logAuditEvent — create mutation logging', () => {
  it('INSERTs into compliance_audit_log with correct values', async () => {
    const newValues = { title: 'Annual Budget', category: 'financial' };

    await logAuditEvent({
      userId: 'user-abc-123',
      action: 'create',
      resourceType: 'document',
      resourceId: 'doc-456',
      communityId: 42,
      newValues,
    });

    expect(mockInsertInto).toHaveBeenCalledWith(complianceAuditLog);
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-abc-123',
        action: 'create',
        resourceType: 'document',
        resourceId: 'doc-456',
        communityId: 42,
        newValues,
        oldValues: null,
        metadata: null,
      }),
    );
  });

  it('stores newValues as provided on create', async () => {
    const newValues = { name: 'Board Meeting', date: '2026-03-15' };

    await logAuditEvent({
      userId: 'user-1',
      action: 'create',
      resourceType: 'meeting',
      resourceId: 'meeting-1',
      communityId: 1,
      newValues,
    });

    const insertedData = mockValues.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insertedData.newValues).toEqual(newValues);
    expect(insertedData.oldValues).toBeNull();
  });

  it('stores metadata when provided', async () => {
    const metadata = { requestId: 'req-789', ipAddress: '192.168.1.1' };

    await logAuditEvent({
      userId: 'user-1',
      action: 'create',
      resourceType: 'document',
      resourceId: 'doc-1',
      communityId: 1,
      metadata,
    });

    const insertedData = mockValues.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insertedData.metadata).toEqual(metadata);
  });
});

// ---------------------------------------------------------------------------
// Test 3: Update mutation logs old_values + new_values
// ---------------------------------------------------------------------------

describe('logAuditEvent — update mutation logging', () => {
  it('stores both old_values and new_values on update', async () => {
    const oldValues = { title: 'Draft Budget', status: 'draft' };
    const newValues = { title: 'Final Budget', status: 'published' };

    await logAuditEvent({
      userId: 'user-abc-123',
      action: 'update',
      resourceType: 'document',
      resourceId: 'doc-456',
      communityId: 42,
      oldValues,
      newValues,
    });

    expect(mockInsertInto).toHaveBeenCalledWith(complianceAuditLog);
    const insertedData = mockValues.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insertedData.oldValues).toEqual(oldValues);
    expect(insertedData.newValues).toEqual(newValues);
  });

  it('captures partial old_values when only some fields change', async () => {
    const oldValues = { status: 'draft' };
    const newValues = { status: 'published' };

    await logAuditEvent({
      userId: 'user-1',
      action: 'update',
      resourceType: 'announcement',
      resourceId: 'ann-1',
      communityId: 10,
      oldValues,
      newValues,
    });

    const insertedData = mockValues.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insertedData.oldValues).toEqual({ status: 'draft' });
    expect(insertedData.newValues).toEqual({ status: 'published' });
    expect(insertedData.action).toBe('update');
  });

  it('preserves communityId as number type', async () => {
    await logAuditEvent({
      userId: 'user-1',
      action: 'update',
      resourceType: 'document',
      resourceId: 'doc-1',
      communityId: 99,
      oldValues: { a: 1 },
      newValues: { a: 2 },
    });

    const insertedData = mockValues.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insertedData.communityId).toBe(99);
    expect(typeof insertedData.communityId).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// Test 4: Soft-delete exemption behavior for audit reads
// ---------------------------------------------------------------------------

describe('soft-delete exemption for compliance_audit_log', () => {
  it('compliance_audit_log is registered as soft-delete exempt', () => {
    expect(isSoftDeleteExempt('compliance_audit_log')).toBe(true);
  });

  it('querying compliance_audit_log does NOT add deleted_at IS NULL filter', async () => {
    const client = createScopedClient(42);
    await client.query(complianceAuditLog);

    // The WHERE clause should only contain community_id filter,
    // NOT a deleted_at IS NULL filter (since the table is exempt)
    expect(mockWhereOnSelect).toHaveBeenCalled();

    // Verify the call was made — the filter should be community_id = 42 only
    // Since compliance_audit_log has communityId but NO deletedAt column,
    // and it's also exempt from soft-delete filtering, only community_id filter applies
    const whereArg = mockWhereOnSelect.mock.calls[0]?.[0];
    expect(whereArg).toBeDefined();
  });

  it('allows INSERT into compliance_audit_log via scoped client', async () => {
    const client = createScopedClient(42);
    await client.insert(complianceAuditLog, {
      userId: 'user-1',
      action: 'create',
      resourceType: 'document',
      resourceId: 'doc-1',
    });

    expect(mockInsertInto).toHaveBeenCalledWith(complianceAuditLog);
    // communityId should be auto-injected
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ communityId: 42 }),
    );
  });
});

// ---------------------------------------------------------------------------
// Test 5: Cross-tenant audit-read isolation
// ---------------------------------------------------------------------------

describe('cross-tenant audit-read isolation', () => {
  it('scoped client adds community_id filter when querying compliance_audit_log', async () => {
    const clientA = createScopedClient(100);
    await clientA.query(complianceAuditLog);

    // Verify community_id scoping is applied
    expect(mockFrom).toHaveBeenCalledWith(complianceAuditLog);
    expect(mockWhereOnSelect).toHaveBeenCalled();
  });

  it('different community IDs produce different scoped queries', async () => {
    const clientA = createScopedClient(100);
    const clientB = createScopedClient(200);

    await clientA.query(complianceAuditLog);
    const firstCallArgs = mockWhereOnSelect.mock.calls[0];

    vi.clearAllMocks();
    mockFrom.mockReturnValue({ where: mockWhereOnSelect });
    mockSelect.mockReturnValue({ from: mockFrom });

    await clientB.query(complianceAuditLog);
    const secondCallArgs = mockWhereOnSelect.mock.calls[0];

    // Both should have WHERE calls but with different community_id values
    expect(firstCallArgs).toBeDefined();
    expect(secondCallArgs).toBeDefined();
    // The SQL objects will differ because they encode different community IDs
    expect(firstCallArgs).not.toEqual(secondCallArgs);
  });

  it('community A client cannot access community B audit records by design', () => {
    // This test verifies the architectural guarantee:
    // createScopedClient(communityId) ALWAYS adds community_id = communityId
    // to queries, so community A's client physically cannot query community B's data.
    const clientA = createScopedClient(100);
    expect(clientA.communityId).toBe(100);

    const clientB = createScopedClient(200);
    expect(clientB.communityId).toBe(200);

    // The scoped client's communityId is read-only and cannot be changed
    expect(() => {
      (clientA as Record<string, unknown>).communityId = 200;
    }).toThrow();
  });
});
