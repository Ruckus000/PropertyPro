/**
 * Route unit tests — `PATCH /api/v1/account/profile`.
 *
 * Added alongside Plan A1 drain #9 (session-anchored body-parsing PATCH,
 * mirrors drain #4 community/contact PATCH in shape).
 *
 * The route had no unit test before the migration. Covers:
 *   - happy paths (both fields, fullName only, phone only, phone-clear-via-null)
 *   - Supabase admin auth sync conditional (fires only on truthy fullName)
 *   - 401 unauthenticated
 *   - 400 body validation (empty body, no fields to update, bad fullName, bad phone)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  updateUserProfileMock,
  updateUserByIdMock,
  createAdminClientMock,
} = vi.hoisted(() => {
  const updateUserByIdMockInner = vi.fn();
  return {
    requireAuthenticatedUserIdMock: vi.fn(),
    updateUserProfileMock: vi.fn(),
    updateUserByIdMock: updateUserByIdMockInner,
    createAdminClientMock: vi.fn(() => ({
      auth: {
        admin: {
          updateUserById: updateUserByIdMockInner,
        },
      },
    })),
  };
});

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/services/user-profile-service', () => ({
  updateUserProfile: updateUserProfileMock,
}));

vi.mock('@propertypro/db', () => ({
  createAdminClient: createAdminClientMock,
}));

import { PATCH } from '../../src/app/api/v1/account/profile/route';

const FIXED_DATE = new Date('2026-05-22T15:30:00.000Z');

interface ProfileJson {
  data: {
    userId: string;
    updatedAt: string;
    fullName?: string;
    phone?: string | null;
  };
}

interface ErrorJson {
  error?: { code?: string; message?: string };
}

function jsonPatch(payload: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/account/profile', {
    method: 'PATCH',
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json' },
  });
}

function emptyBodyPatch(): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/account/profile', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
  });
}

describe('PATCH /api/v1/account/profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
  });

  it('updates both fullName and phone, syncs auth metadata, and echoes both fields back', async () => {
    updateUserProfileMock.mockResolvedValue({
      updatedAt: FIXED_DATE,
      changedFields: { fullName: 'Jane Doe', phone: '555-0100' },
    });

    const res = await PATCH(
      jsonPatch({ fullName: 'Jane Doe', phone: '555-0100' }),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as ProfileJson;
    expect(json.data).toEqual({
      userId: 'user-1',
      updatedAt: FIXED_DATE.toISOString(),
      fullName: 'Jane Doe',
      phone: '555-0100',
    });
    expect(updateUserProfileMock).toHaveBeenCalledWith('user-1', {
      fullName: 'Jane Doe',
      phone: '555-0100',
    });
    expect(createAdminClientMock).toHaveBeenCalledTimes(1);
    expect(updateUserByIdMock).toHaveBeenCalledWith('user-1', {
      user_metadata: { full_name: 'Jane Doe' },
    });
  });

  it('updates phone only and does NOT trigger the auth sync', async () => {
    updateUserProfileMock.mockResolvedValue({
      updatedAt: FIXED_DATE,
      changedFields: { phone: '555-0200' },
    });

    const res = await PATCH(jsonPatch({ phone: '555-0200' }));

    expect(res.status).toBe(200);
    const json = (await res.json()) as ProfileJson;
    expect(json.data).toEqual({
      userId: 'user-1',
      updatedAt: FIXED_DATE.toISOString(),
      phone: '555-0200',
    });
    expect(json.data.fullName).toBeUndefined();
    expect(updateUserProfileMock).toHaveBeenCalledWith('user-1', {
      fullName: undefined,
      phone: '555-0200',
    });
    expect(createAdminClientMock).not.toHaveBeenCalled();
    expect(updateUserByIdMock).not.toHaveBeenCalled();
  });

  it('updates fullName only and DOES trigger the auth sync', async () => {
    updateUserProfileMock.mockResolvedValue({
      updatedAt: FIXED_DATE,
      changedFields: { fullName: 'Solo Name' },
    });

    const res = await PATCH(jsonPatch({ fullName: 'Solo Name' }));

    expect(res.status).toBe(200);
    const json = (await res.json()) as ProfileJson;
    expect(json.data).toEqual({
      userId: 'user-1',
      updatedAt: FIXED_DATE.toISOString(),
      fullName: 'Solo Name',
    });
    expect(updateUserProfileMock).toHaveBeenCalledWith('user-1', {
      fullName: 'Solo Name',
      phone: undefined,
    });
    expect(createAdminClientMock).toHaveBeenCalledTimes(1);
    expect(updateUserByIdMock).toHaveBeenCalledWith('user-1', {
      user_metadata: { full_name: 'Solo Name' },
    });
  });

  it('accepts explicit null to clear phone and does NOT trigger the auth sync', async () => {
    updateUserProfileMock.mockResolvedValue({
      updatedAt: FIXED_DATE,
      changedFields: { phone: null },
    });

    const res = await PATCH(jsonPatch({ phone: null }));

    expect(res.status).toBe(200);
    const json = (await res.json()) as ProfileJson;
    expect(json.data).toEqual({
      userId: 'user-1',
      updatedAt: FIXED_DATE.toISOString(),
      phone: null,
    });
    expect(updateUserProfileMock).toHaveBeenCalledWith('user-1', {
      fullName: undefined,
      phone: null,
    });
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated and does not touch the service', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await PATCH(jsonPatch({ fullName: 'Jane Doe' }));

    expect(res.status).toBe(401);
    expect(updateUserProfileMock).not.toHaveBeenCalled();
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it('returns 400 when the body is empty / not JSON', async () => {
    const res = await PATCH(emptyBodyPatch());

    expect(res.status).toBe(400);
    expect(updateUserProfileMock).not.toHaveBeenCalled();
  });

  it('returns 400 "No fields to update" when both fullName and phone are absent', async () => {
    const res = await PATCH(jsonPatch({}));

    expect(res.status).toBe(400);
    const json = (await res.json()) as ErrorJson;
    expect(json.error?.message).toBe('No fields to update');
    expect(updateUserProfileMock).not.toHaveBeenCalled();
  });

  it('returns 400 when fullName is an empty string', async () => {
    const res = await PATCH(jsonPatch({ fullName: '' }));

    expect(res.status).toBe(400);
    expect(updateUserProfileMock).not.toHaveBeenCalled();
  });

  it('returns 400 when phone exceeds 30 characters', async () => {
    const res = await PATCH(jsonPatch({ phone: '1'.repeat(31) }));

    expect(res.status).toBe(400);
    expect(updateUserProfileMock).not.toHaveBeenCalled();
  });
});
