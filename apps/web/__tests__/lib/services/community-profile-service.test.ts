import { describe, it, expect, vi, beforeEach } from 'vitest';

const { createScopedClientMock, logAuditEventMock, queryMock, updateMock } = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  queryMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  logAuditEvent: logAuditEventMock,
  communities: { id: 'communities.id', name: 'communities.name' },
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
}));

import {
  getCommunityName,
  updateCommunityName,
} from '@/lib/services/community-profile-service';

beforeEach(() => {
  vi.clearAllMocks();
  createScopedClientMock.mockReturnValue({ query: queryMock, update: updateMock });
  logAuditEventMock.mockResolvedValue(undefined);
});

describe('getCommunityName', () => {
  it('returns the row name', async () => {
    queryMock.mockResolvedValueOnce([{ name: 'Sunset Condos' }]);
    expect(await getCommunityName(42)).toBe('Sunset Condos');
  });

  it('returns null when the row is missing', async () => {
    queryMock.mockResolvedValueOnce([]);
    expect(await getCommunityName(42)).toBeNull();
  });
});

describe('updateCommunityName', () => {
  it('writes the new name and emits a community update audit entry', async () => {
    queryMock.mockResolvedValueOnce([{ name: 'Old Name' }]); // previous
    updateMock.mockResolvedValueOnce([{ name: 'New Name' }]);

    const result = await updateCommunityName(42, 'New Name', { actorUserId: 'user-1' });

    expect(result).toEqual({ name: 'New Name', changed: true });
    expect(updateMock).toHaveBeenCalledWith(
      { id: 'communities.id', name: 'communities.name' },
      { name: 'New Name' },
      { __eq: { col: 'communities.id', val: 42 } },
    );
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        communityId: 42,
        action: 'update',
        resourceType: 'community',
        resourceId: '42',
        oldValues: { name: 'Old Name' },
        newValues: { name: 'New Name' },
      }),
    );
  });

  it('no-ops (no write, no audit) when the name is unchanged', async () => {
    queryMock.mockResolvedValueOnce([{ name: 'Same Name' }]);

    const result = await updateCommunityName(42, 'Same Name', { actorUserId: 'user-1' });

    expect(result).toEqual({ name: 'Same Name', changed: false });
    expect(updateMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });
});
