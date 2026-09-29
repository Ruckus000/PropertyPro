/**
 * Derive the request's audit actor from the middleware's support headers.
 *
 * Read ONCE per request by `withErrorHandler` and entered into the
 * `@propertypro/db/audit-actor` store, so every `compliance_audit_log` row the
 * route writes carries `metadata.support = { sessionId, adminUserId }`.
 *
 * Header trust: middleware strips every inbound `x-support-*` header
 * (FORWARDED_AUTH_HEADERS) and sets them only after the support cookie verifies
 * against a live `support_sessions` row, so their presence is authoritative.
 *
 * Pure: no DB, no Next request APIs — `withErrorHandler` hands it `req.headers`.
 */
import type { AuditActor } from '@propertypro/db/audit-actor';
import {
  SUPPORT_ADMIN_ID_HEADER,
  SUPPORT_SESSION_ID_HEADER,
} from '@/lib/request/forwarded-headers';

interface HeaderReader {
  get(name: string): string | null;
}

/**
 * `null` when the request is not a support session — the same test
 * `getSupportScope` uses (`x-support-session-id` present).
 *
 * When the session header IS present but a value is unreadable, the actor is
 * still returned with that field null: a row flagged as support-driven with an
 * unknown operator is honest, whereas dropping the marker would make an
 * operator's action look like the impersonated user's own.
 */
export function supportAuditActorFromHeaders(requestHeaders: HeaderReader): AuditActor | null {
  const rawSessionId = requestHeaders.get(SUPPORT_SESSION_ID_HEADER);
  if (!rawSessionId) return null;

  const parsedSessionId = Number(rawSessionId);
  const sessionId =
    Number.isSafeInteger(parsedSessionId) && parsedSessionId > 0 ? parsedSessionId : null;
  const adminUserId = requestHeaders.get(SUPPORT_ADMIN_ID_HEADER)?.trim() || null;

  return { support: { sessionId, adminUserId } };
}
