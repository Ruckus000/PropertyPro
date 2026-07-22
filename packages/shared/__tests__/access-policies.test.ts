import { describe, expect, it } from 'vitest';
import type { CommunityType, CommunityRole } from '../src';
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

// role-v3 (ADR-006): the document-access policy is keyed by the 3 MatrixRole
// rows, but the accepted INPUTS are the 3 v3 roles. `resident` splits into the
// owner/tenant rows via `isUnitOwner`; `property_manager`/`root_manager` are the
// uniformly-elevated management tier.
const OWNER = { isUnitOwner: true } as const;
const TENANT = { isUnitOwner: false } as const;

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
        expect(canAccessCategory('resident', communityType, key, OWNER)).toBe(true);
        expect(canAccessCategory('property_manager', communityType, key)).toBe(true);
        expect(canAccessCategory('root_manager', communityType, key)).toBe(true);
        // Tenants do not (same as the prior 'unknown' fallthrough).
        expect(canAccessCategory('resident', communityType, key, TENANT)).toBe(false);
      }
    }
  });

  it('grants condo/HOA insurance + elections to owners and the management tier, not tenants', () => {
    for (const communityType of ['condo_718', 'hoa_720'] as CommunityType[]) {
      for (const key of ['insurance', 'elections'] as const) {
        expect(canAccessCategory('resident', communityType, key, OWNER)).toBe(true);
        expect(canAccessCategory('property_manager', communityType, key)).toBe(true);
        expect(canAccessCategory('root_manager', communityType, key)).toBe(true);
        // ...but tenants cannot.
        expect(canAccessCategory('resident', communityType, key, TENANT)).toBe(false);
      }
    }
  });

  it('classifies elevated and restricted roles', () => {
    expect(isElevatedRole('resident', OWNER)).toBe(true);
    expect(isElevatedRole('property_manager')).toBe(true);
    expect(isRestrictedRole('resident', TENANT)).toBe(true);
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
    const allKnown = getAccessibleKnownCategories('property_manager', 'condo_718');
    for (const communityType of communityTypes) {
      // Same full set, even with a restrictive JSONB value present.
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
    expect(isElevatedRole('resident', TENANT)).toBe(false);
    expect(canAccessCategory('resident', 'condo_718', 'unknown', TENANT)).toBe(false);
  });

  const condoOrHoa: CommunityType[] = ['condo_718', 'hoa_720'];

  for (const communityType of condoOrHoa) {
    it(`permits condo/HOA tenant only declaration/rules/inspection (${communityType})`, () => {
      expect(canAccessCategory('resident', communityType, 'declaration', TENANT)).toBe(true);
      expect(canAccessCategory('resident', communityType, 'rules', TENANT)).toBe(true);
      expect(canAccessCategory('resident', communityType, 'inspection_reports', TENANT)).toBe(true);
      expect(canAccessCategory('resident', communityType, 'meeting_minutes', TENANT)).toBe(false);
      expect(canAccessCategory('resident', communityType, 'announcements', TENANT)).toBe(false);
      expect(canAccessCategory('resident', communityType, 'unknown', TENANT)).toBe(false);
    });
  }

  it('permits apartment tenant categories only', () => {
    expect(canAccessCategory('resident', 'apartment', 'lease_docs', TENANT)).toBe(true);
    expect(canAccessCategory('resident', 'apartment', 'rules', TENANT)).toBe(true);
    expect(canAccessCategory('resident', 'apartment', 'community_handbook', TENANT)).toBe(true);
    expect(canAccessCategory('resident', 'apartment', 'move_in_out_docs', TENANT)).toBe(true);
    expect(canAccessCategory('resident', 'apartment', 'maintenance_records', TENANT)).toBe(false);
    expect(canAccessCategory('resident', 'apartment', 'declaration', TENANT)).toBe(false);
    expect(canAccessCategory('resident', 'apartment', 'unknown', TENANT)).toBe(false);
  });

  it('permits elevated roles all known + unknown', () => {
    // The reachable elevated inputs: a unit owner + the management tier.
    const elevated: Array<{ role: CommunityRole; opts?: { isUnitOwner?: boolean } }> = [
      { role: 'resident', opts: OWNER },
      { role: 'property_manager' },
    ];
    const communityTypes: CommunityType[] = ['condo_718', 'hoa_720', 'apartment'];

    for (const { role, opts } of elevated) {
      for (const communityType of communityTypes) {
        expect(canAccessCategory(role, communityType, 'declaration', opts)).toBe(true);
        expect(canAccessCategory(role, communityType, 'maintenance_records', opts)).toBe(true);
        expect(canAccessCategory(role, communityType, 'unknown', opts)).toBe(true);
      }
    }
  });

  it('computes accessible known categories from policy', () => {
    expect(getAccessibleKnownCategories('resident', 'condo_718', TENANT)).toEqual([
      'declaration',
      'rules',
      'inspection_reports',
    ]);
    expect(getAccessibleKnownCategories('resident', 'apartment', TENANT)).toEqual([
      'lease_docs',
      'rules',
      'community_handbook',
      'move_in_out_docs',
    ]);
    expect(getAccessibleKnownCategories('property_manager', 'apartment')).toContain(
      'move_in_out_docs',
    );
  });

  it('evaluates document access using raw category names', () => {
    expect(canAccessDocument('resident', 'condo_718', 'Rules & Regulations', TENANT)).toBe(true);
    expect(canAccessDocument('resident', 'condo_718', 'Meeting Minutes', TENANT)).toBe(false);
    expect(canAccessDocument('resident', 'hoa_720', 'custom_unmapped', OWNER)).toBe(true);
    expect(canAccessDocument('resident', 'hoa_720', 'custom_unmapped', TENANT)).toBe(false);
  });
});
