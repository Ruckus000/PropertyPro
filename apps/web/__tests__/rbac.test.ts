/**
 * RBAC Matrix Audit — P4-57
 *
 * Test suite generated from the declarative RBAC matrix.
 * Sections 1–6 are pure-logic tests (no DB, no mocks).
 * Section 7 calls route handlers with mocked dependencies.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Hoisted mocks (must be before all vi.mock calls)
// ---------------------------------------------------------------------------
const {
  createScopedClientMock,
  logAuditEventMock,
  requireAuthMock,
  requireMembershipMock,
  resolveEffectiveIdMock,
  requireSubscriptionMock,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  logAuditEventMock: vi.fn().mockResolvedValue(undefined),
  requireAuthMock: vi.fn(),
  requireMembershipMock: vi.fn(),
  resolveEffectiveIdMock: vi.fn((_: unknown, id: number) => id),
  requireSubscriptionMock: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Module mocks (hoisted to top by vitest)
// ---------------------------------------------------------------------------
vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  logAuditEvent: logAuditEventMock,
  complianceAuditLog: { id: Symbol('cal.id') },
  userRoles: { id: Symbol('ur.id'), role: Symbol('ur.role'), userId: Symbol('ur.userId') },
  contracts: { id: Symbol('c.id') },
  contractBids: { id: Symbol('cb.id') },
  documents: { id: Symbol('d.id'), categoryId: Symbol('d.categoryId') },
  complianceChecklistItems: { id: Symbol('cci.id') },
  meetings: { id: Symbol('m.id') },
  meetingDocuments: { id: Symbol('md.id') },
  communities: { id: Symbol('com.id'), timezone: Symbol('com.tz') },
  maintenanceRequests: { id: Symbol('mr.id'), submittedById: Symbol('mr.sbi') },
  maintenanceComments: { id: Symbol('mc.id'), requestId: Symbol('mc.rid') },
  units: { id: Symbol('u.id') },
  leases: { id: Symbol('l.id') },
  announcements: { id: Symbol('a.id') },
  users: { id: Symbol('users.id') },
  notificationPreferences: { id: Symbol('np.id') },
  createPresignedDownloadUrl: vi.fn().mockResolvedValue('https://example.com/file'),
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: vi.fn().mockReturnValue('eq-filter'),
  and: vi.fn().mockReturnValue('and-filter'),
  inArray: vi.fn().mockReturnValue('inArray-filter'),
  desc: vi.fn().mockReturnValue('desc-order'),
  gte: vi.fn().mockReturnValue('gte-filter'),
  lte: vi.fn().mockReturnValue('lte-filter'),
  sql: vi.fn().mockReturnValue('sql'),
  isNotNull: vi.fn().mockReturnValue('isNotNull-filter'),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireMembershipMock,
}));

vi.mock('@/lib/api/tenant-context', () => ({
  resolveEffectiveCommunityId: resolveEffectiveIdMock,
}));

vi.mock('@/lib/middleware/subscription-guard', () => ({
  requireActiveSubscriptionForMutation: requireSubscriptionMock,
}));

vi.mock('@/lib/middleware/audit-middleware', () => ({
  withAuditLog: (_extract: unknown, handler: Function) => handler,
}));

vi.mock('@/lib/services/notification-service', () => ({
  queueNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/services/announcement-delivery', () => ({
  queueAnnouncementDelivery: vi.fn().mockResolvedValue(0),
}));

vi.mock('@/lib/services/contract-renewal-alerts', () => ({
  getContractExpirationAlerts: vi.fn().mockReturnValue([]),
}));

vi.mock('@/lib/services/photo-processor', () => ({
  getMaintenancePhotoUploadUrl: vi.fn().mockResolvedValue({ uploadUrl: 'u', storagePath: 's' }),
  processAndStoreThumbnail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/utils/timezone', () => ({
  resolveTimezone: vi.fn().mockReturnValue('America/New_York'),
}));

vi.mock('@/lib/services/csv-export', () => ({
  generateCSV: vi.fn().mockReturnValue('csv-data'),
}));

vi.mock('@/lib/services/lease-expiration-service', () => ({
  getExpiringLeases: vi.fn().mockReturnValue([]),
  getRenewalChain: vi.fn().mockReturnValue([]),
}));

vi.mock('@/lib/api/zod/error-formatter', () => ({
  formatZodErrors: vi.fn().mockReturnValue({}),
}));

vi.mock('@/lib/utils/meeting-calculator', () => ({
  calculateMinutesPostingDeadline: vi.fn().mockReturnValue(new Date()),
  calculateNoticePostBy: vi.fn().mockReturnValue(new Date()),
  calculateOwnerVoteDocsDeadline: vi.fn().mockReturnValue(new Date()),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------
import {
  COMMUNITY_TYPES,
  COMMUNITY_ROLES,
  ROLE_COMMUNITY_CONSTRAINTS,
  RBAC_MATRIX,
  RBAC_RESOURCES,
  ADMIN_ROLES,
  ELEVATED_DOCUMENT_ROLES,
  RESIDENT_ROLES,
  canAccessResource,
  getAccessLevel,
  isRoleValidForCommunity,
  type CommunityRole,
  type CommunityType,
  type AccessLevel,
} from '@propertypro/shared';

import {
  isRoleAllowedForCommunityType,
  validateRoleAssignment,
} from '@/lib/utils/role-validator';

import { GET as auditTrailGET } from '@/app/api/v1/audit-trail/route';
import { GET as contractsGET } from '@/app/api/v1/contracts/route';
import { GET as meetingsGET } from '@/app/api/v1/meetings/route';
import { GET as leasesGET } from '@/app/api/v1/leases/route';
import { GET as complianceGET } from '@/app/api/v1/compliance/route';

// ═══════════════════════════════════════════════════════════════════════
// Section 1: Matrix completeness
// ═══════════════════════════════════════════════════════════════════════

describe('RBAC Matrix Completeness', () => {
  it('covers all 3 community types', () => {
    for (const ct of COMMUNITY_TYPES) {
      expect(RBAC_MATRIX[ct]).toBeDefined();
    }
  });

  it('covers all 7 roles per community type', () => {
    for (const ct of COMMUNITY_TYPES) {
      for (const role of COMMUNITY_ROLES) {
        expect(RBAC_MATRIX[ct][role]).toBeDefined();
      }
    }
  });

  it('covers all 10 resources per role per community type', () => {
    for (const ct of COMMUNITY_TYPES) {
      for (const role of COMMUNITY_ROLES) {
        for (const resource of RBAC_RESOURCES) {
          const level = RBAC_MATRIX[ct][role][resource];
          expect(['none', 'read', 'write', 'own']).toContain(level);
        }
      }
    }
  });

  it('matrix has exactly 210 cells (7 roles × 3 types × 10 resources)', () => {
    let count = 0;
    for (const ct of COMMUNITY_TYPES) {
      for (const role of COMMUNITY_ROLES) {
        for (const resource of RBAC_RESOURCES) {
          if (RBAC_MATRIX[ct][role][resource] !== undefined) count++;
        }
      }
    }
    expect(count).toBe(210);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Section 2: Invalid role/community combos → all resources 'none'
// ═══════════════════════════════════════════════════════════════════════

describe('Invalid Role/Community Combos', () => {
  const invalidCombos: Array<{ role: CommunityRole; communityType: CommunityType }> = [];

  for (const communityType of COMMUNITY_TYPES) {
    for (const role of COMMUNITY_ROLES) {
      if (!ROLE_COMMUNITY_CONSTRAINTS[communityType].includes(role)) {
        invalidCombos.push({ role, communityType });
      }
    }
  }

  it.each(invalidCombos)(
    '$role in $communityType → all resources none',
    ({ role, communityType }) => {
      for (const resource of RBAC_RESOURCES) {
        expect(getAccessLevel(role, communityType, resource)).toBe('none');
      }
    },
  );

  it('identifies expected invalid combos', () => {
    expect(isRoleValidForCommunity('site_manager', 'condo_718')).toBe(false);
    expect(isRoleValidForCommunity('site_manager', 'hoa_720')).toBe(false);
    expect(isRoleValidForCommunity('cam', 'apartment')).toBe(false);
    expect(isRoleValidForCommunity('owner', 'apartment')).toBe(false);
    expect(isRoleValidForCommunity('board_member', 'apartment')).toBe(false);
    expect(isRoleValidForCommunity('board_president', 'apartment')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Section 3: Feature-gated resources
// ═══════════════════════════════════════════════════════════════════════

describe('Feature-Gated Resources', () => {
  describe('meetings → none for apartment', () => {
    for (const role of COMMUNITY_ROLES) {
      it(`${role} in apartment → meetings none`, () => {
        expect(getAccessLevel(role, 'apartment', 'meetings')).toBe('none');
      });
    }
  });

  describe('compliance → none for apartment', () => {
    for (const role of COMMUNITY_ROLES) {
      it(`${role} in apartment → compliance none`, () => {
        expect(getAccessLevel(role, 'apartment', 'compliance')).toBe('none');
      });
    }
  });

  describe('contracts → none for apartment', () => {
    for (const role of COMMUNITY_ROLES) {
      it(`${role} in apartment → contracts none`, () => {
        expect(getAccessLevel(role, 'apartment', 'contracts')).toBe('none');
      });
    }
  });

  describe('leases → none for condo/hoa', () => {
    for (const ct of ['condo_718', 'hoa_720'] as const) {
      for (const role of COMMUNITY_ROLES) {
        it(`${role} in ${ct} → leases none`, () => {
          expect(getAccessLevel(role, ct, 'leases')).toBe('none');
        });
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Section 4: Board-over-owner precedence
// ═══════════════════════════════════════════════════════════════════════

describe('Board-over-Owner Precedence', () => {
  const accessOrder: Record<AccessLevel, number> = {
    none: 0,
    read: 1,
    own: 2,
    write: 3,
  };

  for (const ct of ['condo_718', 'hoa_720'] as const) {
    describe(`${ct}`, () => {
      for (const resource of RBAC_RESOURCES) {
        it(`board_member ${resource} >= owner ${resource}`, () => {
          const boardLevel = getAccessLevel('board_member', ct, resource);
          const ownerLevel = getAccessLevel('owner', ct, resource);
          expect(accessOrder[boardLevel]).toBeGreaterThanOrEqual(accessOrder[ownerLevel]);
        });

        it(`board_president ${resource} >= owner ${resource}`, () => {
          const presLevel = getAccessLevel('board_president', ct, resource);
          const ownerLevel = getAccessLevel('owner', ct, resource);
          expect(accessOrder[presLevel]).toBeGreaterThanOrEqual(accessOrder[ownerLevel]);
        });
      }
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// Section 5: canAccessResource() alignment (generated from matrix)
// ═══════════════════════════════════════════════════════════════════════

describe('canAccessResource() Alignment', () => {
  for (const ct of COMMUNITY_TYPES) {
    for (const role of COMMUNITY_ROLES) {
      for (const resource of RBAC_RESOURCES) {
        const level = RBAC_MATRIX[ct][role][resource];

        it(`${role}/${ct}/${resource} (${level})`, () => {
          const canRead = canAccessResource(role, ct, resource, 'read');
          const canWrite = canAccessResource(role, ct, resource, 'write');

          if (level === 'none') {
            expect(canRead).toBe(false);
            expect(canWrite).toBe(false);
          } else if (level === 'read') {
            expect(canRead).toBe(true);
            expect(canWrite).toBe(false);
          } else if (level === 'write') {
            expect(canRead).toBe(true);
            expect(canWrite).toBe(true);
          } else if (level === 'own') {
            expect(canRead).toBe(true);
            expect(canWrite).toBe(true);
          }
        });
      }
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════
// Section 6: Role constraint alignment
// ═══════════════════════════════════════════════════════════════════════

describe('Role Constraint Alignment', () => {
  for (const ct of COMMUNITY_TYPES) {
    for (const role of COMMUNITY_ROLES) {
      const valid = ROLE_COMMUNITY_CONSTRAINTS[ct].includes(role);
      it(`isRoleValidForCommunity(${role}, ${ct}) = ${valid}`, () => {
        expect(isRoleValidForCommunity(role, ct)).toBe(valid);
      });

      it(`isRoleAllowedForCommunityType(${role}, ${ct}) = ${valid}`, () => {
        expect(isRoleAllowedForCommunityType(role, ct)).toBe(valid);
      });
    }
  }

  describe('validateRoleAssignment rejects invalid combos', () => {
    it('site_manager in condo_718', () => {
      expect(validateRoleAssignment('site_manager', 'condo_718').valid).toBe(false);
    });
    it('cam in apartment', () => {
      expect(validateRoleAssignment('cam', 'apartment').valid).toBe(false);
    });
    it('owner in apartment', () => {
      expect(validateRoleAssignment('owner', 'apartment', 1).valid).toBe(false);
    });
  });

  describe('validateRoleAssignment accepts valid combos', () => {
    it('owner in condo_718 with unitId', () => {
      expect(validateRoleAssignment('owner', 'condo_718', 1).valid).toBe(true);
    });
    it('site_manager in apartment', () => {
      expect(validateRoleAssignment('site_manager', 'apartment').valid).toBe(true);
    });
  });

  describe('unit requirement', () => {
    it('owner requires unitId', () => {
      expect(validateRoleAssignment('owner', 'condo_718').valid).toBe(false);
    });
    it('tenant requires unitId', () => {
      expect(validateRoleAssignment('tenant', 'condo_718').valid).toBe(false);
    });
    it('board_member does not require unitId', () => {
      expect(validateRoleAssignment('board_member', 'condo_718').valid).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Section 7: Route-level RBAC enforcement
// ═══════════════════════════════════════════════════════════════════════

describe('Route-level RBAC Enforcement', () => {
  function makeDefaultScopedClient(rows: unknown[] = []) {
    const chainable: Record<string, unknown> = {};
    chainable.orderBy = vi.fn().mockReturnValue(chainable);
    chainable.limit = vi.fn().mockReturnValue(chainable);
    chainable.offset = vi.fn().mockReturnValue(Promise.resolve(rows));
    chainable.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve);

    return {
      query: vi.fn().mockResolvedValue(rows),
      selectFrom: vi.fn().mockReturnValue(chainable),
      insert: vi.fn().mockResolvedValue([{ id: 1 }]),
      update: vi.fn().mockResolvedValue([{ id: 1 }]),
      softDelete: vi.fn().mockResolvedValue(undefined),
      hardDelete: vi.fn().mockResolvedValue(undefined),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue('user-1');
    createScopedClientMock.mockReturnValue(makeDefaultScopedClient());
  });

  function setMembership(role: CommunityRole, communityType: CommunityType) {
    requireMembershipMock.mockResolvedValue({
      userId: 'user-1',
      communityId: 42,
      role,
      communityType,
      timezone: 'America/New_York',
    });
  }

  // ── Audit Trail: admin-only ──────────────────────────────────────

  describe('audit-trail admin gate', () => {
    const adminRoles: CommunityRole[] = [
      'board_member', 'board_president', 'cam', 'site_manager', 'property_manager_admin',
    ];
    for (const role of adminRoles) {
      it(`${role} can access audit trail → 200`, async () => {
        setMembership(role, 'condo_718');
        const resp = await auditTrailGET(new NextRequest('http://localhost/api/v1/audit-trail?communityId=42'));
        expect(resp.status).toBe(200);
      });
    }

    const deniedRoles: CommunityRole[] = ['owner', 'tenant'];
    for (const role of deniedRoles) {
      it(`${role} denied audit trail → 403`, async () => {
        setMembership(role, 'condo_718');
        const resp = await auditTrailGET(new NextRequest('http://localhost/api/v1/audit-trail?communityId=42'));
        expect(resp.status).toBe(403);
      });
    }
  });

  // ── Contracts: admin-only + compliance gate ──────────────────────

  describe('contracts admin + feature gate', () => {
    it('board_president in condo_718 → 200', async () => {
      setMembership('board_president', 'condo_718');
      const resp = await contractsGET(new NextRequest('http://localhost/api/v1/contracts?communityId=42'));
      expect(resp.status).toBe(200);
    });

    it('tenant in condo_718 → 403 (admin-only)', async () => {
      setMembership('tenant', 'condo_718');
      const resp = await contractsGET(new NextRequest('http://localhost/api/v1/contracts?communityId=42'));
      expect(resp.status).toBe(403);
    });

    it('site_manager in apartment → 403 (compliance feature gate)', async () => {
      setMembership('site_manager', 'apartment');
      const resp = await contractsGET(new NextRequest('http://localhost/api/v1/contracts?communityId=42'));
      expect(resp.status).toBe(403);
    });
  });

  // ── Meetings: apartment blocked ─────────────────────────────────

  describe('meetings apartment gate', () => {
    it('board_president in condo_718 → 200', async () => {
      setMembership('board_president', 'condo_718');
      const resp = await meetingsGET(new NextRequest('http://localhost/api/v1/meetings?communityId=42'));
      expect(resp.status).toBe(200);
    });

    it('tenant in condo_718 → 200 (all condo members can read)', async () => {
      setMembership('tenant', 'condo_718');
      const resp = await meetingsGET(new NextRequest('http://localhost/api/v1/meetings?communityId=42'));
      expect(resp.status).toBe(200);
    });

    it('site_manager in apartment → 403', async () => {
      setMembership('site_manager', 'apartment');
      const resp = await meetingsGET(new NextRequest('http://localhost/api/v1/meetings?communityId=42'));
      expect(resp.status).toBe(403);
    });
  });

  // ── Leases: apartment-only ──────────────────────────────────────

  describe('leases apartment-only gate', () => {
    it('tenant in apartment → 200', async () => {
      setMembership('tenant', 'apartment');
      const resp = await leasesGET(new NextRequest('http://localhost/api/v1/leases?communityId=42'));
      expect(resp.status).toBe(200);
    });

    it('board_president in condo_718 → 403', async () => {
      setMembership('board_president', 'condo_718');
      const resp = await leasesGET(new NextRequest('http://localhost/api/v1/leases?communityId=42'));
      expect(resp.status).toBe(403);
    });
  });

  // ── Compliance: condo/hoa only ──────────────────────────────────

  describe('compliance feature gate', () => {
    it('board_president in condo_718 → 200', async () => {
      setMembership('board_president', 'condo_718');
      const resp = await complianceGET(new NextRequest('http://localhost/api/v1/compliance?communityId=42'));
      expect(resp.status).toBe(200);
    });

    it('tenant in apartment → 403', async () => {
      setMembership('tenant', 'apartment');
      const resp = await complianceGET(new NextRequest('http://localhost/api/v1/compliance?communityId=42'));
      expect(resp.status).toBe(403);
    });
  });

  // ── Role set consistency ────────────────────────────────────────

  describe('ADMIN_ROLES set matches route expectations', () => {
    const expected: CommunityRole[] = [
      'board_member', 'board_president', 'cam', 'site_manager', 'property_manager_admin',
    ];
    for (const role of expected) {
      it(`${role} is admin`, () => {
        expect(ADMIN_ROLES.has(role)).toBe(true);
      });
    }
    for (const role of ['owner', 'tenant'] as CommunityRole[]) {
      it(`${role} is not admin`, () => {
        expect(ADMIN_ROLES.has(role)).toBe(false);
      });
    }
  });

  describe('ELEVATED_DOCUMENT_ROLES set', () => {
    for (const role of ['owner', 'board_member', 'board_president', 'property_manager_admin'] as CommunityRole[]) {
      it(`${role} is elevated`, () => {
        expect(ELEVATED_DOCUMENT_ROLES.has(role)).toBe(true);
      });
    }
    for (const role of ['tenant', 'cam', 'site_manager'] as CommunityRole[]) {
      it(`${role} is not elevated`, () => {
        expect(ELEVATED_DOCUMENT_ROLES.has(role)).toBe(false);
      });
    }
  });

  describe('RESIDENT_ROLES set', () => {
    it('owner is resident', () => expect(RESIDENT_ROLES.has('owner')).toBe(true));
    it('tenant is resident', () => expect(RESIDENT_ROLES.has('tenant')).toBe(true));
    it('board_member is not resident', () => expect(RESIDENT_ROLES.has('board_member')).toBe(false));
  });
});
