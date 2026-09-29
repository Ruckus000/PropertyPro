import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../../src/lib/api/errors/ForbiddenError';

const {
  requireAuthenticatedUserIdMock,
  claimRootMock,
  claimAllRootsMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  claimRootMock: vi.fn(),
  claimAllRootsMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/services/claim-root-service', () => ({
  claimRoot: claimRootMock,
  claimAllRoots: claimAllRootsMock,
}));

import { POST } from '../../../src/app/api/v1/communities/claim-root/route';

function postReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/communities/claim-root', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/v1/communities/claim-root', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('pm-1');
  });

  it('claims a single community for a property_manager → 200 with results', async () => {
    claimRootMock.mockResolvedValue({ communityId: 42, claimed: true });

    const res = await POST(postReq({ communityId: 42 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ data: { results: [{ communityId: 42, claimed: true }] } });
    expect(claimRootMock).toHaveBeenCalledWith('pm-1', 42);
    expect(claimAllRootsMock).not.toHaveBeenCalled();
  });

  it('claimAll → aggregated per-community results', async () => {
    claimAllRootsMock.mockResolvedValue([
      { communityId: 1, claimed: true },
      { communityId: 2, claimed: false, reason: 'already_claimed' },
    ]);

    const res = await POST(postReq({ claimAll: true }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.results).toHaveLength(2);
    expect(claimAllRootsMock).toHaveBeenCalledWith('pm-1');
    expect(claimRootMock).not.toHaveBeenCalled();
  });

  it('non-PM → 403 (service ForbiddenError surfaced by withErrorHandler)', async () => {
    claimRootMock.mockRejectedValue(new ForbiddenError('Only a property manager of this community can claim root.'));

    const res = await POST(postReq({ communityId: 99 }));
    expect(res.status).toBe(403);
  });

  it('neither communityId nor claimAll → 400 (refine)', async () => {
    const res = await POST(postReq({}));
    expect(res.status).toBe(400);
  });

  describe('under a support session consented for community 42', () => {
    function supportPost(body: unknown, communityId: string | null = '42'): NextRequest {
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        'x-support-session-id': '7',
      };
      if (communityId !== null) headers['x-support-community-id'] = communityId;
      return new NextRequest('http://localhost:3000/api/v1/communities/claim-root', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    }

    it('claimAll → 403 and claims nothing', async () => {
      const res = await POST(supportPost({ claimAll: true }));
      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toMatchObject({
        error: { message: 'Not available during a support session' },
      });
      expect(claimAllRootsMock).not.toHaveBeenCalled();
      expect(claimRootMock).not.toHaveBeenCalled();
    });

    it('a single claim on ANOTHER community → 403', async () => {
      const res = await POST(supportPost({ communityId: 99 }));
      expect(res.status).toBe(403);
      expect(claimRootMock).not.toHaveBeenCalled();
    });

    it('a single claim when the session community is unreadable → 403 (fail closed)', async () => {
      const res = await POST(supportPost({ communityId: 42 }, null));
      expect(res.status).toBe(403);
      expect(claimRootMock).not.toHaveBeenCalled();
    });

    it('a single claim on the consented community proceeds', async () => {
      claimRootMock.mockResolvedValue({ communityId: 42, claimed: true });

      const res = await POST(supportPost({ communityId: 42 }));
      expect(res.status).toBe(200);
      expect(claimRootMock).toHaveBeenCalledWith('pm-1', 42);
    });
  });
});
