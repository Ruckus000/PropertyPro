import { z } from 'zod';

// --- Access Levels ---
export const SUPPORT_ACCESS_LEVELS = ['read_only', 'read_write'] as const;
export type SupportAccessLevel = (typeof SUPPORT_ACCESS_LEVELS)[number];

// --- Session End Reasons ---
export const SESSION_END_REASONS = ['manual', 'expired', 'consent_revoked'] as const;
export type SessionEndReason = (typeof SESSION_END_REASONS)[number];

// --- Session Constraints ---
export const SUPPORT_SESSION_MAX_TTL_HOURS = 1;
export const SUPPORT_SESSION_MAX_PER_ADMIN_PER_DAY = 10;

// --- Support Access Log Event Types ---
export const SUPPORT_ACCESS_EVENTS = [
  'session_started',
  'session_ended',
  'page_viewed',
  'consent_granted',
  'consent_revoked',
  'admin_data_viewed',
] as const;
export type SupportAccessEvent = (typeof SUPPORT_ACCESS_EVENTS)[number];

// --- Zod Schemas ---
export const CreateSessionSchema = z.object({
  targetUserId: z.string().uuid(),
  communityId: z.number().int().positive(),
  reason: z.string().min(10, 'Reason must be at least 10 characters').max(500),
  ticketId: z.string().max(100).optional(),
});

export const ConsentToggleSchema = z.object({
  enabled: z.boolean(),
});

// --- JWT Claims ---
export interface SupportSessionJwtPayload {
  /** Target user ID (who we're impersonating) */
  sub: string;
  /** Actor claim per RFC 8693 */
  act: { sub: string };
  /** Community being accessed */
  community_id: number;
  /** Support session row ID */
  session_id: number;
  /** Access level */
  scope: SupportAccessLevel;
  /** Expiration (unix timestamp) */
  exp: number;
  /** Issued at */
  iat: number;
}

// --- Impersonation Cookie ---
export const SUPPORT_SESSION_COOKIE = 'pp-support-session';
