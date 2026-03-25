/**
 * Support session instance API.
 *
 * PATCH /api/admin/support/sessions/[id] — end a support session
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminClient } from '@propertypro/db/supabase/admin';

// Supabase untyped client — support tables are not yet in generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQuery = any;

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(_request: NextRequest, { params }: RouteParams) {
  const admin = await requirePlatformAdmin();
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
  }

  const db = createAdminClient();

  const { data: session, error: updateError } = await (db
    .from('support_sessions') as AnyQuery)
    .update({
      ended_at: new Date().toISOString(),
      ended_reason: 'manual',
    })
    .eq('id', id)
    .is('ended_at', null)
    .select('id, community_id')
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (!session) {
    return NextResponse.json(
      { error: 'Session not found or already ended' },
      { status: 404 },
    );
  }

  // Log session end
  await (db.from('support_access_log') as AnyQuery).insert({
    session_id: id,
    community_id: session.community_id,
    admin_id: admin.id,
    event: 'session_ended',
    metadata: { ended_reason: 'manual' },
  });

  return NextResponse.json({ ok: true });
}
