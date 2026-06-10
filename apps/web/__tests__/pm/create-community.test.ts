/**
 * Tests for createCommunityForPm — founding-membership role.
 *
 * Service: apps/web/src/lib/pm/create-community.ts
 *
 * Focus: the creator-is-root (v3) guarantee — the community creator is linked
 * with role 'root_manager' (Spec §3.5(a)), displayTitle 'Administrator'.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoist mocks — must precede all imports
// ---------------------------------------------------------------------------

const {
  createUnscopedClientMock,
  logAuditEventMock,
  communitiesTable,
  userRolesTable,
  documentCategoriesTable,
  notificationPreferencesTable,
  createChecklistItemsMock,
  applyStarterPackMock,
  seedDefaultSiteBrandingMock,
  getDefaultDocumentCategoriesMock,
} = vi.hoisted(() => ({
  createUnscopedClientMock: vi.fn(),
  logAuditEventMock: vi.fn().mockResolvedValue(undefined),
  communitiesTable: { id: 'communities.id', slug: 'communities.slug' },
  userRolesTable: {
    userId: 'user_roles.user_id',
    communityId: 'user_roles.community_id',
    role: 'user_roles.role',
  },
  documentCategoriesTable: { id: 'document_categories.id' },
  notificationPreferencesTable: { id: 'notification_preferences.id' },
  createChecklistItemsMock: vi.fn().mockResolvedValue(undefined),
  applyStarterPackMock: vi.fn().mockResolvedValue(undefined),
  seedDefaultSiteBrandingMock: vi.fn().mockResolvedValue(undefined),
  getDefaultDocumentCategoriesMock: vi.fn(() => [
    { name: 'Governing Documents', description: 'desc' },
  ]),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: createUnscopedClientMock,
}));

vi.mock('@propertypro/db', () => ({
  communities: communitiesTable,
  userRoles: userRolesTable,
  documentCategories: documentCategoriesTable,
  notificationPreferences: notificationPreferencesTable,
  logAuditEvent: logAuditEventMock,
}));

vi.mock('@propertypro/shared', async (importActual) => {
  const actual = await importActual<typeof import('@propertypro/shared')>();
  return {
    ...actual,
    getDefaultDocumentCategories: getDefaultDocumentCategoriesMock,
  };
});

vi.mock('@/lib/services/onboarding-checklist-service', () => ({
  createChecklistItems: createChecklistItemsMock,
}));

vi.mock('@/lib/services/starter-pack-service', () => ({
  applyStarterPackToCommunity: applyStarterPackMock,
}));

vi.mock('@/lib/api/branding', () => ({
  seedDefaultSiteBranding: seedDefaultSiteBrandingMock,
}));

// Service import must come after all vi.mock calls
import { createCommunityForPm } from '../../src/lib/pm/create-community';

// ---------------------------------------------------------------------------
// DB mock — capture every userRoles insert
// ---------------------------------------------------------------------------

type UserRoleInsert = {
  userId: string;
  communityId: number;
  role: string;
  displayTitle?: string;
};

/**
 * Build a transaction-aware unscoped-db mock. Records the values passed to
 * every `tx.insert(userRoles).values(...)` call.
 */
function buildDb(): { userRoleInserts: UserRoleInsert[] } {
  const userRoleInserts: UserRoleInsert[] = [];

  const returningMock = vi.fn(() =>
    Promise.resolve([{ id: 42, slug: 'sunset-condos' }]),
  );

  const valuesMock = vi.fn((table: unknown) => (values: unknown) => {
    if (table === userRolesTable) {
      userRoleInserts.push(values as UserRoleInsert);
    }
    return { returning: returningMock };
  });

  const insertMock = vi.fn((table: unknown) => ({
    values: valuesMock(table),
  }));

  const tx = { insert: insertMock };

  const db = {
    transaction: vi.fn((cb: (tx: typeof tx) => unknown) => cb(tx)),
  };

  createUnscopedClientMock.mockReturnValue(db);

  return { userRoleInserts };
}

const VALID_INPUT = {
  userId: 'creator-uuid-001',
  name: 'Sunset Condos',
  communityType: 'condo_718' as const,
  addressLine1: '123 Main St',
  city: 'Miami',
  state: 'FL',
  zipCode: '33101',
  subdomain: 'sunset-condos',
  timezone: 'America/New_York',
  unitCount: 50,
};

describe('createCommunityForPm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('assigns the community creator the root_manager role (creator-is-root)', async () => {
    const { userRoleInserts } = buildDb();

    const result = await createCommunityForPm(VALID_INPUT);

    expect(result.communityId).toBe(42);

    const founding = userRoleInserts.find(
      (r) => r.userId === VALID_INPUT.userId,
    );
    expect(founding).toBeDefined();
    expect(founding?.role).toBe('root_manager');
    expect(founding?.displayTitle).toBe('Administrator');
  });
});
