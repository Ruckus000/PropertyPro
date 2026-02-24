/**
 * Shared multi-tenant integration test kit.
 *
 * Provides DB lifecycle management, actor switching, request builders,
 * response parsing helpers, and seed/teardown utilities that are reused
 * across all multi-tenant integration test files.
 *
 * Cleanup is derived dynamically from seeded data maps — not hardcoded.
 */
import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { NextRequest } from 'next/server';
import postgres from 'postgres';
import type {
  MultiTenantCommunityFixture,
  MultiTenantCommunityKey,
} from '../../fixtures/multi-tenant-communities';
import type { MultiTenantUserFixture, MultiTenantUserKey } from '../../fixtures/multi-tenant-users';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DbModule = typeof import('@propertypro/db');

export interface SeededCommunity {
  id: number;
  fixture: MultiTenantCommunityFixture;
}

export interface SeededUser {
  id: string;
  fixture: MultiTenantUserFixture;
  communityId: number;
}

export interface TestKitState {
  dbModule: DbModule;
  db: ReturnType<typeof drizzle>;
  sqlClient: ReturnType<typeof postgres>;
  runSuffix: string;
  communities: Map<MultiTenantCommunityKey, SeededCommunity>;
  users: Map<MultiTenantUserKey, SeededUser>;
  runtimeCleanupUserIds: Set<string>;
  currentActorUserId: string | null;
}

// ---------------------------------------------------------------------------
// Lifecycle: init / teardown
// ---------------------------------------------------------------------------

/**
 * Initializes the database connection and imports the DB module.
 * Does NOT seed any data — call `seedCommunities` and `seedUsers` for that.
 */
export async function initTestKit(): Promise<TestKitState> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for integration tests');
  }

  const dbModule = await import('@propertypro/db');
  const sqlClient = postgres(databaseUrl, { prepare: false });
  const db = drizzle(sqlClient);

  return {
    dbModule,
    db,
    sqlClient,
    runSuffix: randomUUID().slice(0, 8),
    communities: new Map(),
    users: new Map(),
    runtimeCleanupUserIds: new Set(),
    currentActorUserId: null,
  };
}

/**
 * Seeds communities from an array of fixtures into the database.
 * Populates `state.communities` for later reference.
 */
export async function seedCommunities(
  state: TestKitState,
  fixtures: readonly MultiTenantCommunityFixture[],
): Promise<void> {
  for (const fixture of fixtures) {
    const [inserted] = await state.db
      .insert(state.dbModule.communities)
      .values({
        name: `${fixture.name} ${state.runSuffix}`,
        slug: `${fixture.slugBase}-${state.runSuffix}`,
        communityType: fixture.communityType,
        timezone: fixture.timezone,
      })
      .returning({ id: state.dbModule.communities.id });

    if (!inserted) {
      throw new Error(`Failed to seed community "${fixture.key}"`);
    }

    state.communities.set(fixture.key, { id: inserted.id, fixture });
  }
}

/**
 * Seeds users and their role assignments from an array of fixtures.
 * Requires communities to already be seeded. Populates `state.users`.
 */
export async function seedUsers(
  state: TestKitState,
  fixtures: readonly MultiTenantUserFixture[],
  unitIds?: Map<MultiTenantUserKey, number>,
): Promise<void> {
  for (const fixture of fixtures) {
    const community = state.communities.get(fixture.communityKey);
    if (!community) {
      throw new Error(
        `Community "${fixture.communityKey}" not seeded before user "${fixture.key}"`,
      );
    }

    const userId = randomUUID();
    state.users.set(fixture.key, {
      id: userId,
      fixture,
      communityId: community.id,
    });

    await state.db.insert(state.dbModule.users).values({
      id: userId,
      email: `${fixture.emailPrefix}+${state.runSuffix}@example.com`,
      fullName: `${fixture.fullName} ${state.runSuffix}`,
      phone: null,
    });

    const scoped = state.dbModule.createScopedClient(community.id);
    await scoped.insert(state.dbModule.userRoles, {
      userId,
      role: fixture.role,
      unitId: unitIds?.get(fixture.key) ?? null,
    });
  }
}

