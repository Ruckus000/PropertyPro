/**
 * Audited account writes during a support (impersonation) session.
 *
 * Product decision (2026-09-29): during a support session the operator MAY
 * edit the impersonated user's profile, re-verify their phone, and cancel
 * their pending account deletion — and every such change must be on the
 * record. Middleware opens exactly those (method, path) pairs through a
 * `read_only` session (SUPPORT_WRITABLE_API_ROUTES in ./impersonation.ts);
 * each of the four handlers calls `recordSupportAction` BEFORE it performs
 * the change.
 *
 * ## Fail closed
 *
 * `recordSupportAction` either writes the row or throws. It never returns
 * normally under a support session without a row having landed, so a caller
 * that awaits it before mutating cannot make an unrecorded change:
 *   - the session's consented community is unreadable → 403 (the row's
 *     `community_id` is NOT NULL, and a guessed community would put the entry
 *     in front of the wrong managers);
 *   - the operator or session id is unreadable → 403 (an entry that cannot
 *     name who acted is not an audit entry);
 *   - the insert fails → 500 SUPPORT_AUDIT_FAILED, "not made".
 * Outside a support session it returns `false` and writes nothing, so the
 * routes behave exactly as they did.
 *
 * ## Where the record goes, and why only there
 *
 * `support_access_log` is the single record for these writes. It is the
 * support-specific trail both audiences already read — the community's
 * managers (settings → support access) and platform admins (admin console →
 * support → access log) — and it is keyed on the operator
 * (`admin_user_id`) and the session, which is exactly the question asked of
 * it. `compliance_audit_log` is deliberately NOT written here: these are
 * changes to a platform-level user account, not to any community's records
 * (the profile route has never written one, for that reason), and a second
 * write on a different client could not be made atomic with the first.
 * Every compliance row a support session DOES cause elsewhere is attributed
 * centrally instead — see `@propertypro/db/audit-actor`.
 *
 * ## PII
 *
 * `support_access_log` is append-only and manager-readable, so nothing in a
 * row can ever be redacted. Rows carry field NAMES plus before/after values
 * only where the reader could already see them: names in full (a manager
 * already sees every member's name in the resident directory), phone numbers
 * masked to their last four digits via `maskPhoneToLast4`, timestamps as
 * ISO strings. Never an OTP, a code, a token or a password.
 */
import { AppError } from '@/lib/api/errors/AppError';
import { ForbiddenError } from '@/lib/api/errors/ForbiddenError';
// AUTHZ: support_access_log has no RLS insert path for a session user; the row is written for the verified support session named by middleware-stamped headers (inbound x-support-* are stripped), for the impersonated user's own account only
import { createAdminTypedClient } from '@propertypro/db/supabase/admin';
import type { SupportWriteEvent } from '@propertypro/shared';
import { getSupportScope } from './support-scope';
import { supportAuditActorFromHeaders } from './audit-actor';

interface HeaderReader {
  get(name: string): string | null;
}

export interface SupportActionInput {
  event: SupportWriteEvent;
  /** The impersonated user whose account is being changed. */
  targetUserId: string;
  /** Names of the columns/fields the change touches. */
  changedFields: readonly string[];
  /** Prior values of the changed fields — already masked by the caller. */
  before?: Record<string, unknown>;
  /** New values of the changed fields — already masked by the caller. */
  after?: Record<string, unknown>;
}

export const SUPPORT_AUDIT_UNATTRIBUTABLE_MESSAGE =
  'This change cannot be made during this support session because it could not be attributed.';

export const SUPPORT_AUDIT_FAILED_MESSAGE =
  'This change could not be recorded in the support access log, so it was not made. Please try again.';

/**
 * Mask a phone number to its last four digits (`***1234`). Only digits survive,
 * so a free-text value cannot smuggle anything else into the log. Fewer than
 * four digits → `***`; null/empty → null (the field was, or became, unset).
 */
export function maskPhoneToLast4(phone: string | null | undefined): string | null {
  if (phone === null || phone === undefined) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 0 && phone.trim() === '') return null;
  if (digits.length < 4) return '***';
  return `***${digits.slice(-4)}`;
}

/**
 * Record a write the operator is about to make, or throw.
 *
 * @returns `false` when the request is not a support session (nothing
 *   written); `true` when the row landed. Under a support session it never
 *   returns `false`.
 */
export async function recordSupportAction(
  requestHeaders: HeaderReader,
  input: SupportActionInput,
): Promise<boolean> {
  const scope = getSupportScope(requestHeaders);
  if (scope === null) return false;

  const actor = supportAuditActorFromHeaders(requestHeaders)?.support ?? null;
  if (scope.communityId === null || actor === null || actor.sessionId === null || actor.adminUserId === null) {
    throw new ForbiddenError(SUPPORT_AUDIT_UNATTRIBUTABLE_MESSAGE);
  }

  const metadata: Record<string, unknown> = {
    changedFields: [...input.changedFields],
    before: input.before ?? {},
    after: input.after ?? {},
  };

  let insertError: unknown = null;
  try {
    const { error } = await createAdminTypedClient()
      .from('support_access_log')
      .insert({
        admin_user_id: actor.adminUserId,
        community_id: scope.communityId,
        session_id: actor.sessionId,
        event: input.event,
        resource_type: 'user',
        resource_id: input.targetUserId,
        metadata,
      });
    insertError = error ?? null;
  } catch (error) {
    insertError = error;
  }

  if (insertError !== null) {
    console.error('[support-audit] support_access_log insert failed; refusing the change', {
      event: input.event,
      sessionId: actor.sessionId,
      error: insertError,
    });
    throw new AppError(SUPPORT_AUDIT_FAILED_MESSAGE, 500, 'SUPPORT_AUDIT_FAILED');
  }

  return true;
}
