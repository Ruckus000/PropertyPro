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

const DAILY_SESSION_LIMIT = 10;

export async function POST(request: NextRequest) {
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

  if (consentError) {
    return NextResponse.json({ error: consentError.message }, { status: 500 });
  }

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

  if (adminLookupError) {
    return NextResponse.json({ error: adminLookupError.message }, { status: 500 });
  }

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

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }

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

  // 5. Sign JWT with RFC 8693 act claim
  let token: string;
  try {
    token = await signSupportToken({
      sub: targetUserId,
      act: { sub: admin.id },
      community_id: communityId,
      session_id: session.id,
      scope: 'read_only',
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to sign token' },
      { status: 500 },
    );
  }

  // 6. Log to support_access_log
  await (db.from('support_access_log')).insert({
    admin_user_id: admin.id,
    community_id: communityId,
    session_id: session.id,
    event: 'session_started',
    metadata: { reason, target_user_id: targetUserId, ticket_id: ticketId },
  });

  return NextResponse.json(
    { sessionId: session.id, token, expiresAt: expiresAt.toISOString() },
    { status: 201 },
  );
}

export async function GET(request: NextRequest) {
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

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ sessions: data ?? [] });
}
