/**
 * Cross-tenant guard for attaching an EXISTING platform user to a community.
 *
 * `users` has no `community_id`, so `createScopedClient` does not isolate it and
 * the add-resident paths match an invitee by email across the whole platform.
 * Without this guard a manager of community X could type the email address of a
 * resident of community Y, bind their id into X, and read back their real name,
 * email and phone from the residents list. See issue #940.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { findUserCommunitiesUnscopedMock, getUserByIdMock } = vi.hoisted(() => ({
  findUserCommunitiesUnscopedMock: vi.fn(),
  getUserByIdMock: vi.fn(),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  findUserCommunitiesUnscoped: findUserCommunitiesUnscopedMock,
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: () => ({ auth: { admin: { getUserById: getUserByIdMock } } }),
}));

import { assertActorMayAttachExistingUser } from '@/lib/services/user-linking';
import { ForbiddenError } from '@/lib/api/errors';

const ACTOR = 'aaaaaaaa-0000-0000-0000-000000000001';
const TARGET = 'bbbbbbbb-0000-0000-0000-000000000002';

/**
 * The guard reads communityId + role + communityType + isUnitOwner. Default to a
 * property_manager in a condo, which holds `residents:read`.
 */
const memberships = (...ids: number[]) =>
  ids.map((communityId) => ({
    communityId,
    communityType: 'condo_718' as const,
    role: 'property_manager' as const,
    isUnitOwner: false,
  }));

function whenMemberships(byUser: Record<string, number[]>) {
  findUserCommunitiesUnscopedMock.mockImplementation(async (userId: string) =>
    memberships(...(byUser[userId] ?? [])),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: an orphaned row belongs to a real, activated account.
  getUserByIdMock.mockResolvedValue({ data: { user: { id: TARGET } }, error: null });
});

describe('assertActorMayAttachExistingUser', () => {
  it('REFUSES when the actor shares no community with the target', async () => {
    // The attack: a manager of community 1 naming a resident of community 2.
    whenMemberships({ [ACTOR]: [1], [TARGET]: [2] });

    await expect(
      assertActorMayAttachExistingUser({
        actorUserId: ACTOR,
        targetUserId: TARGET,
        communityId: 1,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('allows when they share a community — the PM running two associations', async () => {
    // Nothing crosses a boundary it was not already across: the actor already
    // administers community 2, where the target is a member.
    whenMemberships({ [ACTOR]: [1, 2], [TARGET]: [2] });

    await expect(
      assertActorMayAttachExistingUser({
        actorUserId: ACTOR,
        targetUserId: TARGET,
        communityId: 1,
      }),
    ).resolves.toBeUndefined();
  });

  it('allows when the target is already a member of the destination community', async () => {
    // Re-adding an existing member discloses nothing; the callers reject the
    // duplicate role separately with a clearer message.
    whenMemberships({ [ACTOR]: [1], [TARGET]: [1] });

    await expect(
      assertActorMayAttachExistingUser({
        actorUserId: ACTOR,
        targetUserId: TARGET,
        communityId: 1,
      }),
    ).resolves.toBeUndefined();

    // Short-circuits before reading the actor's memberships at all.
    expect(findUserCommunitiesUnscopedMock).toHaveBeenCalledTimes(1);
  });

  it('REFUSES an orphaned row that belongs to an ACTIVATED account', async () => {
    whenMemberships({ [ACTOR]: [1], [TARGET]: [] });
    getUserByIdMock.mockResolvedValue({ data: { user: { id: TARGET } }, error: null });

    await expect(
      assertActorMayAttachExistingUser({
        actorUserId: ACTOR,
        targetUserId: TARGET,
        communityId: 1,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('ALLOWS an orphaned row that was never activated, so an email cannot be burned', async () => {
    // `users.email` is UNIQUE and removing a resident hard-deletes only the role
    // row, so "add resident then remove them" leaves exactly this shape.
    // Refusing it would make that address permanently unusable in EVERY
    // community — a griefing primitive handed to any manager.
    whenMemberships({ [ACTOR]: [1], [TARGET]: [] });
    getUserByIdMock.mockResolvedValue({ data: { user: null }, error: null });

    await expect(
      assertActorMayAttachExistingUser({
        actorUserId: ACTOR,
        targetUserId: TARGET,
        communityId: 1,
      }),
    ).resolves.toBeUndefined();
  });

  it('fails CLOSED when the auth lookup errors', async () => {
    // An unreadable auth state must not be read as "unclaimed stub, take it".
    whenMemberships({ [ACTOR]: [1], [TARGET]: [] });
    getUserByIdMock.mockResolvedValue({ data: null, error: { message: 'upstream down' } });

    await expect(
      assertActorMayAttachExistingUser({
        actorUserId: ACTOR,
        targetUserId: TARGET,
        communityId: 1,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('REFUSES when the actor shares a community but CANNOT read residents there', async () => {
    // Apartment tenants have `residents: { read: false }`. Bare shared
    // membership would let such a tenant pull a neighbour they cannot see in
    // their own building into a community they happen to manage.
    findUserCommunitiesUnscopedMock.mockImplementation(async (userId: string) =>
      userId === TARGET
        ? [{ communityId: 5, communityType: 'apartment', role: 'resident', isUnitOwner: false }]
        : [{ communityId: 5, communityType: 'apartment', role: 'resident', isUnitOwner: false }],
    );

    await expect(
      assertActorMayAttachExistingUser({
        actorUserId: ACTOR,
        targetUserId: TARGET,
        communityId: 1,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('uses pre-loaded actor memberships when supplied, without re-reading them', async () => {
    // The bulk import hoists this out of its row loop; a 500-row CSV must not
    // issue 500 identical lookups of the actor's own memberships.
    findUserCommunitiesUnscopedMock.mockResolvedValue(memberships(2));

    await expect(
      assertActorMayAttachExistingUser({
        actorUserId: ACTOR,
        targetUserId: TARGET,
        communityId: 1,
        actorCommunities: memberships(2),
      }),
    ).resolves.toBeUndefined();

    // Only the TARGET lookup — the actor's was supplied.
    expect(findUserCommunitiesUnscopedMock).toHaveBeenCalledTimes(1);
    expect(findUserCommunitiesUnscopedMock).toHaveBeenCalledWith(TARGET);
  });

  it('REFUSES when the actor has no memberships at all', async () => {
    whenMemberships({ [ACTOR]: [], [TARGET]: [2] });

    await expect(
      assertActorMayAttachExistingUser({
        actorUserId: ACTOR,
        targetUserId: TARGET,
        communityId: 1,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('allows attaching yourself without any cross-community read', async () => {
    await expect(
      assertActorMayAttachExistingUser({
        actorUserId: ACTOR,
        targetUserId: ACTOR,
        communityId: 1,
      }),
    ).resolves.toBeUndefined();

    expect(findUserCommunitiesUnscopedMock).not.toHaveBeenCalled();
  });

  it('does not leak the target profile through the error message', async () => {
    whenMemberships({ [ACTOR]: [1], [TARGET]: [2] });

    const error = await assertActorMayAttachExistingUser({
      actorUserId: ACTOR,
      targetUserId: TARGET,
      communityId: 1,
    }).catch((e: unknown) => e as Error);

    // The refusal necessarily confirms the address is registered; it must not
    // also hand over the id, the community, or any profile field.
    expect(error.message).not.toContain(TARGET);
    expect(error.message).not.toContain('2');
    expect(error.message).toMatch(/request access/i);
  });
});
