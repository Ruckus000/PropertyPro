import {
  COMMUNITY_ROLES,
  COMMUNITY_TYPES,
  NEW_COMMUNITY_ROLES,
  type CommunityRole,
  type CommunityType,
  type NewCommunityRole,
} from './index';

export function isCommunityType(value: unknown): value is CommunityType {
  return typeof value === 'string' && (COMMUNITY_TYPES as readonly string[]).includes(value);
}

export function isCommunityRole(value: unknown): value is CommunityRole {
  return typeof value === 'string' && (COMMUNITY_ROLES as readonly string[]).includes(value);
}

export function isNewCommunityRole(value: unknown): value is NewCommunityRole {
  return typeof value === 'string' && (NEW_COMMUNITY_ROLES as readonly string[]).includes(value);
}
