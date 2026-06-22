import {
  isCommunityRole,
  isCommunityType,
  TRANSITION_ROLES,
  type CommunityRole,
  type CommunityType,
  type TransitionRole,
} from '@propertypro/shared';
import { DataIntegrityError } from '@/lib/api/errors';

function isTransitionRole(value: unknown): value is TransitionRole {
  return typeof value === 'string' && (TRANSITION_ROLES as readonly string[]).includes(value);
}

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

/**
 * v3 end state: accepts the v3 role set
 * (resident|property_manager|root_manager).
 */
export function requireNewCommunityRole(
  value: unknown,
  context: string,
): TransitionRole {
  if (!isTransitionRole(value)) {
    throw new DataIntegrityError(`Invalid community role (v3) in ${context}`, {
      context,
      value,
    });
  }

  return value;
}
