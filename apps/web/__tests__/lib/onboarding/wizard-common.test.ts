import { beforeAll, describe, expect, it, vi } from 'vitest';

let isUniqueViolation: typeof import('../../../src/lib/onboarding/wizard-common').isUniqueViolation;
let requireMutationAuthorization: typeof import('../../../src/lib/onboarding/wizard-common').requireMutationAuthorization;
let updateCommunityProfile: typeof import('../../../src/lib/onboarding/wizard-common').updateCommunityProfile;

beforeAll(async () => {
  process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@127.0.0.1:5432/postgres';
  ({ isUniqueViolation, requireMutationAuthorization, updateCommunityProfile } = await import(
    '../../../src/lib/onboarding/wizard-common'
  ));
});

const PROFILE = {
  name: 'Sunset Condos',
  addressLine1: '1 Ocean Dr',
  addressLine2: null,
  city: 'Miami',
  state: 'FL',
  zipCode: '33139',
  timezone: 'America/New_York',
};

/** Records what reached the database, so a rejected write can be proven absent. */
function scopedSpy() {
  const update = vi.fn().mockResolvedValue([]);
  return { client: { update } as never, update };
}

describe('updateCommunityProfile — logoPath validation', () => {
  it('REJECTS a logoPath naming another community, and writes nothing', async () => {
    // This is the cross-tenant read it closes: the path is stored on the
    // community, and resolveAuthPageBranding mints a presigned download URL for
    // it against the private documents bucket on /auth/login — an
    // UNAUTHENTICATED page. Community 8 pointing at community 99's object would
    // have its public login page serve a signed URL for that object.
    const { client, update } = scopedSpy();

    await expect(
      updateCommunityProfile(client, 8, {
        ...PROFILE,
        logoPath: 'communities/99/documents/abc/confidential.pdf',
      }),
    ).rejects.toThrow();

    expect(update).not.toHaveBeenCalled();
  });

  it('REJECTS a sibling namespace in the same bucket', async () => {
    // Same community, but an e-sign object rather than an upload.
    const { client, update } = scopedSpy();

    await expect(
      updateCommunityProfile(client, 8, {
        ...PROFILE,
        logoPath: 'communities/8/esign-signed/7/signed.pdf',
      }),
    ).rejects.toThrow();

    expect(update).not.toHaveBeenCalled();
  });

  it('REJECTS a traversal path', async () => {
    const { client, update } = scopedSpy();

    await expect(
      updateCommunityProfile(client, 8, {
        ...PROFILE,
        logoPath: 'communities/8/documents/../../99/documents/abc/x.pdf',
      }),
    ).rejects.toThrow();

    expect(update).not.toHaveBeenCalled();
  });

  it('accepts a logoPath the presign route could have produced', async () => {
    const { client, update } = scopedSpy();

    await updateCommunityProfile(client, 8, {
      ...PROFILE,
      logoPath: 'communities/8/documents/abc-uuid/logo.png',
    });

    expect(update).toHaveBeenCalledTimes(1);
  });

  it('accepts a null logoPath, so a community can clear its logo', async () => {
    const { client, update } = scopedSpy();

    await updateCommunityProfile(client, 8, { ...PROFILE, logoPath: null });

    expect(update).toHaveBeenCalledTimes(1);
  });
});

describe('requireMutationAuthorization', () => {
  it('allows admin-tier roles including the v3 property_manager / root_manager (lockout regression guard)', () => {
    expect(() => requireMutationAuthorization('property_manager')).not.toThrow();
    expect(() => requireMutationAuthorization('root_manager')).not.toThrow();
  });

  it('rejects resident-tier roles', () => {
    expect(() => requireMutationAuthorization('resident')).toThrow();
  });
});

describe('isUniqueViolation', () => {
  it('returns true for a direct Postgres unique-violation error', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
  });

  it('returns true for a Drizzle-wrapped Postgres unique-violation error', () => {
    expect(
      isUniqueViolation({
        message: 'Failed query',
        cause: { code: '23505' },
      }),
    ).toBe(true);
  });

  it('returns false for non-unique database errors', () => {
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
  });
});
