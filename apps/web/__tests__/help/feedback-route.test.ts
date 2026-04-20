/**
 * Unit tests for /api/v1/help/feedback (GET + POST).
 *
 * Scope:
 * - GET returns the current user's rating (or null)
 * - POST creates (201) when no row exists, updates (200) on re-submit
 * - POST recovers from a concurrent unique-violation by falling through to UPDATE
 * - Validation and auth failures surface as errors (caller's error handler converts to HTTP)
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  scopedInsertMock,
  scopedUpdateMock,
  scopedSelectFromMock,
  createScopedClientMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
} = vi.hoisted(() => ({
  scopedInsertMock: vi.fn(),
  scopedUpdateMock: vi.fn(),
  scopedSelectFromMock: vi.fn(),
  createScopedClientMock: vi.fn(),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  helpArticleFeedback: { __table: 'help_article_feedback' },
  helpArticleViews: { __table: 'help_article_views' },
}));

vi.mock('@propertypro/db/filters', () => ({
  and: (...parts: unknown[]) => ({ __type: 'and', parts }),
  eq: (col: unknown, value: unknown) => ({ __type: 'eq', col, value }),
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

import { GET, POST } from '../../src/app/api/v1/help/feedback/route';

function makeJsonRequest(url: string, body: unknown) {
  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function makeGetRequest(url: string) {
  return new NextRequest(new URL(url, 'http://localhost:3000'));
}

const validPost = {
  communityId: 1,
  articleSlug: 'welcome-to-propertypro',
  articleCategory: 'getting-started',
  rating: 1 as const,
};

describe('POST /api/v1/help/feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue({ role: 'owner' });
    resolveEffectiveCommunityIdMock.mockReturnValue(1);
    createScopedClientMock.mockReturnValue({
      insert: scopedInsertMock,
      update: scopedUpdateMock,
      selectFrom: scopedSelectFromMock,
    });
  });

  it('creates a feedback row (201) when no prior row exists', async () => {
    scopedInsertMock.mockResolvedValue([{ id: 1, rating: 1, comment: null }]);

    const response = await POST(makeJsonRequest('/api/v1/help/feedback', validPost));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.data).toMatchObject({ id: 1, rating: 1 });
    expect(scopedInsertMock).toHaveBeenCalledTimes(1);
    expect(scopedUpdateMock).not.toHaveBeenCalled();
  });

  it('updates (200) when INSERT trips the unique constraint', async () => {
    scopedInsertMock.mockRejectedValueOnce({
      code: '23505',
      message: 'duplicate key value violates unique constraint',
    });
    scopedUpdateMock.mockResolvedValue([{ id: 1, rating: -1, comment: 'too short' }]);

    const response = await POST(
      makeJsonRequest('/api/v1/help/feedback', {
        ...validPost,
        rating: -1,
        comment: 'too short',
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toMatchObject({ id: 1, rating: -1, comment: 'too short' });
    expect(scopedInsertMock).toHaveBeenCalledTimes(1);
    expect(scopedUpdateMock).toHaveBeenCalledTimes(1);
  });

  it('rethrows non-unique errors instead of silently falling back to UPDATE', async () => {
    scopedInsertMock.mockRejectedValueOnce(new Error('connection refused'));

    await expect(
      POST(makeJsonRequest('/api/v1/help/feedback', validPost)),
    ).rejects.toThrow('connection refused');
    expect(scopedUpdateMock).not.toHaveBeenCalled();
  });

  it('also recognizes unique violations wrapped in a PostgresError cause chain', async () => {
    scopedInsertMock.mockRejectedValueOnce({
      message: 'Failed query: insert ...',
      cause: { code: '23505' },
    });
    scopedUpdateMock.mockResolvedValue([{ id: 1, rating: 1, comment: null }]);

    const response = await POST(makeJsonRequest('/api/v1/help/feedback', validPost));
    expect(response.status).toBe(200);
    expect(scopedUpdateMock).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid payloads with a ValidationError', async () => {
    await expect(
      POST(
        makeJsonRequest('/api/v1/help/feedback', {
          communityId: 1,
          articleSlug: 'welcome',
          articleCategory: 'x',
          rating: 5 as unknown as 1,
        }),
      ),
    ).rejects.toThrow(/Invalid/i);
    expect(scopedInsertMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/help/feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue({ role: 'owner' });
    resolveEffectiveCommunityIdMock.mockReturnValue(1);
    createScopedClientMock.mockReturnValue({
      insert: scopedInsertMock,
      update: scopedUpdateMock,
      selectFrom: scopedSelectFromMock,
    });
  });

  it('returns the current rating when one exists', async () => {
    scopedSelectFromMock.mockResolvedValue([
      { rating: 1, comment: 'nice', updatedAt: new Date('2026-04-19') },
    ]);

    const response = await GET(
      makeGetRequest('/api/v1/help/feedback?communityId=1&articleSlug=welcome-to-propertypro'),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toMatchObject({ rating: 1, comment: 'nice' });
  });

  it('returns null data when no prior rating exists', async () => {
    scopedSelectFromMock.mockResolvedValue([]);

    const response = await GET(
      makeGetRequest('/api/v1/help/feedback?communityId=1&articleSlug=welcome-to-propertypro'),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toBeNull();
  });

  it('throws ValidationError when required query params are missing', async () => {
    await expect(
      GET(makeGetRequest('/api/v1/help/feedback')),
    ).rejects.toThrow(/Invalid/i);
  });
});
