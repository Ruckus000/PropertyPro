import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createUnscopedClientMock,
  eqMock,
  andMock,
  notInArrayMock,
  orMock,
  isNullMock,
  gtMock,
  ltMock,
  communitiesTable,
  pendingSignupsTable,
  userRolesTable,
} = vi.hoisted(() => ({
  createUnscopedClientMock: vi.fn(),
  eqMock: vi.fn((col: unknown, value: unknown) => ({ _type: 'eq', col, value })),
  andMock: vi.fn((...conditions: unknown[]) => ({ _type: 'and', conditions })),
  notInArrayMock: vi.fn((col: unknown, values: unknown) => ({ _type: 'notInArray', col, values })),
  orMock: vi.fn((...conditions: unknown[]) => ({ _type: 'or', conditions })),
  isNullMock: vi.fn((col: unknown) => ({ _type: 'isNull', col })),
  gtMock: vi.fn((col: unknown, value: unknown) => ({ _type: 'gt', col, value })),
  ltMock: vi.fn((col: unknown, value: unknown) => ({ _type: 'lt', col, value })),
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

vi.mock('@propertypro/db/filters', () => ({
  and: andMock,
  eq: eqMock,
  notInArray: notInArrayMock,
  or: orMock,
  isNull: isNullMock,
  gt: gtMock,
  lt: ltMock,
}));

vi.mock('@propertypro/db', () => ({
  communities: communitiesTable,
  pendingSignups: pendingSignupsTable,
  userRoles: userRolesTable,
}));

import { checkSignupSubdomainAvailability } from '../../src/lib/auth/signup';

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
  communityName?: string;
  planKey?: string;
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
              // Mirror upsertPendingSignup's setWhere: never a post-payment row,
              // and a live row only for the caller holding its signupRequestId
              // (an expired row is free, and takes the caller's id).
              const postPayment = ['payment_completed', 'provisioning', 'completed']
                .includes(existing.status);
              const owned = existing.signupRequestId === signupRequestId;
              const expired = existing.expiresAt !== null && existing.expiresAt < new Date();
              if (postPayment || !(owned || expired)) {
                return [];
              }
              existing.signupRequestId = signupRequestId;
              existing.candidateSlug = candidateSlug;
              existing.communityName = String(data.communityName);
              existing.planKey = String(data.planKey);
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
              communityName: String(data.communityName),
              planKey: String(data.planKey),
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
              // A6: enforce the email_normalized unique index on updates too.
              const emailConflict = state.pendingSignups.find(
                (entry) =>
                  entry.emailNormalized === changes.emailNormalized && entry.id !== row.id,
              );
              if (emailConflict) {
                throw createUniqueConstraintError('pending_signups_email_normalized_unique');
              }
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

  // Statuses that don't reserve a slug: unverified, expired, and completed.
  const NON_RESERVING_STATUSES = ['pending_verification', 'expired', 'completed'];

  const selectSpy = vi.fn(() => ({
    from: (table: unknown) => ({
      where: (condition: unknown) => ({
        limit: async () => {
          // A6: status lookup by signupRequestId (used by the email-change branch).
          const cond = condition as Record<string, unknown>;
          // Status lookup by email (upsertPendingSignup's refused-update branch).
          if (
            table === pendingSignupsTable &&
            cond._type === 'eq' &&
            cond.col === pendingSignupsTable.emailNormalized
          ) {
            const email = String(cond.value);
            return state.pendingSignups
              .filter((row) => row.emailNormalized === email)
              .map((row) => ({ status: row.status }));
          }
          if (
            table === pendingSignupsTable &&
            cond._type === 'eq' &&
            cond.col === pendingSignupsTable.signupRequestId
          ) {
            const sid = String(cond.value);
            return state.pendingSignups
              .filter((row) => row.signupRequestId === sid)
              .map((row) => ({ id: row.id, status: row.status }));
          }

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
                // Mirror the availability check: unverified + terminal don't reserve.
                if (NON_RESERVING_STATUSES.includes(row.status)) return false;
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

describe('signup service', () => {
  let state: MockDbState;

  beforeEach(() => {
    vi.clearAllMocks();

    state = {
      communities: [],
      pendingSignups: [],
    };

    createUnscopedClientMock.mockReturnValue(createMockDb(state).db);
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

  it('allows reclaiming slugs from unverified pending signups', async () => {
    state.pendingSignups.push({
      id: 100,
      signupRequestId: 'unverified-request',
      emailNormalized: 'unverified@example.com',
      candidateSlug: 'ocean-towers',
      status: 'pending_verification',
      expiresAt: new Date(Date.now() + 3600_000), // still active
      authUserId: null,
      verificationEmailId: null,
      verificationEmailSentAt: null,
    });

    // Unverified signups should not reserve slugs — prevents squatting.
    const availability = await checkSignupSubdomainAvailability('ocean-towers');
    expect(availability.available).toBe(true);
    expect(availability.reason).toBe('available');
  });

  it('blocks slugs held by verified pending signups', async () => {
    state.pendingSignups.push({
      id: 101,
      signupRequestId: 'verified-request',
      emailNormalized: 'verified@example.com',
      candidateSlug: 'palm-gardens',
      status: 'email_verified',
      expiresAt: new Date(Date.now() + 3600_000),
      authUserId: 'auth-verified-1',
      verificationEmailId: 'email_v1',
      verificationEmailSentAt: new Date(),
    });

    const availability = await checkSignupSubdomainAvailability('palm-gardens');
    expect(availability.available).toBe(false);
    expect(availability.reason).toBe('taken');
  });

  describe('advisory subdomain check logging and transient failures', () => {
    let infoSpy: ReturnType<typeof vi.spyOn>;
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
      errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    function getLoggedEvents(spy: ReturnType<typeof vi.spyOn>): string[] {
      return spy.mock.calls
        .map((args) => args[0])
        .filter((line): line is string => typeof line === 'string')
        .map((line) => {
          try {
            return (JSON.parse(line) as { event?: string }).event ?? '';
          } catch {
            return '';
          }
        })
        .filter(Boolean);
    }

    it('returns reason="unknown" and logs db_failure when the DB query throws', async () => {
      const failingDb = {
        select: vi.fn(() => {
          throw new Error('connection refused');
        }),
        insert: vi.fn(),
        update: vi.fn(),
      };
      createUnscopedClientMock.mockReturnValueOnce(failingDb);

      const result = await checkSignupSubdomainAvailability('fresh-slug');

      expect(result.reason).toBe('unknown');
      expect(result.available).toBe(false);
      expect(result.message).toMatch(/couldn't verify/i);
      expect(getLoggedEvents(errorSpy)).toContain('subdomain.check.db_failure');
    });

    it('logs subdomain.check.invalid for too-short inputs', async () => {
      await checkSignupSubdomainAvailability('ab');
      expect(getLoggedEvents(infoSpy)).toContain('subdomain.check.invalid');
    });

    it('logs subdomain.check.reserved for reserved names', async () => {
      await checkSignupSubdomainAvailability('admin');
      expect(getLoggedEvents(infoSpy)).toContain('subdomain.check.reserved');
    });

    it('logs subdomain.check.taken.community when an existing community matches', async () => {
      state.communities.push({ id: 7, slug: 'taken-existing' });
      await checkSignupSubdomainAvailability('taken-existing');
      expect(getLoggedEvents(infoSpy)).toContain('subdomain.check.taken.community');
    });

    it('logs subdomain.check.taken.pending when a verified pending signup matches', async () => {
      state.pendingSignups.push({
        id: 77,
        signupRequestId: 'verified-req',
        emailNormalized: 'verified@example.com',
        candidateSlug: 'verified-slug',
        status: 'email_verified',
        expiresAt: new Date(Date.now() + 3600_000),
        authUserId: 'auth-77',
        verificationEmailId: 'email-77',
        verificationEmailSentAt: new Date(),
      });
      await checkSignupSubdomainAvailability('verified-slug');
      expect(getLoggedEvents(infoSpy)).toContain('subdomain.check.taken.pending');
    });

    it('logs subdomain.check.available for clean slugs', async () => {
      await checkSignupSubdomainAvailability('wide-open-slug');
      expect(getLoggedEvents(infoSpy)).toContain('subdomain.check.available');
    });

  });
});
