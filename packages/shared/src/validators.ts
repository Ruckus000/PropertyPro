import {
  COMMUNITY_ROLES,
  COMMUNITY_TYPES,
  type CommunityRole,
  type CommunityType,
} from './index';

export function isCommunityType(value: unknown): value is CommunityType {
  return typeof value === 'string' && (COMMUNITY_TYPES as readonly string[]).includes(value);
}

export function isCommunityRole(value: unknown): value is CommunityRole {
  return typeof value === 'string' && (COMMUNITY_ROLES as readonly string[]).includes(value);
}
