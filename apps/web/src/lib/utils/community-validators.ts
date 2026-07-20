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

/**
 * v3 end state: accepts the v3 role set
 * (resident|property_manager|root_manager).
 */
export function requireCommunityRole(
  value: unknown,
  context: string,
): CommunityRole {
  if (!isCommunityRole(value)) {
    throw new DataIntegrityError(`Invalid community role (v3) in ${context}`, {
      context,
      value,
    });
  }

  return value;
}
