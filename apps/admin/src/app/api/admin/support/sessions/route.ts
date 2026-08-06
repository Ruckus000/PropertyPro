/**
 * Support session management API.
 *
 * POST /api/admin/support/sessions — create a new support session
 * GET  /api/admin/support/sessions?communityId={id} — list sessions
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminTypedClient } from '@propertypro/db/supabase/admin';
import { signSupportToken } from '@/lib/support/jwt';
import { CreateSessionSchema, SUPPORT_SESSION_MAX_TTL_HOURS } from '@propertypro/shared';
import {
  buildSupportSessionCookie,
  resolveSupportCookieHostname,
} from '@propertypro/shared/http';
import { withAdminErrorHandler } from '@/lib/api/with-error-handler';
import { assertNoDbError } from '@/lib/api/assert-no-db-error';

const DAILY_SESSION_LIMIT = 10;

export const POST = withAdminErrorHandler(async (request: NextRequest) => {
  const admin = await requirePlatformAdmin();

  // Validate request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = CreateSessionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { communityId, targetUserId, reason, ticketId } = parsed.data;
  const db = createAdminTypedClient();

  // 1. Check consent
  const { data: consentRows, error: consentError } = await (db
    .from('support_consent_grants'))
    .select('id, access_level')
    .eq('community_id', communityId)
    .is('revoked_at', null)
    .limit(1);

  assertNoDbError(consentError, 'Failed to check support consent');

  if (!consentRows || consentRows.length === 0) {
    return NextResponse.json(
      {
        error: 'This community has not granted support access. Contact the community admin to enable it in Settings.',
      },
      { status: 403 },
    );
  }

  const consent = consentRows[0]!;

  // 2. Block impersonation of platform admins
  const { data: adminRow, error: adminLookupError } = await (db
    .from('platform_admin_users'))
    .select('user_id')
    .eq('user_id', targetUserId)
    .maybeSingle();

  assertNoDbError(adminLookupError, 'Failed to check platform-admin status of impersonation target');

  if (adminRow) {
    return NextResponse.json(
      { error: 'Cannot impersonate another platform admin' },
      { status: 403 },
    );
  }

  // 3. Enforce daily session limit
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const { count, error: countError } = await (db
    .from('support_sessions'))
    .select('id', { count: 'exact', head: true })
    .eq('admin_user_id', admin.id)
    .gte('created_at', todayStart.toISOString());

  assertNoDbError(countError, 'Failed to count support sessions created today');

  if ((count ?? 0) >= DAILY_SESSION_LIMIT) {
    return NextResponse.json(
      { error: `Daily session limit of ${DAILY_SESSION_LIMIT} reached.` },
      { status: 429 },
    );
  }

  // 4. Create session
  const expiresAt = new Date(Date.now() + SUPPORT_SESSION_MAX_TTL_HOURS * 3600 * 1000);

  const { data: session, error: insertError } = await (db
    .from('support_sessions'))
    .insert({
      admin_user_id: admin.id,
      target_user_id: targetUserId,
      community_id: communityId,
      reason,
      ticket_id: ticketId ?? null,
      access_level: 'read_only',
      expires_at: expiresAt.toISOString(),
      consent_id: consent.id,
    })
    .select('id')
    .single();

  if (insertError || !session) {
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
  }

  // 4b. Resolve the impersonated user's identity ONCE, to embed in the token.
  // The web middleware forwards identity headers to the page shell; carrying
  // the name/email here is what lets it stamp the impersonated user instead of
  // the admin, without adding a query to a per-request hot path. A failure to
  // read is not fatal: the claims go out null and the verifier clears the
  // identity headers, which degrades to an anonymous account menu rather than
  // showing the wrong person.
  const { data: targetUser } = await (db
    .from('users'))
    .select('full_name, email')
    .eq('id', targetUserId)
    .maybeSingle();

  // 5. Sign JWT with RFC 8693 act claim
  let token: string;
  try {
    token = await signSupportToken({
      sub: targetUserId,
      act: { sub: admin.id },
      community_id: communityId,
      session_id: session.id,
      scope: 'read_only',
      target_name: targetUser?.full_name ?? null,
      target_email: targetUser?.email ?? null,
    });
  } catch (err) {
    // signSupportToken throws when SUPPORT_SESSION_JWT_SECRET is missing or
    // too short. That message names the env var and its length rule — useful
    // in Sentry, not in a response. Rethrow for the wrapper.
    throw err;
  }

  // 6. Log to support_access_log
  await (db.from('support_access_log')).insert({
    admin_user_id: admin.id,
    community_id: communityId,
    session_id: session.id,
    event: 'session_started',
    metadata: { reason, target_user_id: targetUserId, ticket_id: ticketId },
  });

  // 7. Hand the token to the browser as an HttpOnly cookie — never in the body.
  //
  // The response body used to carry the raw JWT so the dialog could write it
  // with `document.cookie`. A cookie written that way cannot be HttpOnly, and
  // this one is scoped to the whole `.getpropertypro.com` tree, so any XSS on
  // any tenant subdomain could read a live impersonation token. Setting it here
  // keeps the token out of JavaScript entirely.
  //
  // Admin runs on a subdomain of the same root as the tenants, so it may set a
  // `Domain=.<root>` cookie that `<slug>.<root>` will send back — the client can
  // still just `window.open()` the tenant URL, unchanged.
  const response = NextResponse.json(
    { sessionId: session.id, expiresAt: expiresAt.toISOString() },
    { status: 201 },
  );
  response.cookies.set(
    buildSupportSessionCookie(resolveSupportCookieHostname(request), token),
  );
  return response;
});

export const GET = withAdminErrorHandler(async (request: NextRequest) => {
  await requirePlatformAdmin();

  const communityIdParam = request.nextUrl.searchParams.get('communityId');
  const db = createAdminTypedClient();

  let query = (db.from('support_sessions'))
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  if (communityIdParam) {
    const communityId = Number(communityIdParam);
    if (Number.isInteger(communityId) && communityId > 0) {
      query = query.eq('community_id', communityId);
    }
  }

  const { data, error } = await query;

  assertNoDbError(error, 'Failed to list support sessions');

  return NextResponse.json({ sessions: data ?? [] });
});
