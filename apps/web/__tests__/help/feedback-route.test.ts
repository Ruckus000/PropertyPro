/**
 * Unit tests for /api/v1/help/feedback (GET + POST).
 *
 * Scope:
 * - GET returns the current user's rating (or null)
 * - POST returns 201 when the service reports `created`, 200 when it
 *   reports an update
 * - Service-level errors propagate through the route
 * - Validation and auth failures surface as errors (caller's error handler converts to HTTP)
 *
 * The route delegates DB access to `help-feedback-service` (Plan A3 Phase 2);
 * the unique-violation upsert lives there. These tests mock the service
 * boundary, not `@propertypro/db`.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  getMyArticleFeedbackMock,
  upsertArticleFeedbackMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
} = vi.hoisted(() => ({
  getMyArticleFeedbackMock: vi.fn(),
  upsertArticleFeedbackMock: vi.fn(),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
}));

vi.mock('@/lib/services/help-feedback-service', () => ({
  getMyArticleFeedback: getMyArticleFeedbackMock,
  upsertArticleFeedback: upsertArticleFeedbackMock,
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

vi.mock('@sentry/nextjs', () => ({
  captureMessage: vi.fn(),
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
  });

  it('returns 201 when the service reports the row was created', async () => {
    upsertArticleFeedbackMock.mockResolvedValue({
      row: { id: 1, rating: 1, comment: null },
      created: true,
    });

    const response = await POST(makeJsonRequest('/api/v1/help/feedback', validPost));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toMatchObject({ id: 1, rating: 1 });
    expect(upsertArticleFeedbackMock).toHaveBeenCalledTimes(1);
    expect(upsertArticleFeedbackMock).toHaveBeenCalledWith({
      communityId: 1,
      userId: 'user-1',
      articleSlug: 'welcome-to-propertypro',
      articleCategory: 'getting-started',
      rating: 1,
      comment: null,
    });
  });

  it('returns 200 when the service reports an existing row was updated', async () => {
    upsertArticleFeedbackMock.mockResolvedValue({
      row: { id: 1, rating: -1, comment: 'too short' },
      created: false,
    });

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
    expect(upsertArticleFeedbackMock).toHaveBeenCalledWith(
      expect.objectContaining({ rating: -1, comment: 'too short' }),
    );
  });

  it('propagates non-unique service errors to the caller', async () => {
    upsertArticleFeedbackMock.mockRejectedValueOnce(new Error('connection refused'));

    await expect(
      POST(makeJsonRequest('/api/v1/help/feedback', validPost)),
    ).rejects.toThrow('connection refused');
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
    expect(upsertArticleFeedbackMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/help/feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue({ role: 'owner' });
    resolveEffectiveCommunityIdMock.mockReturnValue(1);
  });

  it('returns the current rating when one exists', async () => {
    getMyArticleFeedbackMock.mockResolvedValue({
      rating: 1,
      comment: 'nice',
      updatedAt: new Date('2026-04-19'),
    });

    const response = await GET(
      makeGetRequest('/api/v1/help/feedback?communityId=1&articleSlug=welcome-to-propertypro'),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toMatchObject({ rating: 1, comment: 'nice' });
    expect(getMyArticleFeedbackMock).toHaveBeenCalledWith(
      1,
      'user-1',
      'welcome-to-propertypro',
    );
  });

  it('returns null data when no prior rating exists', async () => {
    getMyArticleFeedbackMock.mockResolvedValue(null);

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
