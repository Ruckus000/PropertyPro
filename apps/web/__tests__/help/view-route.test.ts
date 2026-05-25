/**
 * Unit tests for /api/v1/help/view POST.
 *
 * Scope:
 * - Happy path records a view (201)
 * - Validation failures surface as errors
 * - Auth + membership are required
 *
 * The route delegates the actual DB write to `recordArticleView` in
 * `help-views-service`; this test mocks that service boundary.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  recordArticleViewMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
} = vi.hoisted(() => ({
  recordArticleViewMock: vi.fn(),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
}));

vi.mock('@/lib/services/help-views-service', () => ({
  recordArticleView: recordArticleViewMock,
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
    recordArticleViewMock.mockResolvedValue(undefined);
  });

  it('records a view and returns 201', async () => {
    const response = await POST(
      makeJsonRequest('/api/v1/help/view', {
        communityId: 1,
        articleSlug: 'welcome-to-propertypro',
        articleCategory: 'getting-started',
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json).toEqual({ data: { ok: true } });
    expect(recordArticleViewMock).toHaveBeenCalledTimes(1);
    expect(recordArticleViewMock).toHaveBeenCalledWith({
      communityId: 1,
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
    expect(recordArticleViewMock).not.toHaveBeenCalled();
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
    expect(recordArticleViewMock).not.toHaveBeenCalled();
  });
});
