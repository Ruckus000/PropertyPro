/**
 * Runtime-facing predicate facade.
 *
 * This is an import-surface boundary, not a type-safety boundary.
 * Keep the export surface intentionally small.
 */
export { and, asc, desc, eq, gte, gt, inArray, isNull, lte, notInArray, or, sql } from 'drizzle-orm';
