import { isAdminRole } from '@propertypro/shared';
import type { CommunityRole } from '@propertypro/shared';

/**
 * Idle-session timeout by role tier (milliseconds).
 *
 * - Management tier (property_manager / root_manager) → 30 min, via `isAdminRole`.
 * - resident (owner or tenant) / unknown → 60 min.
 *
 * NOTE: this previously compared the raw `role` against `ADMIN_ROLES` directly,
 * which never matched — `ADMIN_ROLES` holds the MatrixRole `manager`, not a
 * `CommunityRole` value — so management-tier users silently fell through to the
 * 60-min resident timeout. Routing through `isAdminRole` (which resolves the
 * management tier onto the `manager` admin row) restores the intended 30 min.
 */
export function getIdleTimeoutMs(role: CommunityRole | null): number {
  if (role && isAdminRole(role)) {
    return 30 * 60 * 1000; // 30 min for admin roles
  }
  return 60 * 60 * 1000; // 60 min for residents / unknown
}
