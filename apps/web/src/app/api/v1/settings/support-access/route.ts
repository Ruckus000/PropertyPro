import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { requirePermission } from '@/lib/db/access-control';
import { ValidationError } from '@/lib/api/errors';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { ConsentToggleSchema } from '@propertypro/shared';
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { logAuditEvent } from '@propertypro/db';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();
  const communityId = resolveEffectiveCommunityId(req, null);

  const membership = await requireCommunityMembership(communityId, userId);
  requirePermission(membership, 'settings', 'read');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any;

  const [consentResult, accessLogResult] = await Promise.all([
    supabase
      .from('support_consent_grants')
      .select('*')
      .eq('community_id', communityId)
      .is('revoked_at', null)
      .maybeSingle(),
    supabase
      .from('support_access_log')
      .select('*')
      .eq('community_id', communityId)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  const consent = consentResult.data ?? null;
  const recentAccess = accessLogResult.data ?? [];

  return NextResponse.json({
    consentActive: consent !== null,
    consent,
    recentAccess,
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();
  const communityId = resolveEffectiveCommunityId(req, null);

  const membership = await requireCommunityMembership(communityId, userId);
  requirePermission(membership, 'settings', 'write');

  const body = await req.json();
  const parsed = ConsentToggleSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid request body');
  }

  const { enabled } = parsed.data;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any;

  if (enabled) {
    // Check if active consent already exists
    const { data: existing } = await supabase
      .from('support_consent_grants')
      .select('id')
      .eq('community_id', communityId)
      .is('revoked_at', null)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ ok: true });
    }

    // Insert new consent grant
    const { data: newConsent, error: insertError } = await supabase
      .from('support_consent_grants')
      .insert({
        community_id: communityId,
        granted_by: userId,
      })
      .select('id')
      .single();

    if (insertError || !newConsent) {
      throw new Error('Failed to create consent grant');
    }

    // Log to support_access_log
    await supabase.from('support_access_log').insert({
      community_id: communityId,
      event: 'consent_granted',
      admin_user_id: userId,
      metadata: { consent_id: newConsent.id },
    });

    // Log to compliance_audit_log
    await logAuditEvent({
      userId,
      action: 'support_consent_granted',
      resourceType: 'support_consent_grants',
      resourceId: String(newConsent.id),
      communityId,
      metadata: { consent_id: newConsent.id },
    });
  } else {
    // Find active consent
    const { data: activeConsent } = await supabase
      .from('support_consent_grants')
      .select('id')
      .eq('community_id', communityId)
      .is('revoked_at', null)
      .maybeSingle();

    if (!activeConsent) {
      return NextResponse.json({ ok: true });
    }

    // Revoke consent
    await supabase
      .from('support_consent_grants')
      .update({ revoked_at: new Date().toISOString(), revoked_by: userId })
      .eq('id', activeConsent.id);

    // Terminate active sessions
    await supabase
      .from('support_sessions')
      .update({
        ended_at: new Date().toISOString(),
        ended_reason: 'consent_revoked',
      })
      .eq('community_id', communityId)
      .is('ended_at', null);

    // Log to support_access_log
    await supabase.from('support_access_log').insert({
      community_id: communityId,
      event: 'consent_revoked',
      admin_user_id: userId,
      metadata: { consent_id: activeConsent.id },
    });

    // Log to compliance_audit_log
    await logAuditEvent({
      userId,
      action: 'support_consent_revoked',
      resourceType: 'support_consent_grants',
      resourceId: String(activeConsent.id),
      communityId,
      metadata: { consent_id: activeConsent.id },
    });
  }

  return NextResponse.json({ ok: true });
});
