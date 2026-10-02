/**
 * Adding someone who is already a member is a conflict (409), not a malformed
 * request (400). Both add paths (POST /residents, POST /residents/invite)
 * check first and say so; this covers the race the check cannot — two
 * managers adding the same email at once — where the database's unique
 * constraints are the arbiter and would otherwise surface as a 500.
 */
import { ConflictError } from '@/lib/api/errors';
import { isNamedUniqueViolation } from '@/lib/db/postgres-error';

const MEMBER_CONSTRAINTS = ['users_email_unique', 'user_roles_user_community_unique'] as const;

export function duplicateMemberConflict(role?: unknown): ConflictError {
  return new ConflictError(
    typeof role === 'string'
      ? `User already has role "${role}" in this community.`
      : 'Someone with that email was just added to this community. Refresh to see them.',
  );
}

export async function withDuplicateMemberAsConflict<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (MEMBER_CONSTRAINTS.some((name) => isNamedUniqueViolation(error, name))) {
      throw duplicateMemberConflict();
    }
    throw error;
  }
}
