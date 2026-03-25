import { describe, expect, it } from 'vitest';
import type { CommunityRole, CommunityType } from '../src';
import {
  canAccessCategory,
  canAccessDocument,
  getAccessibleKnownCategories,
  isElevatedRole,
  isRestrictedRole,
  normalizeCategoryName,
} from '../src/access-policies';

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
    expect(normalizeCategoryName('custom category')).toBe('unknown');
    expect(normalizeCategoryName(null)).toBe('unknown');
  });

  it('classifies elevated and restricted roles', () => {
    expect(isElevatedRole('owner')).toBe(true);
    expect(isElevatedRole('property_manager_admin')).toBe(true);
    expect(isRestrictedRole('tenant')).toBe(true);
    expect(isRestrictedRole('cam')).toBe(true);
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

    it(`permits CAM operational categories only (${communityType})`, () => {
      expect(canAccessCategory('cam', communityType, 'rules')).toBe(true);
      expect(canAccessCategory('cam', communityType, 'inspection_reports')).toBe(true);
      expect(canAccessCategory('cam', communityType, 'announcements')).toBe(true);
      expect(canAccessCategory('cam', communityType, 'meeting_minutes')).toBe(true);
      expect(canAccessCategory('cam', communityType, 'declaration')).toBe(false);
      expect(canAccessCategory('cam', communityType, 'unknown')).toBe(false);
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

  it('permits apartment site manager operational categories only', () => {
    expect(canAccessCategory('site_manager', 'apartment', 'rules')).toBe(true);
    expect(canAccessCategory('site_manager', 'apartment', 'announcements')).toBe(true);
    expect(canAccessCategory('site_manager', 'apartment', 'maintenance_records')).toBe(true);
    expect(canAccessCategory('site_manager', 'apartment', 'lease_docs')).toBe(false);
    expect(canAccessCategory('site_manager', 'apartment', 'unknown')).toBe(false);
  });

  it('permits elevated roles all known + unknown', () => {
    const elevated: CommunityRole[] = [
      'owner',
      'board_member',
      'board_president',
      'property_manager_admin',
    ];
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
    expect(getAccessibleKnownCategories('site_manager', 'apartment')).toEqual([
      'rules',
      'announcements',
      'maintenance_records',
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
