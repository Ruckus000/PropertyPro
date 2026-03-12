import {
  isCommunityRole,
  isCommunityType,
  isNewCommunityRole,
  type CommunityRole,
  type CommunityType,
  type NewCommunityRole,
} from '@propertypro/shared';
import { DataIntegrityError } from '@/lib/api/errors';

export function requireCommunityType(
  value: unknown,
  context: string,
): CommunityType {
  if (!isCommunityType(value)) {
    throw new DataIntegrityError(`Invalid community type in ${context}`, {
      context,
      value,
    });
  }

  return value;
}

export function requireCommunityRole(
  value: unknown,
  context: string,
): CommunityRole {
  if (!isCommunityRole(value)) {
    throw new DataIntegrityError(`Invalid community role in ${context}`, {
      context,
      value,
    });
  }

  return value;
}

export function requireNewCommunityRole(
  value: unknown,
  context: string,
): NewCommunityRole {
  if (!isNewCommunityRole(value)) {
    throw new DataIntegrityError(`Invalid community role (v2) in ${context}`, {
      context,
      value,
    });
  }

  return value;
}
