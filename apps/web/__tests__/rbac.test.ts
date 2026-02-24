/**
 * P4-57 RBAC matrix unit tests.
 *
 * Coverage strategy:
 * 1. Exhaustive: programmatically iterate all 378 cells
 *    (7 roles × 3 community types × 9 resources × 2 actions)
 *    and assert checkPermission() matches RBAC_MATRIX.
 * 2. Policy invariants: spot-check critical rules that must never regress,
 *    including ROLE_COMMUNITY_CONSTRAINTS consistency (covers all invalid
 *    role/community-type combinations programmatically).
 *
 * No vi.mock needed — checkPermission is a pure function with no side effects.
 */
import { describe, expect, it } from 'vitest';
import {
  checkPermission,
  RBAC_MATRIX,
  RBAC_RESOURCES,
  RBAC_ACTIONS,
  COMMUNITY_ROLES,
  COMMUNITY_TYPES,
  ROLE_COMMUNITY_CONSTRAINTS,
  type CommunityRole,
  type CommunityType,
} from '@propertypro/shared';

// ---------------------------------------------------------------------------
// 1. Exhaustive: 378 cells (7 × 3 × 9 × 2)
// ---------------------------------------------------------------------------

describe('checkPermission — exhaustive RBAC_MATRIX coverage', () => {
  for (const communityType of COMMUNITY_TYPES) {
    for (const role of COMMUNITY_ROLES) {
      for (const resource of RBAC_RESOURCES) {
        for (const action of RBAC_ACTIONS) {
          const expected = RBAC_MATRIX[communityType][role][resource][action];
          it(
            `${role} / ${communityType} / ${resource} / ${action} → ${String(expected)}`,
            () => {
              expect(
                checkPermission(role, communityType, resource, action),
              ).toBe(expected);
            },
          );
        }
      }
    }
  }
});

// ---------------------------------------------------------------------------
// 2. Policy invariants
// ---------------------------------------------------------------------------

