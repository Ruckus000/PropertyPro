/**
 * Detect a Postgres unique-violation (23505) against a NAMED constraint.
 *
 * Deliberately its own module with no imports. It began as a private helper in
 * `lib/auth/signup.ts`, but that file pulls in `@propertypro/email`, the
 * Supabase admin client and the DB — so importing it from
 * `provisioning-service.ts` would have dragged that whole graph into every test
 * that touches provisioning, for twenty lines of pure predicate.
 *
 * Matching on the constraint NAME rather than on 23505 alone is the point: a
 * caller wants "did THIS index reject the write", not "was some uniqueness
 * violated". Both `constraint` and `constraint_name` are checked because
 * driver versions disagree on which they populate.
 */
export function isUniqueConstraintError(error: unknown, constraintName: string): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as {
    code?: string;
    constraint?: string;
    constraint_name?: string;
    message?: string;
  };

  if (candidate.code !== '23505') {
    return false;
  }

  return (
    candidate.constraint === constraintName || candidate.constraint_name === constraintName
  );
}
