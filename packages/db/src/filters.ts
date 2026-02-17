/**
 * Runtime-facing predicate facade.
 *
 * This is an import-surface boundary, not a type-safety boundary.
 * Keep the export surface intentionally small.
 */
export { and, eq, notInArray, or, isNull, gt, sql } from 'drizzle-orm';
