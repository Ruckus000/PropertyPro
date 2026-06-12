import { describe, expect, it, vi } from 'vitest';

// Mock DB modules that are pulled in transitively by violations/common.ts → plan-guard.ts
vi.mock('@propertypro/db', () => ({
  communities: {},
  createScopedClient: vi.fn(),
}));
vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: vi.fn(),
}));
vi.mock('@propertypro/db/filters', () => ({
  eq: vi.fn(),
}));
vi.mock('@/lib/telemetry/plan-resolution', () => ({
  resolvePlanIdWithTelemetry: vi.fn(),
}));

import { requireElectionsAdminRole } from '../../src/lib/elections/common';
import { requireViolationAdminWrite } from '../../src/lib/violations/common';
import { ForbiddenError } from '../../src/lib/api/errors';
import type { CommunityMembership } from '../../src/lib/api/community-membership';

function membership(overrides: Partial<CommunityMembership>): CommunityMembership {
  return {
    userId: 'u', communityId: 1, communityName: '', role: 'resident',
    communityType: 'condo_718', subscriptionPlan: null, subscriptionStatus: null,
    freeAccessExpiresAt: null, timezone: 'America/New_York', isUnitOwner: false,
    isAdmin: false, displayTitle: '', designation: null, city: null, state: null,
    isDemo: false, trialEndsAt: null, demoExpiresAt: null, electionsAttorneyReviewed: false,
    ...overrides,
  };
}

describe('statutory admin gates delegate to requireBoardDesignation', () => {
  for (const [name, fn] of [
    ['requireElectionsAdminRole', requireElectionsAdminRole],
    ['requireViolationAdminWrite', requireViolationAdminWrite],
  ] as const) {
    it(`${name} passes management-tier`, () => {
      expect(() => fn(membership({ role: 'property_manager', isAdmin: true }))).not.toThrow();
    });
    it(`${name} passes a resident + designation`, () => {
      expect(() => fn(membership({ designation: 'board_president' }))).not.toThrow();
    });
    it(`${name} rejects a plain resident`, () => {
      expect(() => fn(membership({}))).toThrow(ForbiddenError);
    });
  }
});
