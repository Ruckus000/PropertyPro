/**
 * Authorization for the community-export routes.
 *
 * ── Why this file exists ──
 *
 * The export-jobs routes shipped gated on `requirePermission(membership,
 * 'settings', 'read')` under a comment claiming it was "admin-tier only". It
 * is not: the RBAC matrix grants `settings: { read: true }` to the `owner` row,
 * and `resolveMatrixRole` maps every `resident` with `isUnitOwner: true` onto
 * that row. Every unit owner could queue and download an archive of ~25 tables
 * plus every file in the community's `documents` bucket.
 *
 * Nothing caught it because no test exercised the permission bar at all — and
 * the one test that did touch the legacy route's identical bar asserted
 * `allows owner role access`, faithfully encoding the defect as intent.
 *
 * These tests pin the bar itself, in both directions, so a future widening has
 * to be deliberate.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-07.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requireFreshReauthMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requireFreshReauthMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));
vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));
vi.mock('@/lib/api/tenant-context', () => ({
  resolveEffectiveCommunityId: resolveEffectiveCommunityIdMock,
}));
vi.mock('@/lib/api/reauth-guard', () => ({
  requireFreshReauth: requireFreshReauthMock,
}));

const { requireExportAccess, requireExportPermission } = await import(
  '@/lib/services/export/export-route-auth'
);

/** Minimal membership; `role`/`isAdmin`/`designation` are what the gate reads. */
function membership(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'user-1',
    communityId: 42,
    role: 'resident',
    isAdmin: false,
    isUnitOwner: true,
    designation: null,
    communityType: 'condo_718',
    displayTitle: 'Owner',
    ...overrides,
  } as never;
}

function request(headers: Record<string, string> = {}) {
  return { headers: { get: (k: string) => headers[k.toLowerCase()] ?? null } } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
  resolveEffectiveCommunityIdMock.mockReturnValue(42);
  requireFreshReauthMock.mockResolvedValue(undefined);
});

describe('requireExportPermission', () => {
  it.each([
    ['a plain unit owner', { isAdmin: false, isUnitOwner: true, designation: null }],
    ['a tenant', { isAdmin: false, isUnitOwner: false, designation: null }],
  ])('REFUSES %s', (_label, over) => {
    // The regression that matters. An owner's own matrix row denies them
    // `audit: read` and `contracts: read`, yet the archive ships
    // `compliance_audit_log`, `contracts`, `vendors` and `insurance_policies`.
    expect(() => requireExportPermission(membership(over))).toThrow(
      /property manager or a board member/,
    );
  });

  it.each([
    ['property_manager', { role: 'property_manager', isAdmin: true }],
    ['root_manager', { role: 'root_manager', isAdmin: true }],
  ])('allows %s', (_label, over) => {
    expect(() => requireExportPermission(membership(over))).not.toThrow();
  });

  it.each(['board_president', 'board_member'])(
    'allows a resident carrying the %s designation',
    (designation) => {
      // Designation is orthogonal to role (ADR-006 §3.2). An isAdmin-only check
      // would refuse a self-managed association's board — the people who
      // actually run this — so the gate reads both.
      expect(() =>
        requireExportPermission(membership({ isAdmin: false, designation })),
      ).not.toThrow();
    },
  );

  it('does not accept an arbitrary designation string', () => {
    // `designation` is a nullable text column; `hasBoardDesignation` validates
    // against the known set rather than truthiness.
    expect(() =>
      requireExportPermission(membership({ designation: 'committee_chair' })),
    ).toThrow();
  });
});

describe('requireExportAccess', () => {
  it('demands a fresh reauth BEFORE resolving the community', async () => {
    // Ordering matters: without it a stolen session cookie alone pulls the
    // archive. The legacy sync route always required this; the job routes
    // shipped without it.
    requireCommunityMembershipMock.mockResolvedValue(membership({ isAdmin: true }));

    await requireExportAccess(request(), 42);

    expect(requireFreshReauthMock).toHaveBeenCalledWith('user-1');
    expect(requireFreshReauthMock.mock.invocationCallOrder[0]).toBeLessThan(
      requireCommunityMembershipMock.mock.invocationCallOrder[0]!,
    );
  });

  it('refuses a failed reauth without ever loading membership', async () => {
    requireFreshReauthMock.mockRejectedValueOnce(new Error('reauth required'));

    await expect(requireExportAccess(request(), 42)).rejects.toThrow();
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
  });

  it('refuses under support impersonation, before reauth', async () => {
    await expect(
      requireExportAccess(request({ 'x-support-session-id': 'sess-1' }), 42),
    ).rejects.toThrow(/support session/);
    expect(requireFreshReauthMock).not.toHaveBeenCalled();
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
  });

  it('refuses an owner even with a valid session and reauth', async () => {
    requireCommunityMembershipMock.mockResolvedValue(membership());

    await expect(requireExportAccess(request(), 42)).rejects.toThrow(
      /property manager or a board member/,
    );
  });

  it('returns the context for an admin', async () => {
    requireCommunityMembershipMock.mockResolvedValue(membership({ isAdmin: true }));

    const ctx = await requireExportAccess(request(), 42);

    expect(ctx).toMatchObject({ actorUserId: 'user-1', communityId: 42 });
  });
});
