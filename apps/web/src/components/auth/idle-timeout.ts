import { isAdminRole } from '@propertypro/shared';
import type { AnyCommunityRole } from '@propertypro/shared';

/**
 * Idle-session timeout by role tier (milliseconds).
 *
 * - Management tier (property_manager / root_manager, plus the legacy
 *   property_manager_admin) → 30 min, resolved via `isAdminRole`.
 * - owner / tenant / resident / unknown → 60 min.
 *
 * NOTE: this previously compared the raw v3 `role` against `ADMIN_ROLES`
 * directly, which never matched — `ADMIN_ROLES` holds the MatrixRole `manager`,
 * not a `CommunityRole`/`TransitionRole` value — so management-tier users
 * silently fell through to the 60-min resident timeout. Routing through
 * `isAdminRole` (which resolves the management tier onto the `manager` admin
 * row) restores the intended 30-min timeout.
 */
export function getIdleTimeoutMs(role: AnyCommunityRole | null): number {
  if (role && isAdminRole(role)) {
    return 30 * 60 * 1000; // 30 min for admin roles
  }
  return 60 * 60 * 1000; // 60 min for residents / unknown
}
