/**
 * Unit tests for community data export service (P4-64).
 *
 * Tests cover:
 * - Correct CSV headers for each export type
 * - ISO 8601 date formatting
 * - Truncation flag when row limit is reached
 * - Empty dataset handling
 * - Formula-injection sanitization via generateCSV
 * - Unscoped users lookup for residents export
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  createScopedClientMock,
  createUnscopedClientMock,
  unscopedSelectMock,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  createUnscopedClientMock: vi.fn(),
  unscopedSelectMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  userRoles: { id: Symbol('userRoles') },
  users: {
    id: Symbol('users.id'),
    fullName: Symbol('users.fullName'),
    email: Symbol('users.email'),
  },
  documents: { id: Symbol('documents') },
  maintenanceRequests: { id: Symbol('maintenanceRequests') },
  announcements: { id: Symbol('announcements') },
  units: { id: Symbol('units') },
}));

vi.mock('@propertypro/db/filters', () => ({
  inArray: vi.fn((_col, ids) => ({ _type: 'inArray', ids })),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: createUnscopedClientMock,
}));

import {
  exportResidents,
  exportDocuments,
  exportMaintenanceRequests,
  exportAnnouncements,
} from '../../src/lib/services/community-export';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a chainable + thenable result for selectFrom.
 * - If .limit() is called, returns a Promise resolving to the rows.
 * - If awaited directly (no .limit()), resolves to the rows via .then().
 */
function makeSelectResult(rows: unknown[]) {
  const limitFn = vi.fn().mockResolvedValue(rows);
  return {
    limit: limitFn,
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(rows).then(resolve, reject),
  };
}

function makeScopedClient(selectFromRows: unknown[] = []) {
  const selectFromFn = vi.fn().mockReturnValue(makeSelectResult(selectFromRows));
  return { selectFrom: selectFromFn };
}

