import {
  isCommunityRole,
  isCommunityType,
  type CommunityRole,
  type CommunityType,
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
