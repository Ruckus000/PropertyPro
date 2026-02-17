import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ValidationError } from '../../src/lib/api/errors';

const {
  createUnscopedClientMock,
  createAdminClientMock,
  sendEmailMock,
  eqMock,
  communitiesTable,
  pendingSignupsTable,
  userRolesTable,
} = vi.hoisted(() => ({
  createUnscopedClientMock: vi.fn(),
  createAdminClientMock: vi.fn(),
  sendEmailMock: vi.fn().mockResolvedValue({ id: 'email_1' }),
  eqMock: vi.fn((col: unknown, value: unknown) => ({ col, value })),
  communitiesTable: {
    id: 'communities.id',
    slug: 'communities.slug',
  },
  pendingSignupsTable: {
    id: 'pending_signups.id',
    signupRequestId: 'pending_signups.signup_request_id',
    candidateSlug: 'pending_signups.candidate_slug',
    emailNormalized: 'pending_signups.email_normalized',
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
  eq: eqMock,
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
  authUserId: string | null;
  verificationEmailId: string | null;
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
                'pending_signups_candidate_slug_unique',
              );
            }

            const existing = state.pendingSignups.find(
              (row) => row.emailNormalized === email,
            );

            if (existing) {
              existing.candidateSlug = candidateSlug;
              return [
                {
                  id: existing.id,
                  signupRequestId: existing.signupRequestId,
                  candidateSlug: existing.candidateSlug,
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
              authUserId: null,
              verificationEmailId: null,
            };
            state.pendingSignups.push(inserted);
            return [
              {
                id: inserted.id,
                signupRequestId: inserted.signupRequestId,
                candidateSlug: inserted.candidateSlug,
              },
            ];
          },
        }),
      }),
    };
  });

  const updateSpy = vi.fn((table: unknown) => {
    if (table !== pendingSignupsTable) {
      throw new Error('Unexpected update target');
    }

    return {
      set: (changes: Record<string, unknown>) => ({
        where: (condition: { col: unknown; value: unknown }) => {
          const execute = async () => {
            const row = state.pendingSignups.find((entry) => {
              if (condition.col === pendingSignupsTable.id) {
                return entry.id === Number(condition.value);
              }
              if (condition.col === pendingSignupsTable.signupRequestId) {
                return entry.signupRequestId === String(condition.value);
              }
              return false;
            });

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
                  'pending_signups_candidate_slug_unique',
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

            return [
              {
                id: row.id,
                signupRequestId: row.signupRequestId,
                candidateSlug: row.candidateSlug,
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

  const selectSpy = vi.fn(() => ({
    from: (table: unknown) => ({
      where: (condition: { col: unknown; value: unknown }) => ({
        limit: async () => {
          if (table === communitiesTable) {
            return state.communities
              .filter((row) => row.slug === String(condition.value))
              .map((row) => ({ id: row.id }));
          }

          if (table === pendingSignupsTable) {
            return state.pendingSignups
              .filter((row) => row.candidateSlug === String(condition.value))
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
  planKey: 'compliance_basic' as const,
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
});
