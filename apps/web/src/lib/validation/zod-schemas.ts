/**
 * Centralized Zod schemas for shared validation primitives.
 *
 * P4-56: All user inputs to API routes must be validated via Zod schemas.
 * Route-specific schemas live alongside their routes; this module exposes
 * reusable primitives that multiple routes can import.
 *
 * Design rules:
 * - No `any` — all schemas are fully typed.
 * - Schemas are pure (no side effects).
 * - Each export documents the field it validates and why.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Primitive validators
// ---------------------------------------------------------------------------

/**
 * Positive integer — used for all database primary key fields (`id`, `communityId`, etc.).
 * Rejects floats, zero, and negative values.
 */
export const positiveIntSchema = z.number().int().positive();

/**
 * Non-empty string — used wherever an empty value is semantically invalid.
 */
export const nonEmptyStringSchema = z.string().min(1);

/**
 * ISO 8601 date string validator.
 * Rejects strings that do not parse to a valid Date.
 */
export const isoDateStringSchema = z
  .string()
  .refine((s) => !Number.isNaN(new Date(s).getTime()), 'Invalid ISO date string');

/**
 * Email address — basic format validation.
 */
export const emailSchema = z.string().email();

/**
 * Password — minimum 8 characters, maximum 72 (bcrypt limit).
 */
export const passwordSchema = z.string().min(8).max(72);

/**
 * UUID string — enforces RFC 4122 format for user/resource IDs.
 */
export const uuidSchema = z.string().uuid();

/**
 * Pagination cursor — non-negative integer offset.
 */
export const paginationOffsetSchema = z.number().int().min(0).default(0);

/**
 * Pagination limit — positive integer capped at 200 to prevent large result sets.
 */
export const paginationLimitSchema = z.number().int().positive().max(200).default(50);

// ---------------------------------------------------------------------------
// Composite schemas for query parameters
// ---------------------------------------------------------------------------

/**
 * Standard pagination query params shared across list endpoints.
 */
export const paginationQuerySchema = z.object({
  offset: paginationOffsetSchema,
  limit: paginationLimitSchema,
});

/**
 * Community-scoped query — every tenant-scoped endpoint requires communityId.
 */
export const communityQuerySchema = z.object({
  communityId: positiveIntSchema,
});

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type CommunityQuery = z.infer<typeof communityQuerySchema>;
