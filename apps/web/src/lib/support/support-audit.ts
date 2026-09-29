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
 * Those errors reach the client only if the caller lets them propagate to
 * `withErrorHandler`. A call made inside a route's own `try` whose `catch`
 * maps everything to a generic response (phone/verify/confirm's
 * "Verification check failed") would still fail closed but would hide WHY;
 * such a `catch` must rethrow when `isSupportAuditError(error)` is true.
 *
 * A row is written BEFORE its change, so it records that the operator
 * REQUESTED the change — the change itself can still fail afterwards. The
 * log's labels say "requested" for that reason (packages/shared
 * support-access.ts).
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

/**
 * One shape for every support-write row's `metadata`:
 *
 *   { changedFields, before, after[, target] }
 *
 * - `changedFields` names the fields the action changes (may be `[]` when the
 *   operator submitted values identical to the current ones).
 * - `before` / `after` are keyed ONLY by names in `changedFields`. `after`
 *   omits a value the server decides at write time or by outcome (a timestamp
 *   stamped as `now`, an attempt counter that a wrong code bumps and a right
 *   one resets) rather than guessing it.
 * - `target` identifies what the action is aimed at without being a changed
 *   field: the masked number an SMS goes to or a code is checked against, the
 *   deletion request being cancelled. Omitted when there is none.
 */
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
  /** What the action is aimed at, when that is not a changed field — already masked. */
  target?: Record<string, unknown>;
}

export const SUPPORT_AUDIT_UNATTRIBUTABLE_MESSAGE =
  'This change cannot be made during this support session because it could not be attributed.';

export const SUPPORT_AUDIT_FAILED_MESSAGE =
  'This change could not be recorded in the support access log, so it was not made. Please try again.';

export const SUPPORT_AUDIT_FAILED_CODE = 'SUPPORT_AUDIT_FAILED';

/**
 * Every error `recordSupportAction` throws, by identity. A registry rather than
 * a subclass so the wire shapes stay exactly the shared `ForbiddenError` /
 * `AppError` ones, and rather than a message/code match so an unrelated 403
 * thrown in the same `try` is never mistaken for an audit refusal.
 */
const supportAuditErrors = new WeakSet<object>();

function supportAuditError<E extends Error>(error: E): E {
  supportAuditErrors.add(error);
  return error;
}

/**
 * True when `error` was thrown by `recordSupportAction` — the change was
 * refused because it could not be recorded. A route `catch` that otherwise
 * maps errors to a generic response must rethrow these, so the client sees
 * the refusal (403, or 500 `SUPPORT_AUDIT_FAILED`) and not a misleading
 * generic failure.
 */
export function isSupportAuditError(error: unknown): error is AppError {
  return typeof error === 'object' && error !== null && supportAuditErrors.has(error);
}

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
    throw supportAuditError(new ForbiddenError(SUPPORT_AUDIT_UNATTRIBUTABLE_MESSAGE));
  }

  const metadata: Record<string, unknown> = {
    changedFields: [...input.changedFields],
    before: input.before ?? {},
    after: input.after ?? {},
    ...(input.target === undefined ? {} : { target: input.target }),
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
    throw supportAuditError(new AppError(SUPPORT_AUDIT_FAILED_MESSAGE, 500, SUPPORT_AUDIT_FAILED_CODE));
  }

  return true;
}