/**
 * Tears down all seeded data. Community cascading deletes handle most
 * child rows. Users are in a global table and must be deleted explicitly.
 */
export async function teardownTestKit(state: TestKitState): Promise<void> {
  const communityIds = [...state.communities.values()].map((c) => c.id);
  const seededUserIds = [...state.users.values()].map((u) => u.id);
  const runtimeUserIds = [...state.runtimeCleanupUserIds];
  const userIds = [...new Set([...seededUserIds, ...runtimeUserIds])];

  try {
    if (communityIds.length > 0) {
      try {
        await state.db
          .delete(state.dbModule.communities)
          .where(inArray(state.dbModule.communities.id, communityIds));
      } catch {
        // compliance_audit_log is DB-enforced append-only with FK restrict.
        // If audited mutations ran, teardown cannot delete parent communities.
      }
    }

    if (userIds.length > 0) {
      try {
        await state.db
          .delete(state.dbModule.users)
          .where(inArray(state.dbModule.users.id, userIds));
      } catch {
        // Best-effort cleanup only; users referenced by append-only audit rows cannot be deleted.
      }
    }
  } finally {
    await state.sqlClient.end();
  }
}

export function trackUserForCleanup(state: TestKitState, userId: string): void {
  state.runtimeCleanupUserIds.add(userId);
}

// ---------------------------------------------------------------------------
// Accessor helpers
// ---------------------------------------------------------------------------

export function requireCommunity(state: TestKitState, key: MultiTenantCommunityKey): SeededCommunity {
  const community = state.communities.get(key);
  if (!community) {
    throw new Error(`Community "${key}" has not been seeded`);
  }
  return community;
}

export function requireUser(state: TestKitState, key: MultiTenantUserKey): SeededUser {
  const user = state.users.get(key);
  if (!user) {
    throw new Error(`User "${key}" has not been seeded`);
  }
  return user;
}

// ---------------------------------------------------------------------------
// Actor management
// ---------------------------------------------------------------------------

export function setActor(state: TestKitState, userKey: MultiTenantUserKey): void {
  const user = requireUser(state, userKey);
  state.currentActorUserId = user.id;
}

export function setActorById(state: TestKitState, userId: string): void {
  state.currentActorUserId = userId;
}

export function requireCurrentActor(state: TestKitState): string {
  if (!state.currentActorUserId) {
    throw new Error('Current test actor user ID is not set');
  }
  return state.currentActorUserId;
}

// ---------------------------------------------------------------------------
// Request builders
// ---------------------------------------------------------------------------

export function apiUrl(pathname: string): string {
  return `http://localhost:3000${pathname}`;
}

export function jsonRequest(
  url: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body: Record<string, unknown>,
  headers?: Record<string, string>,
): NextRequest {
  return new NextRequest(url, {
    method,
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

export async function parseJson<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Row utilities
// ---------------------------------------------------------------------------

export function requireInsertedRow(
  row: Record<string, unknown> | undefined,
  label: string,
): Record<string, unknown> {
  if (!row) {
    throw new Error(`Missing inserted row for ${label}`);
  }
  return row;
}

export function readNumberField(row: Record<string, unknown>, field: string): number {
  const value = row[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Expected numeric field "${field}" but received ${String(value)}`);
  }
  return value;
}

export function mapValueOrThrow<K extends string, V>(map: Map<K, V>, key: K, label: string): V {
  const value = map.get(key);
  if (value === undefined) {
    throw new Error(`Missing ${label} for key "${key}"`);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Environment helpers
// ---------------------------------------------------------------------------

/**
 * Asserts that DATABASE_URL is set when running in CI.
 * Call at module scope in each integration test file so the suite
 * fails fast rather than silently skipping in CI.
 */
export function requireDatabaseUrlInCI(suiteName: string): void {
  if (process.env.CI && !process.env.DATABASE_URL) {
    throw new Error(`${suiteName} requires DATABASE_URL in CI`);
  }
}

/**
 * Returns `describe` when DATABASE_URL is set, `describe.skip` otherwise.
 * Centralises the skip-when-no-DB pattern used by every integration suite.
 */
export function getDescribeDb(): typeof describe {
  return process.env.DATABASE_URL ? describe : describe.skip;
}