describe('policy invariants', () => {

  // --- meetings and compliance are condo/HOA only ---

  it('apartment tenant cannot read meetings', () => {
    expect(checkPermission('tenant', 'apartment', 'meetings', 'read')).toBe(false);
  });

  it('apartment tenant cannot write meetings', () => {
    expect(checkPermission('tenant', 'apartment', 'meetings', 'write')).toBe(false);
  });

  it('apartment site_manager cannot read compliance', () => {
    expect(checkPermission('site_manager', 'apartment', 'compliance', 'read')).toBe(false);
  });

  it('apartment site_manager cannot write compliance', () => {
    expect(checkPermission('site_manager', 'apartment', 'compliance', 'write')).toBe(false);
  });

  it('apartment property_manager_admin cannot read meetings', () => {
    expect(checkPermission('property_manager_admin', 'apartment', 'meetings', 'read')).toBe(false);
  });

  it('apartment property_manager_admin cannot read compliance', () => {
    expect(checkPermission('property_manager_admin', 'apartment', 'compliance', 'read')).toBe(false);
  });

  // --- audit is always read-only (write always false for all roles/types) ---

  for (const role of COMMUNITY_ROLES) {
    for (const communityType of COMMUNITY_TYPES) {
      it(`${role} in ${communityType} cannot write audit (internal only)`, () => {
        expect(checkPermission(role, communityType, 'audit', 'write')).toBe(false);
      });
    }
  }

  // --- settings write: only board_president and property_manager_admin ---

  it('board_member cannot write settings in condo_718', () => {
    expect(checkPermission('board_member', 'condo_718', 'settings', 'write')).toBe(false);
  });

  it('board_member cannot write settings in hoa_720', () => {
    expect(checkPermission('board_member', 'hoa_720', 'settings', 'write')).toBe(false);
  });

  it('cam cannot write settings in condo_718', () => {
    expect(checkPermission('cam', 'condo_718', 'settings', 'write')).toBe(false);
  });

  it('owner cannot write settings in condo_718', () => {
    expect(checkPermission('owner', 'condo_718', 'settings', 'write')).toBe(false);
  });

  it('tenant cannot write settings in condo_718', () => {
    expect(checkPermission('tenant', 'condo_718', 'settings', 'write')).toBe(false);
  });

  it('board_president can write settings in condo_718', () => {
    expect(checkPermission('board_president', 'condo_718', 'settings', 'write')).toBe(true);
  });

  it('board_president can write settings in hoa_720', () => {
    expect(checkPermission('board_president', 'hoa_720', 'settings', 'write')).toBe(true);
  });

  it('property_manager_admin can write settings in condo_718', () => {
    expect(checkPermission('property_manager_admin', 'condo_718', 'settings', 'write')).toBe(true);
  });

  it('property_manager_admin can write settings in hoa_720', () => {
    expect(checkPermission('property_manager_admin', 'hoa_720', 'settings', 'write')).toBe(true);
  });

  it('property_manager_admin can write settings in apartment', () => {
    expect(checkPermission('property_manager_admin', 'apartment', 'settings', 'write')).toBe(true);
  });

  it('site_manager cannot write settings in apartment', () => {
    expect(checkPermission('site_manager', 'apartment', 'settings', 'write')).toBe(false);
  });

  // --- owner/tenant can write maintenance (their own requests) ---

  it('condo_718 owner can write maintenance', () => {
    expect(checkPermission('owner', 'condo_718', 'maintenance', 'write')).toBe(true);
  });

  it('condo_718 tenant can write maintenance', () => {
    expect(checkPermission('tenant', 'condo_718', 'maintenance', 'write')).toBe(true);
  });

  it('hoa_720 owner can write maintenance', () => {
    expect(checkPermission('owner', 'hoa_720', 'maintenance', 'write')).toBe(true);
  });

  it('apartment tenant can write maintenance', () => {
    expect(checkPermission('tenant', 'apartment', 'maintenance', 'write')).toBe(true);
  });

  // --- owner/tenant cannot access contracts ---

  it('condo_718 owner cannot read contracts', () => {
    expect(checkPermission('owner', 'condo_718', 'contracts', 'read')).toBe(false);
  });

  it('condo_718 owner cannot write contracts', () => {
    expect(checkPermission('owner', 'condo_718', 'contracts', 'write')).toBe(false);
  });

  it('condo_718 tenant cannot read contracts', () => {
    expect(checkPermission('tenant', 'condo_718', 'contracts', 'read')).toBe(false);
  });

  it('hoa_720 tenant cannot read contracts', () => {
    expect(checkPermission('tenant', 'hoa_720', 'contracts', 'read')).toBe(false);
  });

  // --- owner/tenant cannot access audit ---

  it('condo_718 owner cannot read audit', () => {
    expect(checkPermission('owner', 'condo_718', 'audit', 'read')).toBe(false);
  });

  it('condo_718 tenant cannot read audit', () => {
    expect(checkPermission('tenant', 'condo_718', 'audit', 'read')).toBe(false);
  });

  // --- admin roles can read audit ---

  it('board_member can read audit in condo_718', () => {
    expect(checkPermission('board_member', 'condo_718', 'audit', 'read')).toBe(true);
  });

  it('board_president can read audit in condo_718', () => {
    expect(checkPermission('board_president', 'condo_718', 'audit', 'read')).toBe(true);
  });

  it('cam can read audit in condo_718', () => {
    expect(checkPermission('cam', 'condo_718', 'audit', 'read')).toBe(true);
  });

  it('site_manager can read audit in apartment', () => {
    expect(checkPermission('site_manager', 'apartment', 'audit', 'read')).toBe(true);
  });

  it('property_manager_admin can read audit in apartment', () => {
    expect(checkPermission('property_manager_admin', 'apartment', 'audit', 'read')).toBe(true);
  });

  // --- owner can read settings in condo/HOA ---

  it('condo_718 owner can read settings', () => {
    expect(checkPermission('owner', 'condo_718', 'settings', 'read')).toBe(true);
  });

  it('hoa_720 owner can read settings', () => {
    expect(checkPermission('owner', 'hoa_720', 'settings', 'read')).toBe(true);
  });

  it('condo_718 tenant cannot read settings', () => {
    expect(checkPermission('tenant', 'condo_718', 'settings', 'read')).toBe(false);
  });

  // --- admin roles can write announcements/meetings ---

  it('board_member can write announcements in condo_718', () => {
    expect(checkPermission('board_member', 'condo_718', 'announcements', 'write')).toBe(true);
  });

  it('board_member can write meetings in condo_718', () => {
    expect(checkPermission('board_member', 'condo_718', 'meetings', 'write')).toBe(true);
  });

  it('condo_718 owner cannot write announcements', () => {
    expect(checkPermission('owner', 'condo_718', 'announcements', 'write')).toBe(false);
  });

  it('condo_718 owner cannot write meetings', () => {
    expect(checkPermission('owner', 'condo_718', 'meetings', 'write')).toBe(false);
  });

  it('condo_718 tenant cannot write announcements', () => {
    expect(checkPermission('tenant', 'condo_718', 'announcements', 'write')).toBe(false);
  });

  // --- residents write is admin-only ---

  it('condo_718 owner cannot write residents', () => {
    expect(checkPermission('owner', 'condo_718', 'residents', 'write')).toBe(false);
  });

  it('condo_718 tenant cannot write residents', () => {
    expect(checkPermission('tenant', 'condo_718', 'residents', 'write')).toBe(false);
  });

  it('board_member can write residents in condo_718', () => {
    expect(checkPermission('board_member', 'condo_718', 'residents', 'write')).toBe(true);
  });

  it('site_manager can write residents in apartment', () => {
    expect(checkPermission('site_manager', 'apartment', 'residents', 'write')).toBe(true);
  });

  it('apartment tenant cannot write residents', () => {
    expect(checkPermission('tenant', 'apartment', 'residents', 'write')).toBe(false);
  });

  // --- documents read for all valid roles, write for admins ---

  it('condo_718 owner can read documents', () => {
    expect(checkPermission('owner', 'condo_718', 'documents', 'read')).toBe(true);
  });

  it('condo_718 owner cannot write documents', () => {
    expect(checkPermission('owner', 'condo_718', 'documents', 'write')).toBe(false);
  });

  it('board_member can write documents in condo_718', () => {
    expect(checkPermission('board_member', 'condo_718', 'documents', 'write')).toBe(true);
  });

  it('apartment tenant can read documents', () => {
    expect(checkPermission('tenant', 'apartment', 'documents', 'read')).toBe(true);
  });

  it('apartment tenant cannot write documents', () => {
    expect(checkPermission('tenant', 'apartment', 'documents', 'write')).toBe(false);
  });

  // --- ROLE_COMMUNITY_CONSTRAINTS consistency ---
  // Invalid role/community combos must be false for ALL resources and actions

  it('RBAC_MATRIX is consistent with ROLE_COMMUNITY_CONSTRAINTS', () => {
    for (const communityType of COMMUNITY_TYPES) {
      const allowedRoles = ROLE_COMMUNITY_CONSTRAINTS[communityType] as readonly CommunityRole[];
      for (const role of COMMUNITY_ROLES) {
        const isAllowed = (allowedRoles as readonly string[]).includes(role);
        if (!isAllowed) {
          for (const resource of RBAC_RESOURCES) {
            for (const action of RBAC_ACTIONS) {
              expect(
                checkPermission(role, communityType, resource, action),
                `${role} in ${communityType} / ${resource} / ${action} must be false (invalid combo)`,
              ).toBe(false);
            }
          }
        }
      }
    }
  });

  // --- hoa_720 policy equals condo_718 policy ---
  // Structural check: the two community types have identical permission profiles

  it('hoa_720 and condo_718 have identical permission profiles', () => {
    for (const role of COMMUNITY_ROLES) {
      for (const resource of RBAC_RESOURCES) {
        for (const action of RBAC_ACTIONS) {
          expect(
            checkPermission(role, 'hoa_720', resource, action),
            `${role} / ${resource} / ${action} must match between condo_718 and hoa_720`,
          ).toBe(checkPermission(role, 'condo_718', resource, action));
        }
      }
    }
  });
});
