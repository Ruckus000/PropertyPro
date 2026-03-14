/**
 * RBAC Snapshot Generator
 *
 * Run this ONCE before the role simplification migration to freeze the current
 * RBAC behavior as JSON fixtures. These fixtures are used by the parity tests
 * to verify that the new 4-role system produces identical permission results.
 *
 * Usage: npx tsx packages/shared/src/__tests__/generate-rbac-snapshots.ts
 */

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { COMMUNITY_ROLES, COMMUNITY_TYPES } from '../index';
import type { CommunityRole, CommunityType } from '../index';
import { RBAC_RESOURCES, RBAC_ACTIONS, checkPermission } from '../rbac-matrix';
import type { RbacResource, RbacAction } from '../rbac-matrix';
import {
  KNOWN_DOCUMENT_CATEGORY_KEYS,
  DOCUMENT_CATEGORY_KEYS,
  canAccessCategory,
} from '../access-policies';
import type { DocumentCategoryKey } from '../access-policies';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, 'fixtures');

// ---------------------------------------------------------------------------
// 1. RBAC Matrix Snapshot
// ---------------------------------------------------------------------------

type RbacSnapshot = Record<
  CommunityType,
  Record<CommunityRole, Record<RbacResource, Record<RbacAction, boolean>>>
>;

const rbacSnapshot: RbacSnapshot = {} as RbacSnapshot;

let cellCount = 0;

for (const communityType of COMMUNITY_TYPES) {
  rbacSnapshot[communityType] = {} as Record<CommunityRole, Record<RbacResource, Record<RbacAction, boolean>>>;
  for (const role of COMMUNITY_ROLES) {
    rbacSnapshot[communityType][role] = {} as Record<RbacResource, Record<RbacAction, boolean>>;
    for (const resource of RBAC_RESOURCES) {
      rbacSnapshot[communityType][role][resource] = {} as Record<RbacAction, boolean>;
      for (const action of RBAC_ACTIONS) {
        rbacSnapshot[communityType][role][resource][action] = checkPermission(
          role,
          communityType,
          resource,
          action,
        );
        cellCount++;
      }
    }
  }
}

writeFileSync(
  resolve(fixturesDir, 'rbac-snapshot.json'),
  JSON.stringify(rbacSnapshot, null, 2) + '\n',
);

console.log(`RBAC snapshot: ${cellCount} cells written (expected ${COMMUNITY_TYPES.length * COMMUNITY_ROLES.length * RBAC_RESOURCES.length * RBAC_ACTIONS.length})`);

// ---------------------------------------------------------------------------
// 2. Document Access Snapshot
// ---------------------------------------------------------------------------

type DocAccessSnapshot = Record<
  CommunityType,
  Record<CommunityRole, Record<DocumentCategoryKey, boolean>>
>;

const docAccessSnapshot: DocAccessSnapshot = {} as DocAccessSnapshot;

let docCellCount = 0;

for (const communityType of COMMUNITY_TYPES) {
  docAccessSnapshot[communityType] = {} as Record<CommunityRole, Record<DocumentCategoryKey, boolean>>;
  for (const role of COMMUNITY_ROLES) {
    docAccessSnapshot[communityType][role] = {} as Record<DocumentCategoryKey, boolean>;
    for (const categoryKey of DOCUMENT_CATEGORY_KEYS) {
      docAccessSnapshot[communityType][role][categoryKey] = canAccessCategory(
        role,
        communityType,
        categoryKey,
      );
      docCellCount++;
    }
  }
}

writeFileSync(
  resolve(fixturesDir, 'document-access-snapshot.json'),
  JSON.stringify(docAccessSnapshot, null, 2) + '\n',
);

console.log(`Document access snapshot: ${docCellCount} cells written (expected ${COMMUNITY_TYPES.length * COMMUNITY_ROLES.length * DOCUMENT_CATEGORY_KEYS.length})`);

console.log('\nSnapshots written to:', fixturesDir);
