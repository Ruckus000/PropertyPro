/**
 * Route unit tests — `/api/v1/community/contact` (GET + PATCH).
 *
 * Added alongside the Plan A1 drain (drain #4). The route had no unit
 * test before; the migration adds isolated coverage of the auth chain,
 * admin gate, audit-log emission, demo-grace block, body validation,
 * and the runner's envelope wrapping.
 *
 * First drain that exercises the runner's `body` parsing path —
 * completes the four-runner-input matrix.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  assertNotDemoGraceMock,
  getCommunityContactMock,
  updateCommunityContactMock,
  logAuditEventMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  getCommunityContactMock: vi.fn(),
  updateCommunityContactMock: vi.fn(),
  logAuditEventMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/services/community-contact-service', () => ({
  getCommunityContact: getCommunityContactMock,
  updateCommunityContact: updateCommunityContactMock,
}));

vi.mock('@propertypro/db', () => ({
  logAuditEvent: logAuditEventMock,
}));

import { GET, PATCH } from '../../src/app/api/v1/community/contact/route';

const ADMIN_MEMBERSHIP = {
  userId: 'admin-1',
  communityId: 42,
  role: 'board_president' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Board President',
  communityType: 'condo_718' as const,
};

const MEMBER_MEMBERSHIP = {
  userId: 'member-1',
  communityId: 42,
  role: 'resident' as const,
  isAdmin: false,
  isUnitOwner: true,
  displayTitle: 'Owner',
  communityType: 'condo_718' as const,
};

const SAMPLE_CONTACT = {
  contactName: 'Jane Manager',
  contactEmail: 'jane@example.com',
  contactPhone: '555-0100',
};

interface ContactJson {
  data: { contactName: string | null; contactEmail: string | null; contactPhone: string | null };
}

function jsonPatch(payload: unknown, headers?: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/community/contact', {
    method: 'PATCH',
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json', ...(headers ?? {}) },
  });
}

describe('GET /api/v1/community/contact', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue(MEMBER_MEMBERSHIP);
  });

  it('returns the contact info for any community member', async () => {
    getCommunityContactMock.mockResolvedValue(SAMPLE_CONTACT);

    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/community/contact?communityId=42'),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as ContactJson;
    expect(json.data).toEqual(SAMPLE_CONTACT);
    expect(getCommunityContactMock).toHaveBeenCalledWith(42);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-1');
  });

  it('returns an all-null payload when the community has no contact set', async () => {
    getCommunityContactMock.mockResolvedValue({
      contactName: null,
      contactEmail: null,
      contactPhone: null,
    });

    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/community/contact?communityId=42'),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as ContactJson;
    expect(json.data).toEqual({ contactName: null, contactEmail: null, contactPhone: null });
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/community/contact?communityId=42'),
    );

    expect(res.status).toBe(401);
    expect(getCommunityContactMock).not.toHaveBeenCalled();
  });

  it('returns 403 when user is not a member of the requested community', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('Not a member of this community'),
    );

    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/community/contact?communityId=42'),
    );

    expect(res.status).toBe(403);
    expect(getCommunityContactMock).not.toHaveBeenCalled();
  });

  it('returns 400 when communityId is missing', async () => {
    const res = await GET(new NextRequest('http://localhost:3000/api/v1/community/contact'));

    expect(res.status).toBe(400);
    expect(getCommunityContactMock).not.toHaveBeenCalled();
  });

  it('returns 404 when x-community-id header disagrees with the query', async () => {
    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/community/contact?communityId=42', {
        headers: { 'x-community-id': '99' },
      }),
    );

    expect(res.status).toBe(404);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/community/contact', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('admin-1');
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
  });

  it('updates contact fields and emits the canonical audit-log event', async () => {
    updateCommunityContactMock.mockResolvedValue({
      updateData: { contactName: 'Jane M.', contactEmail: 'jane@new.example' },
      contact: { ...SAMPLE_CONTACT, contactName: 'Jane M.', contactEmail: 'jane@new.example' },
    });

    const res = await PATCH(
      jsonPatch({
        communityId: 42,
        contactName: 'Jane M.',
        contactEmail: 'jane@new.example',
      }),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as ContactJson;
    expect(json.data.contactName).toBe('Jane M.');
    expect(json.data.contactEmail).toBe('jane@new.example');
    expect(updateCommunityContactMock).toHaveBeenCalledWith(42, {
      contactName: 'Jane M.',
      contactEmail: 'jane@new.example',
      contactPhone: undefined,
    });
    expect(logAuditEventMock).toHaveBeenCalledWith({
      userId: 'admin-1',
      action: 'community.contact_updated',
      resourceType: 'community',
      resourceId: '42',
      communityId: 42,
      newValues: { contactName: 'Jane M.', contactEmail: 'jane@new.example' },
    });
  });

  it('accepts explicit null to clear a field', async () => {
    updateCommunityContactMock.mockResolvedValue({
      updateData: { contactPhone: null },
      contact: { ...SAMPLE_CONTACT, contactPhone: null },
    });

    const res = await PATCH(jsonPatch({ communityId: 42, contactPhone: null }));

    expect(res.status).toBe(200);
    expect(updateCommunityContactMock).toHaveBeenCalledWith(42, {
      contactName: undefined,
      contactEmail: undefined,
      contactPhone: null,
    });
  });

  it('returns 403 when the user is a member but not an admin', async () => {
    requireCommunityMembershipMock.mockResolvedValue(MEMBER_MEMBERSHIP);

    const res = await PATCH(
      jsonPatch({ communityId: 42, contactName: 'Jane M.' }),
    );

    expect(res.status).toBe(403);
    expect(updateCommunityContactMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await PATCH(jsonPatch({ communityId: 42, contactName: 'Jane M.' }));

    expect(res.status).toBe(401);
    expect(updateCommunityContactMock).not.toHaveBeenCalled();
  });

  it('blocks writes during demo grace window', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo expired'));

    const res = await PATCH(jsonPatch({ communityId: 42, contactName: 'Jane M.' }));

    expect(res.status).toBe(403);
    expect(updateCommunityContactMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('returns 400 when communityId is missing from body', async () => {
    const res = await PATCH(jsonPatch({ contactName: 'Jane M.' }));

    expect(res.status).toBe(400);
    expect(updateCommunityContactMock).not.toHaveBeenCalled();
  });

  it('returns 400 when contactEmail is not a valid email', async () => {
    const res = await PATCH(
      jsonPatch({ communityId: 42, contactEmail: 'not-an-email' }),
    );

    expect(res.status).toBe(400);
    expect(updateCommunityContactMock).not.toHaveBeenCalled();
  });

  it('returns 404 when x-community-id header disagrees with body communityId', async () => {
    const res = await PATCH(
      jsonPatch(
        { communityId: 42, contactName: 'Jane M.' },
        { 'x-community-id': '99' },
      ),
    );

    expect(res.status).toBe(404);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(updateCommunityContactMock).not.toHaveBeenCalled();
  });
});
