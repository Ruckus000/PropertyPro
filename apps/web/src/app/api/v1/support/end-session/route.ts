/**
 * POST /api/v1/support/end-session
 *
 * Ends the support-impersonation session identified by the caller's
 * `pp-support-session` cookie, and clears that cookie.
 *
 * ## Why this route exists
 *
 * The "End Session" control in `SupportBanner` used to clear the cookie with
 * `document.cookie`. That stopped being possible when the cookie became
 * HttpOnly — but it was also incomplete: clearing the browser cookie left the
 * `support_sessions` row OPEN, so the session still counted against the
 * admin's daily limit, still read as active in the audit trail, and would have
 * resumed if the cookie were restored. Only the admin console's
 * `PATCH /api/admin/support/sessions/[id]` ever closed the row.
 *
 * This route does both: closes the row and clears the cookie.
 *
 * ## Authorization
 *
 * The cookie IS the credential. A caller can only end a session whose signed
 * token they already hold, so there is no additional check to make — and
 * notably no way to end someone else's session. An absent or unverifiable
 * cookie is not an error: the response still clears the cookie and reports
 * success, so a stale tab cannot get stuck showing the banner.
 *
 * Middleware exempts `/api/v1/support/` from the read-only mutation block, so
 * this POST is reachable from inside a `read_only` session — which is the only
 * kind that exists today.
 */
import { type NextRequest, NextResponse } from 'next/server';
import { SUPPORT_SESSION_COOKIE } from '@propertypro/shared';
import {
  buildSupportSessionClearCookie,
  resolveSupportCookieHostname,
} from '@propertypro/shared/http';
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { withErrorHandler } from '@/lib/api/error-handler';
import { parseImpersonationCookie } from '@/lib/support/impersonation';

/**
 * Read one cookie off the standard `Cookie` header.
 *
 * Deliberately not `NextRequest.cookies` — the value is an opaque JWT
 * (base64url segments and dots, none of which need decoding), and reading the
 * header keeps this handler a plain `Request` consumer.
 */
function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${name}=`)) {
      return trimmed.slice(name.length + 1);
    }
  }
  return undefined;
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  const cookieValue = readCookie(request.headers.get('cookie'), SUPPORT_SESSION_COOKIE);
  const payload = await parseImpersonationCookie(cookieValue);

  if (payload) {
    try {
      // Authorization contract: the caller proved possession of a validly
      // signed support token for this exact session_id, which is the only
      // credential that grants the session in the first place. The
      // service-role write is scoped to that one row and only ever CLOSES it.
      const db = createAdminClient();

      // `.is('ended_at', null)` keeps this idempotent — a double-click, or a
      // session the admin console already closed, updates zero rows instead of
      // overwriting the original end time and reason.
      const { data: closed } = await db
        .from('support_sessions')
        .update({ ended_at: new Date().toISOString(), ended_reason: 'manual' })
        .eq('id', payload.session_id)
        .is('ended_at', null)
        .select('id');

      if (closed && closed.length > 0) {
        await db.from('support_access_log').insert({
          admin_user_id: payload.act.sub,
          community_id: payload.community_id,
          session_id: payload.session_id,
          event: 'session_ended',
          metadata: { ended_by: 'impersonated_user', ended_reason: 'manual' },
        });
      }
    } catch (error) {
      // Never block the cookie clear on a bookkeeping failure. Leaving the
      // operator trapped in an impersonated session because an audit insert
      // failed is strictly worse than a row that the expiry sweep will close
      // within 30 minutes anyway.
      console.error('[support] Failed to close support session row:', error);
    }
  }

  const response = NextResponse.json({ data: { ended: true } });
  response.cookies.set(
    buildSupportSessionClearCookie(resolveSupportCookieHostname(request)),
  );
  return response;
});
