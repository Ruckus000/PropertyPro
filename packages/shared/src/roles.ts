/**
 * Core role and community-type constants.
 *
 * Extracted to break circular dependency between index.ts and rbac-matrix.ts.
 * Both modules import from this file; index.ts re-exports everything.
 */

export const COMMUNITY_TYPES = ["condo_718", "hoa_720", "apartment"] as const;
export type CommunityType = (typeof COMMUNITY_TYPES)[number];

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

export const ROLE_COMMUNITY_CONSTRAINTS: Record<CommunityType, readonly CommunityRole[]> = {
  condo_718: ["owner", "tenant", "board_member", "board_president", "cam", "property_manager_admin"],
  hoa_720: ["owner", "tenant", "board_member", "board_president", "cam", "property_manager_admin"],
  apartment: ["tenant", "site_manager", "property_manager_admin"],
} as const;

export const PERMISSION_PROFILE_MAP = {
  portfolio_admin: ["property_manager_admin"],
  community_admin: ["board_president", "cam", "site_manager"],
  community_editor: ["board_member"],
  resident_owner: ["owner"],
  resident_tenant: ["tenant"],
} as const;
