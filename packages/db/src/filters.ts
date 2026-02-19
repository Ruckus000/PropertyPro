/**
 * Runtime-facing predicate facade.
 *
 * This is an import-surface boundary, not a type-safety boundary.
 * Keep the export surface intentionally small.
 */
export { and, eq, notInArray, or, isNull, gt, sql, lte, inArray } from 'drizzle-orm';
