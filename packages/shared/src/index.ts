/**
 * Shared types and constants for PropertyPro Florida
 */

export const COMMUNITY_TYPES = ["condo_718", "hoa_720", "apartment"] as const;
export type CommunityType = (typeof COMMUNITY_TYPES)[number];

export const USER_ROLES = ["admin", "manager", "auditor", "resident"] as const;
export type UserRole = (typeof USER_ROLES)[number];
