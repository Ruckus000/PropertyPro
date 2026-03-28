import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SignupEmailDeliveryError, ValidationError } from '../../src/lib/api/errors';

const {
  createUnscopedClientMock,
  createAdminClientMock,
  sendEmailMock,
  eqMock,
  andMock,
  notInArrayMock,
  orMock,
  isNullMock,
  gtMock,
  communitiesTable,
  pendingSignupsTable,
  userRolesTable,
} = vi.hoisted(() => ({
  createUnscopedClientMock: vi.fn(),
  createAdminClientMock: vi.fn(),
  sendEmailMock: vi.fn().mockResolvedValue({ id: 'email_1' }),
  eqMock: vi.fn((col: unknown, value: unknown) => ({ _type: 'eq', col, value })),
  andMock: vi.fn((...conditions: unknown[]) => ({ _type: 'and', conditions })),
  notInArrayMock: vi.fn((col: unknown, values: unknown) => ({ _type: 'notInArray', col, values })),
  orMock: vi.fn((...conditions: unknown[]) => ({ _type: 'or', conditions })),
  isNullMock: vi.fn((col: unknown) => ({ _type: 'isNull', col })),
  gtMock: vi.fn((col: unknown, value: unknown) => ({ _type: 'gt', col, value })),
  communitiesTable: {
    id: 'communities.id',
    slug: 'communities.slug',
  },
  pendingSignupsTable: {
    id: 'pending_signups.id',
    signupRequestId: 'pending_signups.signup_request_id',
    candidateSlug: 'pending_signups.candidate_slug',
    emailNormalized: 'pending_signups.email_normalized',
    status: 'pending_signups.status',
    expiresAt: 'pending_signups.expires_at',
  },
  userRolesTable: {
    id: 'user_roles.id',
  },
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: createUnscopedClientMock,
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock('@propertypro/email', () => ({
  sendEmail: sendEmailMock,
  SignupVerificationEmail: () => null,
}));

vi.mock('@propertypro/db/filters', () => ({
  and: andMock,
  eq: eqMock,
  notInArray: notInArrayMock,
  or: orMock,
  isNull: isNullMock,
  gt: gtMock,
}));

vi.mock('@propertypro/db', () => ({
  communities: communitiesTable,
  pendingSignups: pendingSignupsTable,
  userRoles: userRolesTable,
}));

import {
  checkSignupSubdomainAvailability,
  submitSignup,
} from '../../src/lib/auth/signup';

interface CommunityRow {
  id: number;
  slug: string;
}

interface PendingSignupRow {
  id: number;
  signupRequestId: string;
  emailNormalized: string;
  candidateSlug: string;
  status: string;
  expiresAt: Date | null;
  authUserId: string | null;
  verificationEmailId: string | null;
  verificationEmailSentAt: Date | null;
}

interface MockDbState {
  communities: CommunityRow[];
  pendingSignups: PendingSignupRow[];
}

function createUniqueConstraintError(constraint: string): Error & { code: string; constraint: string } {
  const error = new Error(`duplicate key value violates unique constraint "${constraint}"`) as
    Error & { code: string; constraint: string };
  error.code = '23505';
  error.constraint = constraint;
  return error;
}

function createMockDb(state: MockDbState): {
  db: {
    select: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  insertSpy: ReturnType<typeof vi.fn>;
} {
  const insertSpy = vi.fn((table: unknown) => {
    if (table !== pendingSignupsTable) {
      throw new Error('Unexpected insert target');
    }

    return {
      values: (data: Record<string, unknown>) => ({
        onConflictDoUpdate: (_config: unknown) => ({
          returning: async () => {
            const email = String(data.emailNormalized);
            const signupRequestId = String(data.signupRequestId);
            const candidateSlug = String(data.candidateSlug);

            const slugOwner = state.pendingSignups.find(
              (row) =>
                row.candidateSlug === candidateSlug
                && row.emailNormalized !== email,
            );
            if (slugOwner) {
              throw createUniqueConstraintError(
                'pending_signups_candidate_slug_active_unique',
              );
            }

            const existing = state.pendingSignups.find(
              (row) => row.emailNormalized === email,
            );

            if (existing) {
              existing.candidateSlug = candidateSlug;
              return [
                {
                  id: BigInt(existing.id),
                  signupRequestId: existing.signupRequestId,
                  candidateSlug: existing.candidateSlug,
                  verificationEmailSentAt: existing.verificationEmailSentAt,
                },
              ];
            }

            const requestConflict = state.pendingSignups.find(
              (row) => row.signupRequestId === signupRequestId,
            );
            if (requestConflict) {
              throw createUniqueConstraintError(
                'pending_signups_signup_request_unique',
              );
            }

            const inserted: PendingSignupRow = {
              id: state.pendingSignups.length + 1,
              signupRequestId,
              emailNormalized: email,
              candidateSlug,
              status: 'pending_verification',
              expiresAt: null,
              authUserId: null,
              verificationEmailId: null,
              verificationEmailSentAt: null,
            };
            state.pendingSignups.push(inserted);
            return [
              {
                id: BigInt(inserted.id),
                signupRequestId: inserted.signupRequestId,
                candidateSlug: inserted.candidateSlug,
                verificationEmailSentAt: inserted.verificationEmailSentAt,
              },
            ];
          },
        }),
      }),
    };
  });

  // Resolve a condition (plain eq or compound and) to find a matching row.
  function findRowByCondition(
    condition: Record<string, unknown>,
  ): PendingSignupRow | undefined {
    // Plain eq condition: { _type: 'eq', col, value }
    if (condition._type === 'eq') {
      return state.pendingSignups.find((entry) => {
        if (condition.col === pendingSignupsTable.id) {
          return entry.id === Number(condition.value);
        }
        if (condition.col === pendingSignupsTable.signupRequestId) {
          return entry.signupRequestId === String(condition.value);
        }
        return false;
      });
    }
    // Compound and() condition: { _type: 'and', conditions: [...] }
    if (condition._type === 'and' && Array.isArray(condition.conditions)) {
      return state.pendingSignups.find((entry) => {
        return (condition.conditions as Record<string, unknown>[]).every((c) => {
          if (c._type !== 'eq') return true;
          if (c.col === pendingSignupsTable.signupRequestId) {
            return entry.signupRequestId === String(c.value);
          }
          if (c.col === pendingSignupsTable.emailNormalized) {
            return entry.emailNormalized === String(c.value);
          }
          if (c.col === pendingSignupsTable.id) {
            return entry.id === Number(c.value);
          }
          return true;
        });
      });
    }
    return undefined;
  }

  const updateSpy = vi.fn((table: unknown) => {
    if (table !== pendingSignupsTable) {
      throw new Error('Unexpected update target');
    }

    return {
      set: (changes: Record<string, unknown>) => ({
        where: (condition: Record<string, unknown>) => {
          const execute = async () => {
            const row = findRowByCondition(condition);

            if (!row) {
              return [];
            }

            const nextSlug = changes.candidateSlug;
            if (typeof nextSlug === 'string') {
              const slugConflict = state.pendingSignups.find(
                (entry) =>
                  entry.candidateSlug === nextSlug && entry.id !== row.id,
              );
              if (slugConflict) {
                throw createUniqueConstraintError(
                  'pending_signups_candidate_slug_active_unique',
                );
              }
              row.candidateSlug = nextSlug;
            }

            if (typeof changes.emailNormalized === 'string') {
              row.emailNormalized = changes.emailNormalized;
            }
            if (typeof changes.authUserId === 'string' || changes.authUserId === null) {
              row.authUserId = changes.authUserId;
            }
            if (
              typeof changes.verificationEmailId === 'string'
              || changes.verificationEmailId === null
            ) {
              row.verificationEmailId = changes.verificationEmailId;
            }
            if (changes.verificationEmailSentAt instanceof Date) {
              row.verificationEmailSentAt = changes.verificationEmailSentAt;
            }

            return [
              {
                id: BigInt(row.id),
                signupRequestId: row.signupRequestId,
                candidateSlug: row.candidateSlug,
                verificationEmailSentAt: row.verificationEmailSentAt,
              },
            ];
          };

          let cached: Promise<unknown[]> | null = null;
          const executeOnce = () => {
            if (!cached) {
              cached = execute();
            }
            return cached;
          };

          const promise = executeOnce();
          const promiseWithReturning = promise as Promise<unknown[]> & {
            returning: () => Promise<unknown[]>;
          };
          promiseWithReturning.returning = () => executeOnce();
          return promiseWithReturning;
        },
      }),
    };
  });

  // Extract the eq slug value from either a plain eq condition or an and() wrapper.
  function extractSlugValue(condition: unknown): string | null {
    const cond = condition as Record<string, unknown>;
    // Plain eq condition: { _type: 'eq', col, value }
    if (cond._type === 'eq') return String(cond.value);
    // Compound and() condition: { _type: 'and', conditions: [...] }
    if (cond._type === 'and' && Array.isArray(cond.conditions)) {
      const eqCond = (cond.conditions as Record<string, unknown>[]).find(
        (c) => c._type === 'eq',
      );
      if (eqCond) return String(eqCond.value);
    }
    return null;
  }

  const TERMINAL_STATUSES = ['expired', 'completed'];

  const selectSpy = vi.fn(() => ({
    from: (table: unknown) => ({
      where: (condition: unknown) => ({
        limit: async () => {
          const slugValue = extractSlugValue(condition);
          if (!slugValue) return [];

          if (table === communitiesTable) {
            return state.communities
              .filter((row) => row.slug === slugValue)
              .map((row) => ({ id: row.id }));
          }

          if (table === pendingSignupsTable) {
            return state.pendingSignups
              .filter((row) => {
                if (row.candidateSlug !== slugValue) return false;
                // Mirror the availability check: exclude terminal and expired rows.
                if (TERMINAL_STATUSES.includes(row.status)) return false;
                if (row.expiresAt && row.expiresAt < new Date()) return false;
                return true;
              })
              .map((row) => ({
                id: row.id,
                signupRequestId: row.signupRequestId,
              }));
          }

          return [];
        },
      }),
    }),
  }));

  return {
    db: {
      select: selectSpy,
      insert: insertSpy,
      update: updateSpy,
    },
    insertSpy,
  };
}

const validSignupPayload = {
  signupRequestId: '6f83f6d3-7b45-4ff4-a7ef-f8f91a4f663a',
  primaryContactName: 'Jordan Admin',
  email: 'jordan@example.com',
  password: 'Secure!123',
  communityName: 'Seaside Villas',
  address: '101 Coastal Dr, Naples, FL 34102',
  county: 'Collier',
  unitCount: 140,
  communityType: 'condo_718' as const,
  planKey: 'essentials' as const,
  candidateSlug: 'seaside-villas',
  termsAccepted: true,
};

describe('signup service', () => {
  let state: MockDbState;
  let insertSpy: ReturnType<typeof vi.fn>;
  let generateLinkMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    state = {
      communities: [],
      pendingSignups: [],
    };

    const mockDb = createMockDb(state);
    insertSpy = mockDb.insertSpy;
    createUnscopedClientMock.mockReturnValue(mockDb.db);

    generateLinkMock = vi.fn().mockResolvedValue({
      data: {
        user: { id: 'auth-user-1' },
        properties: { action_link: 'https://verify.example.com/link' },
      },
      error: null,
    });

    createAdminClientMock.mockReturnValue({
      auth: {
        admin: {
          generateLink: generateLinkMock,
        },
      },
    });
  });

  it('rejects reserved subdomains and accepts free subdomains', async () => {
    const reserved = await checkSignupSubdomainAvailability('admin');
    expect(reserved.available).toBe(false);
    expect(reserved.reason).toBe('reserved');

    const free = await checkSignupSubdomainAvailability('sunrise-lakes');
    expect(free.available).toBe(true);
    expect(free.reason).toBe('available');
  });

  it('rejects taken subdomains from existing communities', async () => {
    state.communities.push({ id: 42, slug: 'taken-community' });

    const result = await checkSignupSubdomainAvailability('taken-community');
    expect(result.available).toBe(false);
    expect(result.reason).toBe('taken');
  });

  it('performs authoritative submit-time subdomain re-check', async () => {
    state.communities.push({ id: 8, slug: 'seaside-villas' });

    await expect(submitSignup(validSignupPayload)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('is idempotent for duplicate submit and never writes communities/user_roles', async () => {
    const first = await submitSignup(validSignupPayload);
    const second = await submitSignup(validSignupPayload);

    expect(first.signupRequestId).toBe(validSignupPayload.signupRequestId);
    expect(second.signupRequestId).toBe(validSignupPayload.signupRequestId);
    expect(state.pendingSignups).toHaveLength(1);
    expect(state.pendingSignups[0]?.authUserId).toBe('auth-user-1');
    expect(state.pendingSignups[0]?.verificationEmailId).toBe('email_1');

    const insertedTables = insertSpy.mock.calls.map((call) => call[0]);
    expect(insertedTables).toEqual([pendingSignupsTable, pendingSignupsTable]);
    expect(insertedTables).not.toContain(communitiesTable);
    expect(insertedTables).not.toContain(userRolesTable);
  });

  it('allows reclaiming slugs from expired pending signups', async () => {
    state.pendingSignups.push({
      id: 99,
      signupRequestId: 'old-request',
      emailNormalized: 'old-user@example.com',
      candidateSlug: 'seaside-villas',
      status: 'expired',
      expiresAt: new Date('2020-01-01'),
      authUserId: null,
      verificationEmailId: null,
      verificationEmailSentAt: null,
    });

    // The slug should show as available since the holding signup is expired.
    const availability = await checkSignupSubdomainAvailability('seaside-villas');
    expect(availability.available).toBe(true);
    expect(availability.reason).toBe('available');
  });

  it('keeps email uniqueness handling non-enumerating for already-registered users', async () => {
    generateLinkMock
      .mockResolvedValueOnce({
        data: {
          user: null,
          properties: null,
        },
        error: { message: 'A user with this email address has already been registered' },
      })
      .mockResolvedValueOnce({
        data: {
          user: { id: 'auth-user-1' },
          properties: { action_link: 'https://verify.example.com/magic' },
        },
        error: null,
      });

    const result = await submitSignup(validSignupPayload);
    expect(result.message).toContain('Check your email');
    expect(result.verificationRequired).toBe(true);
    expect(generateLinkMock).toHaveBeenCalledTimes(2);
  });

  it('rejects signupRequestId reuse from a different email (cross-user hijacking)', async () => {
    // First user creates a pending signup.
    await submitSignup(validSignupPayload);
    expect(state.pendingSignups).toHaveLength(1);

    // Attacker tries to reuse the same signupRequestId with a different email.
    const hijackPayload = {
      ...validSignupPayload,
      email: 'attacker@example.com',
      candidateSlug: 'attacker-community',
    };

    await expect(submitSignup(hijackPayload)).rejects.toThrow(
      'Unable to process signup request.',
    );

    // Original signup should be untouched.
    expect(state.pendingSignups[0]?.emailNormalized).toBe('jordan@example.com');
    expect(state.pendingSignups[0]?.candidateSlug).toBe('seaside-villas');
  });

  it('skips re-sending verification email within cooldown period', async () => {
    // First submission sends the email.
    const first = await submitSignup(validSignupPayload);
    expect(first.signupRequestId).toBe(validSignupPayload.signupRequestId);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);

    // Simulate the pending signup having a recent verificationEmailSentAt.
    state.pendingSignups[0]!.verificationEmailSentAt = new Date();

    sendEmailMock.mockClear();

    // Second submission within cooldown should NOT re-send.
    const second = await submitSignup(validSignupPayload);
    expect(second.signupRequestId).toBe(validSignupPayload.signupRequestId);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('persists auth linkage before surfacing a verification email delivery failure', async () => {
    sendEmailMock.mockRejectedValueOnce(new Error('provider timeout'));

    await expect(submitSignup(validSignupPayload)).rejects.toBeInstanceOf(
      SignupEmailDeliveryError,
    );

    expect(state.pendingSignups).toHaveLength(1);
    expect(state.pendingSignups[0]?.authUserId).toBe('auth-user-1');
    expect(state.pendingSignups[0]?.verificationEmailId).toBeNull();
    expect(state.pendingSignups[0]?.verificationEmailSentAt).toBeNull();
  });
});
