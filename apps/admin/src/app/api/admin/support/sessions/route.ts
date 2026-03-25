/**
 * Support session management API.
 *
 * POST /api/admin/support/sessions — create a new support session
 * GET  /api/admin/support/sessions?communityId={id} — list sessions
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { signSupportToken } from '@/lib/support/jwt';
import { CreateSessionSchema } from '@propertypro/shared';

// Supabase untyped client — support tables are not yet in generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQuery = any;

const DAILY_SESSION_LIMIT = 10;
const SESSION_DURATION_MS = 60 * 60 * 1000; // 1 hour

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

  const { communityId, targetUserId, reason } = parsed.data;
  const db = createAdminClient();

  // Check consent: support_consent_grants for this community must be active
  const { data: consentRows, error: consentError } = await (db
    .from('support_consent_grants') as AnyQuery)
    .select('id')
    .eq('community_id', communityId)
    .is('revoked_at', null)
    .limit(1);

  if (consentError) {
    return NextResponse.json({ error: consentError.message }, { status: 500 });
  }

  if (!consentRows || consentRows.length === 0) {
    return NextResponse.json(
      {
        error: 'No active consent grant found for this community. The community must grant support access before a session can be created.',
      },
      { status: 403 },
    );
  }

  // Block impersonation of platform admins
  const { data: adminRow, error: adminLookupError } = await (db
    .from('platform_admin_users') as AnyQuery)
    .select('user_id')
    .eq('user_id', targetUserId)
    .maybeSingle();

  if (adminLookupError) {
    return NextResponse.json({ error: adminLookupError.message }, { status: 500 });
  }

  if (adminRow) {
    return NextResponse.json(
      { error: 'Impersonation of platform admins is not permitted.' },
      { status: 403 },
    );
  }

  // Enforce daily session limit per admin
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const { count, error: countError } = await (db
    .from('support_sessions') as AnyQuery)
    .select('id', { count: 'exact', head: true })
    .eq('created_by', admin.id)
    .gte('created_at', todayStart.toISOString());

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }

  if ((count ?? 0) >= DAILY_SESSION_LIMIT) {
    return NextResponse.json(
      { error: `Daily session limit of ${DAILY_SESSION_LIMIT} reached for this admin.` },
      { status: 429 },
    );
  }

  // Create the session row
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);

  const { data: session, error: insertError } = await (db
    .from('support_sessions') as AnyQuery)
    .insert({
      community_id: communityId,
      target_user_id: targetUserId,
      created_by: admin.id,
      reason,
      expires_at: expiresAt.toISOString(),
    })
    .select('id')
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Sign JWT
  let token: string;
  try {
    token = await signSupportToken({
      sessionId: session.id,
      adminId: admin.id,
      communityId,
      targetUserId,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to sign token' },
      { status: 500 },
    );
  }

  // Log to support_access_log
  await (db.from('support_access_log') as AnyQuery).insert({
    session_id: session.id,
    community_id: communityId,
    admin_id: admin.id,
    event: 'session_started',
    metadata: { reason, target_user_id: targetUserId },
  });

  return NextResponse.json(
    { sessionId: session.id, token, expiresAt: expiresAt.toISOString() },
    { status: 201 },
  );
}

export async function GET(request: NextRequest) {
  await requirePlatformAdmin();

  const communityId = request.nextUrl.searchParams.get('communityId');
  const db = createAdminClient();

  let query = (db.from('support_sessions') as AnyQuery)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  if (communityId) {
    query = query.eq('community_id', Number(communityId));
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ sessions: data ?? [] });
}
