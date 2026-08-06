import { z } from 'zod';

// --- Access Levels ---
export const SUPPORT_ACCESS_LEVELS = ['read_only', 'read_write'] as const;
export type SupportAccessLevel = (typeof SUPPORT_ACCESS_LEVELS)[number];

// --- Session End Reasons ---
export const SESSION_END_REASONS = ['manual', 'expired', 'consent_revoked'] as const;
export type SessionEndReason = (typeof SESSION_END_REASONS)[number];

// --- Session Constraints ---
export const SUPPORT_SESSION_MAX_TTL_HOURS = 0.5;
export const SUPPORT_SESSION_MAX_PER_ADMIN_PER_DAY = 10;

// NOTE: there is deliberately NO dev-secret constant here.
//
// Until 2026-08-05 this file exported `SUPPORT_SESSION_DEV_SECRET`, a literal
// checked into the repo, which BOTH the admin signer and the web verifier fell
// back to whenever `NODE_ENV !== 'production'`. Any deployment not explicitly
// started with NODE_ENV=production (preview, staging, a misconfigured
// container) would therefore ACCEPT a `pp-support-session` JWT that anyone
// could forge for any `sub` / `community_id` — full impersonation of any user
// in any community with no admin session at all.
//
// Both sides now require SUPPORT_SESSION_JWT_SECRET (min 32 chars)
// unconditionally and fail closed without it. Do not reintroduce a fallback:
// a hard-coded secret is a valid signing key everywhere it is compiled in.

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
  communityId: z.number().int().positive(),
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
  /**
   * Display name of the impersonated user, captured at session creation.
   *
   * The web middleware forwards the page shell's identity headers, and before
   * this claim existed it overrode only the user *id* during impersonation —
   * leaving the authenticating admin's name and email in place, so the chrome
   * showed the admin's identity over the impersonated user's data. Carrying the
   * name here means middleware can stamp the correct identity with **no extra
   * per-request query**: it is resolved once, when the session is signed.
   *
   * Optional because tokens issued before this claim existed are still valid
   * until they expire (≤30 min). Middleware treats a missing value as
   * "unknown" and CLEARS the identity headers rather than falling back to the
   * admin's — absent is safe, wrong is not.
   */
  target_name?: string | null;
  /** Email of the impersonated user. Same capture, same fallback rule. */
  target_email?: string | null;
  /** Expiration (unix timestamp) */
  exp: number;
  /** Issued at */
  iat: number;
}

// --- Impersonation Cookie ---
export const SUPPORT_SESSION_COOKIE = 'pp-support-session';

export function isLocalSupportHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)
  );
}

export function getSupportCookieRootDomain(hostname: string): string | null {
  if (isLocalSupportHostname(hostname)) {
    return null;
  }

  const parts = hostname.split('.').filter(Boolean);
  if (parts.length < 2) {
    return null;
  }

  return parts.slice(-2).join('.');
}
