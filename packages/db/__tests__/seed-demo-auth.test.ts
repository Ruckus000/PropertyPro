import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Module-level drizzle client requires DATABASE_URL even though it's mocked below.
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://stub:stub@localhost:5432/stub';

const { mockAdminClient, mockListUsers, mockUpdateUserById, mockCreateUser, mockDb } =
  vi.hoisted(() => {
    const mockListUsers = vi.fn();
    const mockUpdateUserById = vi.fn();
    const mockCreateUser = vi.fn();
    const mockAdminClient = {
      auth: {
        admin: {
          listUsers: mockListUsers,
          updateUserById: mockUpdateUserById,
          createUser: mockCreateUser,
        },
      },
      storage: {
        from: () => ({ upload: vi.fn(), list: vi.fn(), download: vi.fn() }),
      },
    };
    const mockDb = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      execute: vi.fn(),
      transaction: vi.fn(),
    };
    return { mockAdminClient, mockListUsers, mockUpdateUserById, mockCreateUser, mockDb };
  });

vi.mock('@propertypro/db', async () => {
  const actual = await vi.importActual<typeof import('@propertypro/db')>('@propertypro/db');
  return {
    ...actual,
    createAdminClient: () => mockAdminClient,
  };
});

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: () => mockDb,
  closeUnscopedClient: vi.fn(),
}));

vi.mock('stripe', () => ({
  default: class StripeStub {
    constructor() {}
  },
}));

vi.mock('../../../apps/web/src/lib/billing/billing-group-service', () => ({
  getOrCreateBillingGroupForPm: vi.fn(),
  recalculateVolumeTier: vi.fn(),
}));

const { ensureDemoAuthUser } = await import('../../../scripts/seed-demo');

const DEMO_EMAIL = 'board.president@sunset.local';
const EXISTING_AUTH_USER_ID = '00000000-0000-0000-0000-000000000001';
const CREATED_AUTH_USER_ID = '00000000-0000-0000-0000-000000000002';

describe('ensureDemoAuthUser password handling', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://demo.supabase.test';
    process.env.DEMO_DEFAULT_PASSWORD = 'CorrectHorseBatteryStaple1!';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('sets password on existing auth user during re-seed', async () => {
    mockListUsers.mockResolvedValueOnce({
      data: {
        users: [
          {
            id: EXISTING_AUTH_USER_ID,
            email: DEMO_EMAIL,
            user_metadata: { full_name: 'Stale Name' },
          },
        ],
      },
      error: null,
    });
    mockUpdateUserById.mockResolvedValue({ data: { user: {} }, error: null });

    const result = await ensureDemoAuthUser(DEMO_EMAIL);

    expect(result).toBe(EXISTING_AUTH_USER_ID);
    expect(mockUpdateUserById).toHaveBeenCalledTimes(1);
    const [updatedId, updatedAttrs] = mockUpdateUserById.mock.calls[0]!;
    expect(updatedId).toBe(EXISTING_AUTH_USER_ID);
    expect(updatedAttrs).toMatchObject({
      password: 'CorrectHorseBatteryStaple1!',
      user_metadata: { full_name: 'Sam President' },
    });
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it('preserves unrelated user_metadata on the existing auth user', async () => {
    mockListUsers.mockResolvedValueOnce({
      data: {
        users: [
          {
            id: EXISTING_AUTH_USER_ID,
            email: DEMO_EMAIL,
            user_metadata: {
              full_name: 'Stale Name',
              avatar_url: 'https://cdn.example.com/a.png',
              custom_flag: true,
            },
          },
        ],
      },
      error: null,
    });
    mockUpdateUserById.mockResolvedValue({ data: { user: {} }, error: null });

    await ensureDemoAuthUser(DEMO_EMAIL);

    const [, updatedAttrs] = mockUpdateUserById.mock.calls[0]!;
    expect(updatedAttrs.user_metadata).toEqual({
      avatar_url: 'https://cdn.example.com/a.png',
      custom_flag: true,
      full_name: 'Sam President',
    });
  });

  it('uses DEMO_DEFAULT_PASSWORD when creating a new auth user', async () => {
    mockListUsers.mockResolvedValueOnce({
      data: { users: [] },
      error: null,
    });
    mockCreateUser.mockResolvedValue({
      data: { user: { id: CREATED_AUTH_USER_ID } },
      error: null,
    });

    const result = await ensureDemoAuthUser(DEMO_EMAIL);

    expect(result).toBe(CREATED_AUTH_USER_ID);
    expect(mockCreateUser).toHaveBeenCalledTimes(1);
    const [createAttrs] = mockCreateUser.mock.calls[0]!;
    expect(createAttrs).toMatchObject({
      email: DEMO_EMAIL,
      password: 'CorrectHorseBatteryStaple1!',
      email_confirm: true,
    });
    expect(mockUpdateUserById).not.toHaveBeenCalled();
  });

  it('throws when DEMO_DEFAULT_PASSWORD is unset on the create path', async () => {
    delete process.env.DEMO_DEFAULT_PASSWORD;
    mockListUsers.mockResolvedValueOnce({
      data: { users: [] },
      error: null,
    });

    await expect(ensureDemoAuthUser(DEMO_EMAIL)).rejects.toThrow(
      /DEMO_DEFAULT_PASSWORD environment variable must be set/,
    );
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it('throws when DEMO_DEFAULT_PASSWORD is unset on the re-seed path', async () => {
    delete process.env.DEMO_DEFAULT_PASSWORD;
    mockListUsers.mockResolvedValueOnce({
      data: {
        users: [
          {
            id: EXISTING_AUTH_USER_ID,
            email: DEMO_EMAIL,
            user_metadata: {},
          },
        ],
      },
      error: null,
    });

    await expect(ensureDemoAuthUser(DEMO_EMAIL)).rejects.toThrow(
      /DEMO_DEFAULT_PASSWORD environment variable must be set/,
    );
    expect(mockUpdateUserById).not.toHaveBeenCalled();
  });
});
