/**
 * Support access consent — GET status + recent log; POST grant/revoke.
 *
 * Plan A1 drain #147. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for schemas and auth-chain rationale.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { requirePermission } from '@/lib/db/access-control';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { createAdminTypedClient } from '@propertypro/db/supabase/admin';
import { logAuditEvent } from '@propertypro/db';
import {
  supportAccessGetContract,
  supportAccessPostContract,
} from './contract';

export const GET = withErrorHandler(
  runRoute(supportAccessGetContract, async ({ query, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);

    const membership = await requireCommunityMembership(communityId, userId);
    requirePermission(membership, 'settings', 'read');

    const supabase = createAdminTypedClient();

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

    return {
      consentActive: consent !== null,
      consent,
      recentAccess,
    };
  }),
);

export const POST = withErrorHandler(
  runRoute(supportAccessPostContract, async ({ body, req }) => {
    const userId = await requireAuthenticatedUserId();

    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    const membership = await requireCommunityMembership(communityId, userId);
    requirePermission(membership, 'settings', 'write');

    const { enabled } = body;
    const supabase = createAdminTypedClient();

    if (enabled) {
      const { data: existing } = await supabase
        .from('support_consent_grants')
        .select('id')
        .eq('community_id', communityId)
        .is('revoked_at', null)
        .maybeSingle();

      if (existing) {
        return { ok: true as const };
      }

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

      await supabase.from('support_access_log').insert({
        community_id: communityId,
        event: 'consent_granted',
        admin_user_id: userId,
        metadata: { consent_id: newConsent.id },
      });

      await logAuditEvent({
        userId,
        action: 'support_consent_granted',
        resourceType: 'support_consent_grants',
        resourceId: String(newConsent.id),
        communityId,
        metadata: { consent_id: newConsent.id },
      });
    } else {
      const { data: activeConsent } = await supabase
        .from('support_consent_grants')
        .select('id')
        .eq('community_id', communityId)
        .is('revoked_at', null)
        .maybeSingle();

      if (!activeConsent) {
        return { ok: true as const };
      }

      await supabase
        .from('support_consent_grants')
        .update({ revoked_at: new Date().toISOString(), revoked_by: userId })
        .eq('id', activeConsent.id);

      await supabase
        .from('support_sessions')
        .update({
          ended_at: new Date().toISOString(),
          ended_reason: 'consent_revoked',
        })
        .eq('community_id', communityId)
        .is('ended_at', null);

      await supabase.from('support_access_log').insert({
        community_id: communityId,
        event: 'consent_revoked',
        admin_user_id: userId,
        metadata: { consent_id: activeConsent.id },
      });

      await logAuditEvent({
        userId,
        action: 'support_consent_revoked',
        resourceType: 'support_consent_grants',
        resourceId: String(activeConsent.id),
        communityId,
        metadata: { consent_id: activeConsent.id },
      });
    }

    return { ok: true as const };
  }),
);
