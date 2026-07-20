/**
 * RBAC Parity Tests (role-v3 collapse, R3-01)
 *
 * The RBAC_MATRIX collapse dropped the 4 unreachable legacy role columns
 * (`board_member` / `board_president` / `cam` / `site_manager`), leaving the 3
 * rows the v3 choke point `checkPermissionV2` can ever read: `owner` /
 * `tenant` (the `resident` sub-roles, split by `isUnitOwner`) and
 * `property_manager_admin` (the uniform management-tier row for
 * `property_manager` / `root_manager`).
 *
 * These tests prove the collapse is behavior-preserving: for every reachable
 * `(communityType, role, resource, action)` the collapsed `RBAC_MATRIX` (and
 * `canAccessCategory`) still returns EXACTLY what the frozen pre-collapse
 * 7-role snapshot recorded. `checkPermissionV2` itself lives in `apps/web` and
 * cannot be imported here, but it is a thin lookup into these same 3 matrix
 * rows — so comparing the rows against the snapshot is the parity proof.
 *
 * The snapshots (`fixtures/*.json`) were frozen before the migration and are
 * intentionally NOT regenerated (that would be circular).
 *
 * Run: npx vitest run packages/shared/src/__tests__/rbac-parity.test.ts
 */

import { describe, expect, it } from 'vitest';

import { COMMUNITY_TYPES } from '../index';
import type { TransitionRole } from '../role-transition';
import { RBAC_RESOURCES, RBAC_ACTIONS, RBAC_MATRIX, MATRIX_ROLES } from '../rbac-matrix';
import { DOCUMENT_CATEGORY_KEYS, canAccessCategory, type DocumentAccessOpts } from '../access-policies';

import rbacSnapshot from './fixtures/rbac-snapshot.json' with { type: 'json' };
import docAccessSnapshot from './fixtures/document-access-snapshot.json' with { type: 'json' };

// MATRIX_ROLES ('owner' / 'tenant' / 'manager') is the OUTPUT vocabulary the
// document policy is keyed by — none of the three is an accepted *input* role.
// Map each row to the v3 input that resolves to it: the owner/tenant rows are the
// `resident` role split by `isUnitOwner`, and the manager row is `property_manager`.
// This drives canAccessCategory through the same resolution path prod uses.
const MATRIX_ROLE_INPUT: Record<
  (typeof MATRIX_ROLES)[number],
  { role: TransitionRole; opts?: DocumentAccessOpts }
> = {
  owner: { role: 'resident', opts: { isUnitOwner: true } },
  tenant: { role: 'resident', opts: { isUnitOwner: false } },
  manager: { role: 'property_manager' },
};

// Type-safe snapshot accessors
type SnapshotRbac = Record<string, Record<string, Record<string, Record<string, boolean>>>>;
type SnapshotDoc = Record<string, Record<string, Record<string, boolean>>>;
const rbac = rbacSnapshot as SnapshotRbac;
const docAccess = docAccessSnapshot as SnapshotDoc;

// ---------------------------------------------------------------------------
// RBAC parity — collapsed matrix vs frozen snapshot (reachable rows only)
// ---------------------------------------------------------------------------

describe('RBAC parity: collapsed matrix reproduces the frozen snapshot', () => {
  for (const communityType of COMMUNITY_TYPES) {
    for (const role of MATRIX_ROLES) {
      describe(`${communityType} / ${role}`, () => {
        for (const resource of RBAC_RESOURCES) {
          for (const action of RBAC_ACTIONS) {
            const expected = rbac[communityType]![role]![resource]![action]!;

            it(`${resource}.${action} should be ${expected}`, () => {
              expect(RBAC_MATRIX[communityType][role][resource][action]).toBe(expected);
            });
          }
        }
      });
    }
  }
});

// ---------------------------------------------------------------------------
// Document access parity — canAccessCategory vs frozen snapshot (reachable rows)
// ---------------------------------------------------------------------------

describe('Document access parity: reachable roles reproduce the frozen snapshot', () => {
  for (const communityType of COMMUNITY_TYPES) {
    for (const role of MATRIX_ROLES) {
      describe(`${communityType} / ${role}`, () => {
        for (const categoryKey of DOCUMENT_CATEGORY_KEYS) {
          const expected = docAccess[communityType]![role]![categoryKey]!;

          it(`canAccessCategory('${categoryKey}') should be ${expected}`, () => {
            const input = MATRIX_ROLE_INPUT[role];
            expect(
              canAccessCategory(input.role, communityType, categoryKey, input.opts),
            ).toBe(expected);
          });
        }
      });
    }
  }
});
