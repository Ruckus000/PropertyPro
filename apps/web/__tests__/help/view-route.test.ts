/**
 * Unit tests for /api/v1/help/view POST.
 *
 * Scope:
 * - Happy path records a view (201)
 * - Validation failures surface as errors
 * - Auth + membership are required
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  scopedInsertMock,
  createScopedClientMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
} = vi.hoisted(() => ({
  scopedInsertMock: vi.fn(),
  createScopedClientMock: vi.fn(),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  helpArticleViews: { __table: 'help_article_views' },
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/api/tenant-context', () => ({
  resolveEffectiveCommunityId: resolveEffectiveCommunityIdMock,
}));

vi.mock('@/lib/api/error-handler', () => ({
  withErrorHandler: (handler: unknown) => handler,
}));

vi.mock('@/lib/api/errors/ValidationError', () => ({
  ValidationError: class ValidationError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'ValidationError';
    }
  },
}));

import { POST } from '../../src/app/api/v1/help/view/route';

function makeJsonRequest(url: string, body: unknown) {
  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST /api/v1/help/view', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue({ role: 'owner' });
    resolveEffectiveCommunityIdMock.mockReturnValue(1);
    createScopedClientMock.mockReturnValue({
      insert: scopedInsertMock,
    });
  });

  it('records a view and returns 201', async () => {
    scopedInsertMock.mockResolvedValue([{ id: 1 }]);

    const response = await POST(
      makeJsonRequest('/api/v1/help/view', {
        communityId: 1,
        articleSlug: 'welcome-to-propertypro',
        articleCategory: 'getting-started',
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.ok).toBe(true);
    expect(scopedInsertMock).toHaveBeenCalledTimes(1);
    const [table, data] = scopedInsertMock.mock.calls[0]!;
    expect(table).toEqual({ __table: 'help_article_views' });
    expect(data).toMatchObject({
      userId: 'user-1',
      articleSlug: 'welcome-to-propertypro',
      articleCategory: 'getting-started',
    });
  });

  it('rejects invalid payloads', async () => {
    await expect(
      POST(
        makeJsonRequest('/api/v1/help/view', {
          communityId: 1,
          articleSlug: '',
          articleCategory: 'getting-started',
        }),
      ),
    ).rejects.toThrow(/Invalid/i);
    expect(scopedInsertMock).not.toHaveBeenCalled();
  });

  it('propagates auth errors from requireAuthenticatedUserId', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new Error('Unauthenticated'));

    await expect(
      POST(
        makeJsonRequest('/api/v1/help/view', {
          communityId: 1,
          articleSlug: 'welcome-to-propertypro',
          articleCategory: 'getting-started',
        }),
      ),
    ).rejects.toThrow('Unauthenticated');
    expect(scopedInsertMock).not.toHaveBeenCalled();
  });
});
