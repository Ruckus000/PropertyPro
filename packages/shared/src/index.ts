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

// Re-export core role/community-type constants from roles.ts
// (extracted to break circular dependency with rbac-matrix.ts)
export {
  COMMUNITY_TYPES,
  type CommunityType,
  COMMUNITY_ROLES,
  type CommunityRole,
  USER_ROLES,
  type UserRole,
  ROLE_COMMUNITY_CONSTRAINTS,
  PERMISSION_PROFILE_MAP,
} from './roles';

export * from './branding';
export * from './compliance/templates';
export * from './access-policies';
export * from './features';
export * from './middleware/reserved-subdomains';
export * from './middleware/subdomain-router';
export * from './validators';
export * from './rbac-matrix';
