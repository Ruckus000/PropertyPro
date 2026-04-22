import { describe, expect, it, vi } from 'vitest';

// Mock @propertypro/db so the module can be imported without a built package or DATABASE_URL
vi.mock('@propertypro/db', () => ({
  createScopedClient: vi.fn(),
  maintenanceRequests: Symbol('maintenanceRequests'),
  workOrders: Symbol('workOrders'),
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  or: vi.fn(),
  lt: vi.fn(),
  lte: vi.fn(),
  desc: vi.fn(),
}));

import {
  encodeOperationsCursorForTests,
  decodeOperationsCursorForTests,
} from '@/lib/services/operations-service';

describe('operations-service cursor compat', () => {
  it('decodes a legacy Phase 1 cursor (maintenance_request) via the guard', () => {
    const cursor = encodeOperationsCursorForTests({
      createdAt: '2026-04-01T12:00:00.000Z',
      id: 42,
      type: 'maintenance_request',
    });
    const payload = decodeOperationsCursorForTests(cursor);
    expect(payload.type).toBe('maintenance_request');
    expect(payload.id).toBe(42);
    expect(payload.createdAt).toBe('2026-04-01T12:00:00.000Z');
  });

  it('decodes a legacy Phase 1 cursor (work_order) via the guard', () => {
    const cursor = encodeOperationsCursorForTests({
      createdAt: '2026-04-01T12:00:00.000Z',
      id: 77,
      type: 'work_order',
    });
    const payload = decodeOperationsCursorForTests(cursor);
    expect(payload.type).toBe('work_order');
  });

  it('round-trips the new reservation cursor type via the guard', () => {
    const cursor = encodeOperationsCursorForTests({
      createdAt: '2026-04-01T12:00:00.000Z',
      id: 9,
      type: 'reservation',
    });
    const payload = decodeOperationsCursorForTests(cursor);
    expect(payload.type).toBe('reservation');
    expect(payload.id).toBe(9);
  });

  it('rejects cursors with an unknown type', () => {
    // Hand-craft a cursor with an invalid type — the decode guard must throw.
    const malformed = Buffer.from(
      JSON.stringify({ createdAt: '2026-04-01T12:00:00.000Z', id: 1, type: 'unknown_type' }),
      'utf8',
    ).toString('base64url');
    expect(() => decodeOperationsCursorForTests(malformed)).toThrow();
  });
});
