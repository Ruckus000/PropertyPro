/**
 * Runtime-facing predicate facade.
 *
 * This is an import-surface boundary, not a type-safety boundary.
 * Keep the export surface intentionally small.
 */
export { type SQL, and, asc, desc, eq, gte, gt, ilike, inArray, isNotNull, isNull, like, lt, lte, ne, notInArray, or, sql } from 'drizzle-orm';
