/**
 * RBAC matrix unit tests (role-v3 collapse, R3-01).
 *
 * `checkPermissionV2` is the production choke point. It resolves the 3 reachable
 * RBAC_MATRIX rows: `resident` + isUnitOwner → `owner`, `resident` → `tenant`,
 * and `property_manager` / `root_manager` → `property_manager_admin`. These
 * tests verify that resolution exhaustively against RBAC_MATRIX, plus the policy
 * invariants that must never regress.
 *
 * No vi.mock needed — checkPermissionV2 is a pure function with no side effects.
 */
import { describe, expect, it } from 'vitest';
import {
  RBAC_MATRIX,
  RBAC_RESOURCES,
  RBAC_ACTIONS,
  COMMUNITY_TYPES,
  type MatrixRole,
  type RbacResource,
  type RbacAction,
  type CommunityType,
  type TransitionRole,
} from '@propertypro/shared';
import { checkPermissionV2 } from '@/lib/db/access-control';

// Each reachable v3 role-context and the matrix row checkPermissionV2 resolves.
const CONTEXTS: Array<{
  role: TransitionRole;
  isUnitOwner?: boolean;
  row: MatrixRole;
  label: string;
}> = [
  { role: 'resident', isUnitOwner: true, row: 'owner', label: 'resident(owner)' },
  { role: 'resident', isUnitOwner: false, row: 'tenant', label: 'resident(tenant)' },
  { role: 'property_manager', row: 'manager', label: 'property_manager' },
  { role: 'root_manager', row: 'manager', label: 'root_manager' },
];

// ---------------------------------------------------------------------------
// 1. Exhaustive: checkPermissionV2 resolves the correct matrix row
// ---------------------------------------------------------------------------

describe('checkPermissionV2 — exhaustive matrix-row resolution', () => {
  for (const communityType of COMMUNITY_TYPES) {
    for (const ctx of CONTEXTS) {
      for (const resource of RBAC_RESOURCES) {
        for (const action of RBAC_ACTIONS) {
          const expected = RBAC_MATRIX[communityType][ctx.row][resource][action];
          it(`${ctx.label} / ${communityType} / ${resource} / ${action} → ${String(expected)}`, () => {
            expect(
              checkPermissionV2(ctx.role, communityType, resource, action, {
                isUnitOwner: ctx.isUnitOwner,
              }),
            ).toBe(expected);
          });
        }
      }
    }
  }
});

// ---------------------------------------------------------------------------
// 2. Policy invariants
// ---------------------------------------------------------------------------

const owner = (t: CommunityType, r: RbacResource, a: RbacAction) =>
  checkPermissionV2('resident', t, r, a, { isUnitOwner: true });
const tenant = (t: CommunityType, r: RbacResource, a: RbacAction) =>
  checkPermissionV2('resident', t, r, a, { isUnitOwner: false });
const manager = (t: CommunityType, r: RbacResource, a: RbacAction) =>
  checkPermissionV2('property_manager', t, r, a);

describe('policy invariants', () => {
  it('audit write is always false (logAuditEvent is internal-only)', () => {
    for (const t of COMMUNITY_TYPES) {
      expect(owner(t, 'audit', 'write')).toBe(false);
      expect(tenant(t, 'audit', 'write')).toBe(false);
      expect(manager(t, 'audit', 'write')).toBe(false);
    }
  });

  it('owner can read documents but not write them (read/write are separate axes)', () => {
    expect(owner('condo_718', 'documents', 'read')).toBe(true);
    expect(owner('condo_718', 'documents', 'write')).toBe(false);
    expect(owner('hoa_720', 'documents', 'write')).toBe(false);
  });

  it('managers have full document write', () => {
    for (const t of COMMUNITY_TYPES) {
      expect(manager(t, 'documents', 'write')).toBe(true);
    }
  });

  it('only managers can write settings; owners read, tenants cannot', () => {
    expect(owner('condo_718', 'settings', 'read')).toBe(true);
    expect(owner('condo_718', 'settings', 'write')).toBe(false);
    expect(tenant('condo_718', 'settings', 'read')).toBe(false);
    expect(manager('condo_718', 'settings', 'write')).toBe(true);
  });

  it('residents (owner + tenant) can submit maintenance requests', () => {
    expect(owner('condo_718', 'maintenance', 'write')).toBe(true);
    expect(tenant('condo_718', 'maintenance', 'write')).toBe(true);
    expect(tenant('apartment', 'maintenance', 'write')).toBe(true);
  });

  it('apartments have no compliance for any role', () => {
    expect(manager('apartment', 'compliance', 'read')).toBe(false);
    expect(manager('apartment', 'compliance', 'write')).toBe(false);
    expect(owner('apartment', 'compliance', 'read')).toBe(false);
  });

  it('property_manager and root_manager resolve identically (uniform management tier)', () => {
    for (const t of COMMUNITY_TYPES) {
      for (const resource of RBAC_RESOURCES) {
        for (const action of RBAC_ACTIONS) {
          expect(checkPermissionV2('root_manager', t, resource, action)).toBe(
            checkPermissionV2('property_manager', t, resource, action),
          );
        }
      }
    }
  });

  it('hoa_720 and condo_718 share identical policy for every reachable role', () => {
    for (const ctx of CONTEXTS) {
      for (const resource of RBAC_RESOURCES) {
        for (const action of RBAC_ACTIONS) {
          expect(
            checkPermissionV2(ctx.role, 'hoa_720', resource, action, { isUnitOwner: ctx.isUnitOwner }),
          ).toBe(
            checkPermissionV2(ctx.role, 'condo_718', resource, action, { isUnitOwner: ctx.isUnitOwner }),
          );
        }
      }
    }
  });
});
