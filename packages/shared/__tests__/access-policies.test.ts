import { describe, expect, it } from 'vitest';
import type { CommunityRole, CommunityType } from '../src';
import type { ManagerPermissions } from '../src/manager-permissions';
import {
  canAccessCategory,
  canAccessDocument,
  getAccessibleKnownCategories,
  isElevatedRole,
  isRestrictedRole,
  normalizeCategoryName,
} from '../src/access-policies';

/**
 * Build a minimal ManagerPermissions for tests that only exercise the
 * document_categories field. Cast keeps the literal terse — the access-policies
 * functions under test only read `permissions.document_categories`.
 */
function perms(document_categories: ManagerPermissions['document_categories']): ManagerPermissions {
  return { document_categories } as ManagerPermissions;
}

// role-v3 collapse (R3-01): the document-access policy is keyed by the 3
// reachable rows only. Runtime roles are v3 (`resident` / `property_manager` /
// `root_manager`); the owner/tenant/property_manager_admin legacy names remain
// valid direct inputs. The dropped legacy admin names (board_member /
// board_president / cam / site_manager) are unreachable and resolve to no access.

describe('access-policies strict matrix', () => {
  it('normalizes aliases and returns unknown for unmapped values', () => {
    expect(normalizeCategoryName('Rules & Regulations')).toBe('rules');
    expect(normalizeCategoryName('board-minutes')).toBe('meeting_minutes');
    expect(normalizeCategoryName('Lease Agreement')).toBe('lease_docs');
    expect(normalizeCategoryName('Governing Documents')).toBe('declaration');
    expect(normalizeCategoryName('Meeting Records')).toBe('meeting_minutes');
    expect(normalizeCategoryName('Correspondence')).toBe('announcements');
    expect(normalizeCategoryName('Communications')).toBe('announcements');
    expect(normalizeCategoryName('Lease Agreements')).toBe('lease_docs');
    expect(normalizeCategoryName('Financial Records')).toBe('financial_records');
    expect(normalizeCategoryName('Financials')).toBe('financial_records');
    expect(normalizeCategoryName('Contracts')).toBe('contracts');
    expect(normalizeCategoryName('custom category')).toBe('unknown');
    expect(normalizeCategoryName(null)).toBe('unknown');
  });

  it('keeps financial_records/contracts visible only to elevated roles', () => {
    for (const communityType of ['condo_718', 'hoa_720'] as CommunityType[]) {
      for (const key of ['financial_records', 'contracts'] as const) {
        // Elevated: unit owners + the management tier.
        expect(canAccessCategory('owner', communityType, key)).toBe(true);
        expect(canAccessCategory('property_manager_admin', communityType, key)).toBe(true);
        expect(canAccessCategory('property_manager', communityType, key)).toBe(true);
        // Tenants do not (same as the prior 'unknown' fallthrough).
        expect(canAccessCategory('tenant', communityType, key)).toBe(false);
      }
    }
  });

  it('grants condo/HOA insurance + elections to owners and the management tier, not tenants', () => {
    for (const communityType of ['condo_718', 'hoa_720'] as CommunityType[]) {
      for (const key of ['insurance', 'elections'] as const) {
        expect(canAccessCategory('owner', communityType, key)).toBe(true);
        expect(canAccessCategory('property_manager_admin', communityType, key)).toBe(true);
        expect(canAccessCategory('property_manager', communityType, key)).toBe(true);
        // ...but tenants cannot.
        expect(canAccessCategory('tenant', communityType, key)).toBe(false);
      }
    }
  });

  it('classifies elevated and restricted roles', () => {
    expect(isElevatedRole('owner')).toBe(true);
    expect(isElevatedRole('property_manager_admin')).toBe(true);
    expect(isRestrictedRole('tenant')).toBe(true);
  });

  // role-v3 phase 4.1 (ADR-006): property_manager is uniformly elevated for
  // document-category visibility, regardless of any per-row JSONB permissions.
  it('treats property_manager as uniformly elevated regardless of JSONB permissions', () => {
    // No permissions opts at all → still elevated (covers the 211 null-perms ex-pm_admins).
    expect(isElevatedRole('property_manager')).toBe(true);
    // Even with a restrictive JSONB document_categories value → still elevated.
    expect(
      isElevatedRole('property_manager', {
        permissions: perms(['rules']),
      }),
    ).toBe(true);
    // root_manager remains elevated too.
    expect(isElevatedRole('root_manager')).toBe(true);
    // property_manager is not "restricted".
    expect(isRestrictedRole('property_manager')).toBe(false);
  });

  it('grants property_manager all known categories in every community type', () => {
    const communityTypes: CommunityType[] = ['condo_718', 'hoa_720', 'apartment'];
    const allKnown = getAccessibleKnownCategories('property_manager_admin', 'condo_718');
    for (const communityType of communityTypes) {
      // Same full set as pm_admin, even with a restrictive JSONB value present.
      expect(
        getAccessibleKnownCategories('property_manager', communityType, {
          permissions: perms(['rules']),
        }),
      ).toEqual(allKnown);
      // And can access unknown/unmapped categories.
      expect(canAccessCategory('property_manager', communityType, 'unknown')).toBe(true);
    }
  });

  // Falsifier: a non-owner resident must NOT be elevated.
  it('does not treat a non-owner resident as elevated', () => {
    expect(isElevatedRole('resident', { isUnitOwner: false })).toBe(false);
    expect(canAccessCategory('resident', 'condo_718', 'unknown', { isUnitOwner: false })).toBe(
      false,
    );
  });

  const condoOrHoa: CommunityType[] = ['condo_718', 'hoa_720'];

  for (const communityType of condoOrHoa) {
    it(`permits condo/HOA tenant only declaration/rules/inspection (${communityType})`, () => {
      expect(canAccessCategory('tenant', communityType, 'declaration')).toBe(true);
      expect(canAccessCategory('tenant', communityType, 'rules')).toBe(true);
      expect(canAccessCategory('tenant', communityType, 'inspection_reports')).toBe(true);
      expect(canAccessCategory('tenant', communityType, 'meeting_minutes')).toBe(false);
      expect(canAccessCategory('tenant', communityType, 'announcements')).toBe(false);
      expect(canAccessCategory('tenant', communityType, 'unknown')).toBe(false);
    });
  }

  it('permits apartment tenant categories only', () => {
    expect(canAccessCategory('tenant', 'apartment', 'lease_docs')).toBe(true);
    expect(canAccessCategory('tenant', 'apartment', 'rules')).toBe(true);
    expect(canAccessCategory('tenant', 'apartment', 'community_handbook')).toBe(true);
    expect(canAccessCategory('tenant', 'apartment', 'move_in_out_docs')).toBe(true);
    expect(canAccessCategory('tenant', 'apartment', 'maintenance_records')).toBe(false);
    expect(canAccessCategory('tenant', 'apartment', 'declaration')).toBe(false);
    expect(canAccessCategory('tenant', 'apartment', 'unknown')).toBe(false);
  });

  it('permits elevated roles all known + unknown', () => {
    // The reachable elevated rows: unit owner + management tier.
    const elevated: CommunityRole[] = ['owner', 'property_manager_admin'];
    const communityTypes: CommunityType[] = ['condo_718', 'hoa_720', 'apartment'];

    for (const role of elevated) {
      for (const communityType of communityTypes) {
        expect(canAccessCategory(role, communityType, 'declaration')).toBe(true);
        expect(canAccessCategory(role, communityType, 'maintenance_records')).toBe(true);
        expect(canAccessCategory(role, communityType, 'unknown')).toBe(true);
      }
    }
  });

  it('computes accessible known categories from policy', () => {
    expect(getAccessibleKnownCategories('tenant', 'condo_718')).toEqual([
      'declaration',
      'rules',
      'inspection_reports',
    ]);
    expect(getAccessibleKnownCategories('tenant', 'apartment')).toEqual([
      'lease_docs',
      'rules',
      'community_handbook',
      'move_in_out_docs',
    ]);
    expect(getAccessibleKnownCategories('property_manager_admin', 'apartment')).toContain(
      'move_in_out_docs',
    );
  });

  it('evaluates document access using raw category names', () => {
    expect(canAccessDocument('tenant', 'condo_718', 'Rules & Regulations')).toBe(true);
    expect(canAccessDocument('tenant', 'condo_718', 'Meeting Minutes')).toBe(false);
    expect(canAccessDocument('owner', 'hoa_720', 'custom_unmapped')).toBe(true);
    expect(canAccessDocument('tenant', 'hoa_720', 'custom_unmapped')).toBe(false);
  });
});