function makeUnscopedClient(rows: unknown[] = []) {
  const whereFn = vi.fn().mockResolvedValue(rows);
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  const selectFn = vi.fn().mockReturnValue({ from: fromFn });
  unscopedSelectMock.mockReturnValue({ from: fromFn });
  createUnscopedClientMock.mockReturnValue({ select: selectFn });
  return { select: selectFn, from: fromFn, where: whereFn };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('community-export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // exportResidents
  // -------------------------------------------------------------------------

  describe('exportResidents', () => {
    it('returns CSV with correct headers', async () => {
      // Empty roles → no unit/user queries needed, only the userRoles selectFrom fires
      const scoped = makeScopedClient([]);
      createScopedClientMock.mockReturnValue(scoped);

      const result = await exportResidents(1);

      expect(result.filename).toBe('residents.csv');
      expect(result.content).toContain('User ID');
      expect(result.content).toContain('Full Name');
      expect(result.content).toContain('Email');
      expect(result.content).toContain('Role');
      expect(result.content).toContain('Unit Number');
      expect(result.content).toContain('Member Since');
      expect(result.rowCount).toBe(0);
      expect(result.truncated).toBe(false);
    });

    it('joins user details from unscoped lookup', async () => {
      const roleRows = [
        { userId: 'u1', role: 'owner', unitId: 10, createdAt: new Date('2026-01-01T00:00:00Z') },
      ];
      const unitRows = [{ id: 10, unitNumber: 'A101' }];
      const scoped = makeScopedClient();
      scoped.selectFrom
        .mockReturnValueOnce(makeSelectResult(roleRows))
        .mockReturnValueOnce(makeSelectResult(unitRows));
      createScopedClientMock.mockReturnValue(scoped);

      makeUnscopedClient([{ id: 'u1', fullName: 'Alice Smith', email: 'alice@test.com' }]);

      const result = await exportResidents(1);

      expect(result.content).toContain('Alice Smith');
      expect(result.content).toContain('alice@test.com');
      expect(result.content).toContain('A101');
      expect(result.content).toContain('2026-01-01T00:00:00.000Z');
      expect(result.rowCount).toBe(1);
    });

    it('handles missing user gracefully', async () => {
      const roleRows = [
        { userId: 'u-gone', role: 'tenant', unitId: null, createdAt: new Date('2026-02-01') },
      ];
      // unitId is null → only userRoles selectFrom fires; units query skipped
      const scoped = makeScopedClient(roleRows);
      createScopedClientMock.mockReturnValue(scoped);

      makeUnscopedClient([]); // No users found

      const result = await exportResidents(1);
      // Should still produce a row, just with empty name/email
      expect(result.rowCount).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // exportDocuments
  // -------------------------------------------------------------------------

  describe('exportDocuments', () => {
    it('returns CSV with correct headers', async () => {
      const scoped = makeScopedClient([]);
      createScopedClientMock.mockReturnValue(scoped);

      const result = await exportDocuments(1);

      expect(result.filename).toBe('documents.csv');
      expect(result.content).toContain('Title');
      expect(result.content).toContain('File Name');
      expect(result.content).toContain('MIME Type');
      expect(result.rowCount).toBe(0);
    });

    it('formats dates as ISO 8601', async () => {
      const scoped = makeScopedClient([
        {
          id: 1,
          title: 'Test',
          description: '',
          fileName: 'test.pdf',
          fileSize: 1024,
          mimeType: 'application/pdf',
          categoryId: 5,
          createdAt: new Date('2026-03-15T10:30:00Z'),
          updatedAt: new Date('2026-03-16T08:00:00Z'),
        },
      ]);
      createScopedClientMock.mockReturnValue(scoped);

      const result = await exportDocuments(1);

      expect(result.content).toContain('2026-03-15T10:30:00.000Z');
      expect(result.content).toContain('2026-03-16T08:00:00.000Z');
    });

    it('sets truncated=true at row limit', async () => {
      const rows = Array.from({ length: 10_000 }, (_, i) => ({
        id: i + 1,
        title: `Doc ${i}`,
        description: '',
        fileName: '',
        fileSize: 0,
        mimeType: '',
        categoryId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
      const scoped = makeScopedClient(rows);
      createScopedClientMock.mockReturnValue(scoped);

      const result = await exportDocuments(1);
      expect(result.truncated).toBe(true);
      expect(result.rowCount).toBe(10_000);
    });
  });

  // -------------------------------------------------------------------------
  // exportMaintenanceRequests
  // -------------------------------------------------------------------------

  describe('exportMaintenanceRequests', () => {
    it('returns CSV with correct headers', async () => {
      const scoped = makeScopedClient([]);
      createScopedClientMock.mockReturnValue(scoped);

      const result = await exportMaintenanceRequests(1);

      expect(result.filename).toBe('maintenance-requests.csv');
      expect(result.content).toContain('Status');
      expect(result.content).toContain('Priority');
      expect(result.content).toContain('Resolution');
      expect(result.rowCount).toBe(0);
    });

    it('handles all date fields correctly', async () => {
      const scoped = makeScopedClient([
        {
          id: 1,
          title: 'Leak',
          description: 'Kitchen sink',
          status: 'resolved',
          priority: 'high',
          category: 'plumbing',
          submittedById: 'u1',
          assignedToId: 'u2',
          resolutionDescription: 'Fixed pipe',
          resolutionDate: new Date('2026-02-20T14:00:00Z'),
          createdAt: new Date('2026-02-18T09:00:00Z'),
          updatedAt: new Date('2026-02-20T14:30:00Z'),
        },
      ]);
      createScopedClientMock.mockReturnValue(scoped);

      const result = await exportMaintenanceRequests(1);

      expect(result.content).toContain('2026-02-20T14:00:00.000Z');
      expect(result.content).toContain('2026-02-18T09:00:00.000Z');
    });
  });

  // -------------------------------------------------------------------------
  // exportAnnouncements
  // -------------------------------------------------------------------------

  describe('exportAnnouncements', () => {
    it('returns CSV with correct headers', async () => {
      const scoped = makeScopedClient([]);
      createScopedClientMock.mockReturnValue(scoped);

      const result = await exportAnnouncements(1);

      expect(result.filename).toBe('announcements.csv');
      expect(result.content).toContain('Audience');
      expect(result.content).toContain('Pinned');
      expect(result.rowCount).toBe(0);
    });

    it('converts isPinned to Yes/No', async () => {
      const scoped = makeScopedClient([
        {
          id: 1,
          title: 'Pinned',
          body: 'body',
          audience: 'all',
          isPinned: true,
          archivedAt: null,
          publishedBy: 'u1',
          publishedAt: new Date('2026-02-01'),
          createdAt: new Date('2026-02-01'),
        },
        {
          id: 2,
          title: 'Not pinned',
          body: 'body2',
          audience: 'board',
          isPinned: false,
          archivedAt: null,
          publishedBy: 'u2',
          publishedAt: new Date('2026-02-02'),
          createdAt: new Date('2026-02-02'),
        },
      ]);
      createScopedClientMock.mockReturnValue(scoped);

      const result = await exportAnnouncements(1);

      const lines = result.content.split('\r\n');
      // Line 1 (first data row) should contain Yes
      expect(lines[1]).toContain('Yes');
      // Line 2 (second data row) should contain No
      expect(lines[2]).toContain('No');
    });

    it('handles formula injection via generateCSV', async () => {
      const scoped = makeScopedClient([
        {
          id: 1,
          title: '=CMD()',
          body: '+evil',
          audience: 'all',
          isPinned: false,
          archivedAt: null,
          publishedBy: 'u1',
          publishedAt: new Date('2026-01-01'),
          createdAt: new Date('2026-01-01'),
        },
      ]);
      createScopedClientMock.mockReturnValue(scoped);

      const result = await exportAnnouncements(1);

      // Formula injection chars should be prefixed with apostrophe
      expect(result.content).toContain("'=CMD()");
      expect(result.content).toContain("'+evil");
    });
  });
});
