import { RBAC_RESOURCES, RBAC_ACTIONS } from '@propertypro/shared';
import type { AnyRouteContract } from '@propertypro/api-contract';

/**
 * Permission `(resource:action)` pairs intentionally OUTSIDE the RBAC matrix.
 * These routes authorize via other mechanisms (PM cross-community, apartment
 * feature-gate, public help, billing). Verified exhaustive 2026-06-05.
 * Ratchet: a NEW pair here means a contract declared a non-matrix permission —
 * confirm it's deliberate before adding it.
 */
export const KNOWN_NON_MATRIX_PERMISSIONS: ReadonlySet<string> = new Set([
  'communities:read',
  'communities:write',
  'help:read',
  'billing_groups:read',
  'leases:read',
  'leases:write',
  'move_checklists:read',
  'move_checklists:write',
  'move_checklists:update',
]);

export type RbacCheckResult =
  | { status: 'ok' | 'inapplicable' | 'allowlisted' }
  | { status: 'fail'; message: string };

export function checkRbac(contract: AnyRouteContract): RbacCheckResult {
  const permission = contract.permission;
  if (!permission) return { status: 'inapplicable' };

  const { resource, action } = permission;
  const inMatrix =
    (RBAC_RESOURCES as readonly string[]).includes(resource) &&
    (RBAC_ACTIONS as readonly string[]).includes(action);
  if (inMatrix) return { status: 'ok' };

  if (KNOWN_NON_MATRIX_PERMISSIONS.has(`${resource}:${action}`)) {
    return { status: 'allowlisted' };
  }

  return {
    status: 'fail',
    message: `permission { resource: '${resource}', action: '${action}' } is not a valid matrix pair (RBAC_RESOURCES × RBAC_ACTIONS) and is not in KNOWN_NON_MATRIX_PERMISSIONS`,
  };
}
