/**
 * Manager permissions — JSONB structure for the hybrid 4-role model.
 *
 * Each manager has a JSONB `permissions` column on user_roles that encodes
 * per-resource {read, write} access plus document category access and
 * meta-permissions (can_manage_roles, can_manage_settings, is_board_member).
 *
 * Key design points:
 * - Zod schema is dynamically built from RBAC_RESOURCES — adding a new resource
 *   auto-updates the schema.
 * - normalizeManagerPermissions() fills missing resource keys with
 *   {read: false, write: false} on every read — forward-compatible.
 * - validateDelegation() enforces top-down permission delegation:
 *   a manager can only grant permissions they themselves have.
 */

import { z } from 'zod';
import { RBAC_RESOURCES, type RbacResource } from './rbac-matrix';
import { KNOWN_DOCUMENT_CATEGORY_KEYS, type KnownDocumentCategoryKey } from './access-policies';

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export interface ResourcePermission {
  read: boolean;
  write: boolean;
}

export interface ManagerPermissions {
  resources: Record<RbacResource, ResourcePermission>;
  document_categories: 'all' | KnownDocumentCategoryKey[];
  can_manage_roles: boolean;
  can_manage_settings: boolean;
  is_board_member: boolean;
}

// ---------------------------------------------------------------------------
// Zod validation schema (dynamically built from RBAC_RESOURCES)
// ---------------------------------------------------------------------------

const resourcePermissionSchema = z.object({
  read: z.boolean(),
  write: z.boolean(),
});

const resourcesSchemaShape: Record<string, z.ZodType<ResourcePermission>> = {};
for (const resource of RBAC_RESOURCES) {
  resourcesSchemaShape[resource] = resourcePermissionSchema;
}
const resourcesSchema = z.object(resourcesSchemaShape) as unknown as z.ZodType<Record<RbacResource, ResourcePermission>>;

export const managerPermissionsSchema = z.object({
  resources: resourcesSchema,
  document_categories: z.union([
    z.literal('all'),
    z.array(z.enum(KNOWN_DOCUMENT_CATEGORY_KEYS as unknown as [string, ...string[]])),
  ]),
  can_manage_roles: z.boolean(),
  can_manage_settings: z.boolean(),
  is_board_member: z.boolean(),
});

// ---------------------------------------------------------------------------
// Normalization — forward-compatible JSONB reads
// ---------------------------------------------------------------------------

const DENY: ResourcePermission = { read: false, write: false };

/**
 * Normalize raw JSONB into a complete ManagerPermissions object.
 * Fills missing resource keys with {read: false, write: false} by default.
 * If `fallbackResources` is provided, uses those values for missing resources
 * instead of DENY — this allows preset-based managers to automatically inherit
 * RBAC matrix defaults when new resources are added.
 * Must be called on every read of manager permissions from the database.
 */
export function normalizeManagerPermissions(
  raw: unknown,
  fallbackResources?: Partial<Record<RbacResource, ResourcePermission>>,
): ManagerPermissions {
  const obj = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const rawResources = (typeof obj.resources === 'object' && obj.resources !== null
    ? obj.resources : {}) as Record<string, unknown>;

  const resources = {} as Record<RbacResource, ResourcePermission>;
  for (const r of RBAC_RESOURCES) {
    const entry = rawResources[r];
    if (typeof entry === 'object' && entry !== null) {
      const e = entry as Record<string, unknown>;
      resources[r] = {
        read: e.read === true,
        write: e.write === true,
      };
    } else {
      resources[r] = fallbackResources?.[r] ? { ...fallbackResources[r] } : { ...DENY };
    }
  }

  const rawCats = obj.document_categories;
  let document_categories: 'all' | KnownDocumentCategoryKey[];
  if (rawCats === 'all') {
    document_categories = 'all';
  } else if (Array.isArray(rawCats)) {
    const knownSet = new Set<string>(KNOWN_DOCUMENT_CATEGORY_KEYS);
    document_categories = rawCats.filter((c): c is KnownDocumentCategoryKey =>
      typeof c === 'string' && knownSet.has(c),
    );
  } else {
    document_categories = [];
  }

  return {
    resources,
    document_categories,
    can_manage_roles: obj.can_manage_roles === true,
    can_manage_settings: obj.can_manage_settings === true,
    is_board_member: obj.is_board_member === true,
  };
}

// ---------------------------------------------------------------------------
// Top-down delegation validation
// ---------------------------------------------------------------------------

export interface DelegationViolation {
  field: string;
  message: string;
}

/**
 * Validate that the granted permissions are a subset of the actor's permissions.
 * Returns an array of violations (empty = valid).
 *
 * Rules:
 * 1. For each resource, granted {read, write} must be a subset of actor's.
 * 2. document_categories: granted must be a subset of actor's.
 * 3. can_manage_roles: only pm_admin can grant this (handled by caller).
 * 4. can_manage_settings: granted must not exceed actor's.
 * 5. is_board_member: no delegation constraint (informational flag).
 */
export function validateDelegation(
  actorPermissions: ManagerPermissions,
  grantedPermissions: ManagerPermissions,
  actorIsPmAdmin: boolean,
): DelegationViolation[] {
  const violations: DelegationViolation[] = [];

  // Resource-level checks
  for (const resource of RBAC_RESOURCES) {
    const actor = actorPermissions.resources[resource];
    const granted = grantedPermissions.resources[resource];
    if (granted.read && !actor.read) {
      violations.push({
        field: `resources.${resource}.read`,
        message: `Cannot grant read access to '${resource}' — you do not have it`,
      });
    }
    if (granted.write && !actor.write) {
      violations.push({
        field: `resources.${resource}.write`,
        message: `Cannot grant write access to '${resource}' — you do not have it`,
      });
    }
  }

  // Document category checks
  if (grantedPermissions.document_categories !== 'all' || actorPermissions.document_categories !== 'all') {
    if (grantedPermissions.document_categories === 'all' && actorPermissions.document_categories !== 'all') {
      violations.push({
        field: 'document_categories',
        message: 'Cannot grant "all" document categories — you have a restricted set',
      });
    } else if (
      grantedPermissions.document_categories !== 'all' &&
      actorPermissions.document_categories !== 'all'
    ) {
      const actorCats = new Set(actorPermissions.document_categories);
      for (const cat of grantedPermissions.document_categories) {
        if (!actorCats.has(cat)) {
          violations.push({
            field: `document_categories.${cat}`,
            message: `Cannot grant document category '${cat}' — you do not have it`,
          });
        }
      }
    }
  }

  // can_manage_roles: only pm_admin can grant this
  if (grantedPermissions.can_manage_roles && !actorIsPmAdmin) {
    violations.push({
      field: 'can_manage_roles',
      message: 'Only pm_admin can grant can_manage_roles permission',
    });
  }

  // can_manage_settings
  if (grantedPermissions.can_manage_settings && !actorPermissions.can_manage_settings && !actorIsPmAdmin) {
    violations.push({
      field: 'can_manage_settings',
      message: 'Cannot grant can_manage_settings — you do not have it',
    });
  }

  return violations;
}
