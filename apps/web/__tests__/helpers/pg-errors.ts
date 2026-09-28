import { DrizzleQueryError } from 'drizzle-orm';

/**
 * A unique violation in the shape application code actually catches.
 *
 * drizzle wraps every failed query in `DrizzleQueryError`, with the postgres-js
 * error (code + constraint_name) on `.cause` and NO top-level `code` — pinned
 * against a real database by
 * `__tests__/integration/postgres-error-shape.integration.test.ts`. A fixture
 * built as `Object.assign(new Error(), { code: '23505' })` is a shape the driver
 * never produces, and is how a dead top-level-only predicate stayed green.
 */
export function drizzleUniqueViolation(constraintName: string): DrizzleQueryError {
  const pgError = Object.assign(
    new Error(`duplicate key value violates unique constraint "${constraintName}"`),
    { code: '23505', constraint_name: constraintName },
  );
  return new DrizzleQueryError('insert into "t" values ($1)', [1], pgError);
}
