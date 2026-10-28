/**
 * Route unit tests — `GET` and `PATCH /api/v1/community/profile`.
 *
 * The profile is the association's name, address, office hours and public
 * contact details, and the public website shows it. So who may read or change
 * it, what reaches the service, and what the contract refuses are the whole
 * point. Same harness as unit-count-route.test.ts and contact-route.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { AppError } from '../../src/lib/api/errors/AppError';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  assertNotDemoGraceMock,
  requireEntitledForAdminReadMock,
  getCommunityProfileMock,
  updateCommunityProfileMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  requireEntitledForAdminReadMock: vi.fn(),
  getCommunityProfileMock: vi.fn(),
  updateCommunityProfileMock: vi.fn(),
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
vi.mock('@/lib/middleware/read-entitlement-guard', () => ({
  requireEntitledForAdminRead: requireEntitledForAdminReadMock,
}));
vi.mock('@/lib/services/community-profile-service', () => ({
  getCommunityProfile: getCommunityProfileMock,
  updateCommunityProfile: updateCommunityProfileMock,
}));

import { GET, PATCH } from '../../src/app/api/v1/community/profile/route';

const ADMIN = { userId: 'admin-1', communityId: 42, role: 'property_manager', isAdmin: true };
const RESIDENT = { userId: 'owner-1', communityId: 42, role: 'resident', isAdmin: false };

const PROFILE = {
  name: 'Sunset Condos',
  shortName: 'Sunset',
  addressLine1: '100 Ocean Drive',
  addressLine2: 'Suite 4',
  city: 'Miami',
  state: 'FL',
  zipCode: '33139',
  unitCount: 60,
  officeHours: 'Mon–Fri, 9–5',
  contactName: 'Jane Manager',
  contactEmail: 'office@sunset.example',
  contactPhone: '305-555-0100',
};

interface ErrorJson {
  error: {
    code: string;
    message: string;
    details?: { fields?: Array<{ field: string; message: string }> };
  };
}

function get(query = 'communityId=42', headers?: Record<string, string>): NextRequest {
  return new NextRequest(`http://localhost:3000/api/v1/community/profile?${query}`, {
    headers: headers ?? {},
  });
}

function patch(payload: unknown, headers?: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/community/profile', {
    method: 'PATCH',
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json', ...(headers ?? {}) },
  });
}

function callOrder(mock: ReturnType<typeof vi.fn>): number {
  const order = mock.mock.invocationCallOrder[0];
  if (order === undefined) throw new Error('expected the mock to have been called');
  return order;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthenticatedUserIdMock.mockResolvedValue('admin-1');
  requireCommunityMembershipMock.mockResolvedValue(ADMIN);
  assertNotDemoGraceMock.mockResolvedValue(undefined);
  requireEntitledForAdminReadMock.mockResolvedValue(undefined);
  getCommunityProfileMock.mockResolvedValue(PROFILE);
  updateCommunityProfileMock.mockResolvedValue(PROFILE);
});

describe('GET /api/v1/community/profile', () => {
  it('returns the profile to an admin', async () => {
    const res = await GET(get());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: PROFILE });
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'admin-1');
    expect(getCommunityProfileMock).toHaveBeenCalledWith(42);
  });

  it('answers with the twelve profile fields and nothing else', async () => {
    // The communities row also holds billing and branding columns. The
    // contract's response schema is what keeps a stray one off the wire.
    getCommunityProfileMock.mockResolvedValue({ ...PROFILE, stripeCustomerId: 'cus_123', slug: 'sunset' });

    const res = await GET(get());

    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: Record<string, unknown> };
    expect(data).toEqual(PROFILE);
    expect(Object.keys(data)).toHaveLength(12);
  });

  it('checks the lapsed-subscription gate right after membership, before reading', async () => {
    await GET(get());

    expect(requireEntitledForAdminReadMock).toHaveBeenCalledWith(42, ADMIN);
    expect(callOrder(requireAuthenticatedUserIdMock)).toBeLessThan(callOrder(requireCommunityMembershipMock));
    expect(callOrder(requireCommunityMembershipMock)).toBeLessThan(callOrder(requireEntitledForAdminReadMock));
    expect(callOrder(requireEntitledForAdminReadMock)).toBeLessThan(callOrder(getCommunityProfileMock));
  });

  it('refuses an admin of a lapsed community', async () => {
    requireEntitledForAdminReadMock.mockRejectedValue(
      new AppError('This community’s subscription has lapsed.', 403, 'SUBSCRIPTION_REQUIRED'),
    );

    const res = await GET(get());

    expect(res.status).toBe(403);
    expect(((await res.json()) as ErrorJson).error.code).toBe('SUBSCRIPTION_REQUIRED');
    expect(getCommunityProfileMock).not.toHaveBeenCalled();
  });

  it('returns 403 for a resident', async () => {
    requireCommunityMembershipMock.mockResolvedValue(RESIDENT);

    const res = await GET(get());

    expect(res.status).toBe(403);
    expect(getCommunityProfileMock).not.toHaveBeenCalled();
  });

  it('returns 403 for someone who is not a member', async () => {
    requireCommunityMembershipMock.mockRejectedValue(new ForbiddenError('Not a member'));

    const res = await GET(get());

    expect(res.status).toBe(403);
    expect(getCommunityProfileMock).not.toHaveBeenCalled();
  });

  it('returns 401 without a session', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValue(new UnauthorizedError());

    const res = await GET(get());

    expect(res.status).toBe(401);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(getCommunityProfileMock).not.toHaveBeenCalled();
  });

  it('returns 400 without a communityId', async () => {
    const res = await GET(get(''));

    expect(res.status).toBe(400);
    expect(getCommunityProfileMock).not.toHaveBeenCalled();
  });

  it('returns 404 when the query names a different community than the request header', async () => {
    const res = await GET(get('communityId=42', { 'x-community-id': '99' }));

    expect(res.status).toBe(404);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(getCommunityProfileMock).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/community/profile', () => {
  it('PATCH updates only the fields sent', async () => {
    const res = await PATCH(patch({ communityId: 42, officeHours: 'Mon–Fri, 9–5' }));

    expect(res.status).toBe(200);
    expect(updateCommunityProfileMock).toHaveBeenCalledTimes(1);
    const [communityId, sent, opts] = updateCommunityProfileMock.mock.calls[0]!;
    expect(communityId).toBe(42);
    // Strict: a key that was not sent must be absent, not present-as-undefined,
    // and the body's communityId must not leak into the patch.
    expect(sent).toStrictEqual({ officeHours: 'Mon–Fri, 9–5' });
    expect(opts).toEqual({ actorUserId: 'admin-1' });
  });

  it('answers with the profile as the service returns it after the update', async () => {
    updateCommunityProfileMock.mockResolvedValue({ ...PROFILE, name: 'Sunset Condominiums' });

    const res = await PATCH(patch({ communityId: 42, name: 'Sunset Condominiums' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { ...PROFILE, name: 'Sunset Condominiums' } });
  });

  it('passes every field when every field is sent', async () => {
    const everything = {
      name: 'Sunset Condominiums',
      shortName: 'Sunset',
      addressLine1: '100 Ocean Drive',
      addressLine2: 'Suite 4',
      city: 'Miami',
      state: 'FL',
      zipCode: '33139-1234',
      officeHours: 'Mon–Fri, 9–5',
      contactName: 'Jane Manager',
      contactEmail: 'office@sunset.example',
      contactPhone: '305-555-0100',
    };

    const res = await PATCH(patch({ communityId: 42, ...everything }));

    expect(res.status).toBe(200);
    expect(updateCommunityProfileMock.mock.calls[0]![1]).toStrictEqual(everything);
  });

  it('treats a patch with nothing in it as a no-op that returns the profile', async () => {
    const res = await PATCH(patch({ communityId: 42 }));

    expect(res.status).toBe(200);
    expect(updateCommunityProfileMock.mock.calls[0]![1]).toStrictEqual({});
    expect(await res.json()).toEqual({ data: PROFILE });
  });

  describe('clearing and trimming', () => {
    it('passes null through to clear a field', async () => {
      await PATCH(patch({ communityId: 42, shortName: null, contactPhone: null }));

      expect(updateCommunityProfileMock.mock.calls[0]![1]).toStrictEqual({
        shortName: null,
        contactPhone: null,
      });
    });

    it('turns a blank string into null, so the field is cleared', async () => {
      await PATCH(patch({ communityId: 42, addressLine2: '   ', contactEmail: '', officeHours: '\t\n' }));

      expect(updateCommunityProfileMock.mock.calls[0]![1]).toStrictEqual({
        addressLine2: null,
        contactEmail: null,
        officeHours: null,
      });
    });

    it('trims the text it keeps', async () => {
      await PATCH(
        patch({
          communityId: 42,
          name: '  Sunset Condos  ',
          city: '  Miami ',
          state: ' FL ',
          zipCode: ' 33139 ',
          contactEmail: '  office@sunset.example ',
        }),
      );

      expect(updateCommunityProfileMock.mock.calls[0]![1]).toStrictEqual({
        name: 'Sunset Condos',
        city: 'Miami',
        state: 'FL',
        zipCode: '33139',
        contactEmail: 'office@sunset.example',
      });
    });

    it('measures a field after trimming, not before', async () => {
      const res = await PATCH(patch({ communityId: 42, shortName: ` ${'x'.repeat(60)} ` }));

      expect(res.status).toBe(200);
      expect(updateCommunityProfileMock.mock.calls[0]![1]).toStrictEqual({ shortName: 'x'.repeat(60) });
    });
  });

  describe('who may change it', () => {
    it('returns 403 for a resident', async () => {
      requireCommunityMembershipMock.mockResolvedValue(RESIDENT);

      const res = await PATCH(patch({ communityId: 42, officeHours: 'Mon–Fri, 9–5' }));

      expect(res.status).toBe(403);
      expect(updateCommunityProfileMock).not.toHaveBeenCalled();
    });

    it('returns 403 for someone who is not a member', async () => {
      requireCommunityMembershipMock.mockRejectedValue(new ForbiddenError('Not a member'));

      const res = await PATCH(patch({ communityId: 42, officeHours: 'Mon–Fri, 9–5' }));

      expect(res.status).toBe(403);
      expect(updateCommunityProfileMock).not.toHaveBeenCalled();
    });

    it('returns 401 without a session', async () => {
      requireAuthenticatedUserIdMock.mockRejectedValue(new UnauthorizedError());

      const res = await PATCH(patch({ communityId: 42, officeHours: 'Mon–Fri, 9–5' }));

      expect(res.status).toBe(401);
      expect(assertNotDemoGraceMock).not.toHaveBeenCalled();
      expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
      expect(updateCommunityProfileMock).not.toHaveBeenCalled();
    });

    it('refuses a demo in its grace window before checking membership', async () => {
      assertNotDemoGraceMock.mockRejectedValue(new ForbiddenError('Demo is read-only'));

      const res = await PATCH(patch({ communityId: 42, officeHours: 'Mon–Fri, 9–5' }));

      expect(res.status).toBe(403);
      expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
      expect(updateCommunityProfileMock).not.toHaveBeenCalled();
    });

    it('runs its gates in order: session, demo grace, membership, then the write', async () => {
      await PATCH(patch({ communityId: 42, officeHours: 'Mon–Fri, 9–5' }));

      expect(assertNotDemoGraceMock).toHaveBeenCalledWith(42);
      expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'admin-1');
      expect(callOrder(requireAuthenticatedUserIdMock)).toBeLessThan(callOrder(assertNotDemoGraceMock));
      expect(callOrder(assertNotDemoGraceMock)).toBeLessThan(callOrder(requireCommunityMembershipMock));
      expect(callOrder(requireCommunityMembershipMock)).toBeLessThan(callOrder(updateCommunityProfileMock));
    });
  });

  describe('which community', () => {
    it('returns 400 without a communityId in the body', async () => {
      const res = await PATCH(patch({ officeHours: 'Mon–Fri, 9–5' }));

      expect(res.status).toBe(400);
      expect(updateCommunityProfileMock).not.toHaveBeenCalled();
    });

    it('returns 404 when the body names a different community than the request header', async () => {
      const res = await PATCH(
        patch({ communityId: 42, officeHours: 'Mon–Fri, 9–5' }, { 'x-community-id': '99' }),
      );

      expect(res.status).toBe(404);
      expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
      expect(updateCommunityProfileMock).not.toHaveBeenCalled();
    });
  });

  describe('what the contract refuses', () => {
    it('rejects a 61-character short name (400)', async () => {
      const res = await PATCH(patch({ communityId: 42, shortName: 'x'.repeat(61) }));

      expect(res.status).toBe(400);
      expect(((await res.json()) as ErrorJson).error.details?.fields?.map((f) => f.field)).toEqual([
        'shortName',
      ]);
      expect(updateCommunityProfileMock).not.toHaveBeenCalled();
    });

    it('tells the user what to enter when the name is blank', async () => {
      const res = await PATCH(patch({ communityId: 42, name: '   ' }));

      expect(res.status).toBe(400);
      expect(((await res.json()) as ErrorJson).error.details?.fields).toEqual([
        { field: 'name', message: 'Enter your community’s name.' },
      ]);
      expect(updateCommunityProfileMock).not.toHaveBeenCalled();
    });

    it('rejects a malformed ZIP (400)', async () => {
      const res = await PATCH(patch({ communityId: 42, zipCode: '3313' }));

      expect(res.status).toBe(400);
      expect(((await res.json()) as ErrorJson).error.details?.fields?.map((f) => f.field)).toEqual([
        'zipCode',
      ]);
      expect(updateCommunityProfileMock).not.toHaveBeenCalled();
    });

    it.each([
      ['a name that is blank', { name: '   ' }],
      ['a name of 121 characters', { name: 'x'.repeat(121) }],
      // The name is the one field that cannot be cleared.
      ['a null name', { name: null }],
      ['a short name of 61 characters', { shortName: 'x'.repeat(61) }],
      ['a first address line of 121 characters', { addressLine1: 'x'.repeat(121) }],
      ['a second address line of 121 characters', { addressLine2: 'x'.repeat(121) }],
      ['a city of 81 characters', { city: 'x'.repeat(81) }],
      ['a lowercase state', { state: 'fl' }],
      ['a state of three letters', { state: 'FLA' }],
      ['a state with a digit', { state: 'F1' }],
      ['a four-digit ZIP', { zipCode: '3313' }],
      ['a ZIP with letters', { zipCode: 'ABCDE' }],
      ['a ZIP+4 missing digits', { zipCode: '33139-12' }],
      ['a ZIP+4 with no hyphen', { zipCode: '331391234' }],
      ['office hours of 201 characters', { officeHours: 'x'.repeat(201) }],
      ['a contact name of 121 characters', { contactName: 'x'.repeat(121) }],
      ['an email with no @', { contactEmail: 'office.sunset.example' }],
      ['an email of 255 characters', { contactEmail: `${'x'.repeat(255 - '@sunset.example'.length)}@sunset.example` }],
      ['a phone of 41 characters', { contactPhone: '5'.repeat(41) }],
      ['a number where text belongs', { city: 305 }],
      // The count has its own route, PATCH /api/v1/community/unit-count.
      ['a unit count', { unitCount: 60 }],
      ['a column that is not part of the profile', { slug: 'sunset' }],
    ])('400s %s', async (_label, fields) => {
      const res = await PATCH(patch({ communityId: 42, ...fields }));

      expect(res.status).toBe(400);
      expect(((await res.json()) as ErrorJson).error.code).toBe('VALIDATION_ERROR');
      expect(updateCommunityProfileMock).not.toHaveBeenCalled();
    });

    it.each([
      ['a name of 120 characters', { name: 'x'.repeat(120) }],
      ['a short name of 60 characters', { shortName: 'x'.repeat(60) }],
      ['a first address line of 120 characters', { addressLine1: 'x'.repeat(120) }],
      ['a second address line of 120 characters', { addressLine2: 'x'.repeat(120) }],
      ['a city of 80 characters', { city: 'x'.repeat(80) }],
      ['a two-letter state', { state: 'FL' }],
      ['a five-digit ZIP', { zipCode: '33139' }],
      ['a ZIP+4', { zipCode: '33139-1234' }],
      ['office hours of 200 characters', { officeHours: 'x'.repeat(200) }],
      ['a contact name of 120 characters', { contactName: 'x'.repeat(120) }],
      ['an email of 254 characters', { contactEmail: `${'x'.repeat(254 - '@sunset.example'.length)}@sunset.example` }],
      ['a phone of 40 characters', { contactPhone: '5'.repeat(40) }],
    ])('accepts %s', async (_label, fields) => {
      const res = await PATCH(patch({ communityId: 42, ...fields }));

      expect(res.status).toBe(200);
      expect(updateCommunityProfileMock.mock.calls[0]![1]).toStrictEqual(fields);
    });
  });
});
