/**
 * Shared types and constants for PropertyPro Florida
 *
 * Role model follows ADR-001 canonical role decisions:
 * - COMMUNITY_ROLES: 7 domain roles stored in community-scoped user_roles table
 * - platform_admin is system-scoped (not in user_roles)
 * - auditor deferred to v2 pending approved use case + policy matrix
 * - One active canonical role per (user_id, community_id)
 * - Board-over-owner precedence when both apply
 */

export const COMMUNITY_TYPES = ["condo_718", "hoa_720", "apartment"] as const;
export type CommunityType = (typeof COMMUNITY_TYPES)[number];

/** Human-readable display names for each community type. */
export const COMMUNITY_TYPE_DISPLAY_NAMES: Record<CommunityType, string> = {
  condo_718: 'Condo §718',
  hoa_720: 'HOA §720',
  apartment: 'Apartment',
};

/**
 * Canonical community-scoped roles per ADR-001.
 * Note: platform_admin is system-scoped (not in user_roles); auditor deferred to v2.
 */
export const COMMUNITY_ROLES = [
  "owner",
  "tenant",
  "board_member",
  "board_president",
  "cam",
  "site_manager",
  "property_manager_admin",
] as const;
export type CommunityRole = (typeof COMMUNITY_ROLES)[number];

/** @deprecated Use COMMUNITY_ROLES instead. Kept for migration compatibility. */
export const USER_ROLES = COMMUNITY_ROLES;
/** @deprecated Use CommunityRole instead. Kept for migration compatibility. */
export type UserRole = CommunityRole;

/**
 * Community-type role constraints per ADR-001.
 */
export const ROLE_COMMUNITY_CONSTRAINTS: Record<CommunityType, readonly CommunityRole[]> = {
  condo_718: ["owner", "tenant", "board_member", "board_president", "cam", "property_manager_admin"],
  hoa_720: ["owner", "tenant", "board_member", "board_president", "cam", "property_manager_admin"],
  apartment: ["tenant", "site_manager", "property_manager_admin"],
} as const;

/**
 * Derived permission profiles mapped from canonical roles per ADR-001.
 * These are derived mappings, not canonical roles.
 */
export const PERMISSION_PROFILE_MAP = {
  portfolio_admin: ["property_manager_admin"],
  community_admin: ["board_president", "cam", "site_manager"],
  community_editor: ["board_member"],
  resident_owner: ["owner"],
  resident_tenant: ["tenant"],
} as const;

/**
 * Convert a full name to initials (e.g., "John Doe" → "JD").
 * Returns "?" if name is null/empty.
 */
export function toInitials(name: string | null): string {
  if (!name || !name.trim()) return '?';
  return name
    .trim()
    .split(/\s+/)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export * from './branding';
export * from './compliance/templates';
export * from './access-policies';
export * from './rbac-matrix';
export * from './features';
export * from './middleware/reserved-subdomains';
export * from './middleware/subdomain-router';
export * from './validators';
